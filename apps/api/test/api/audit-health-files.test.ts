import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { audit } from '../../src/modules/audit/audit.service';
import { loginAs } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
});

describe('GET /audit', () => {
  it('401 sin sesión; 403 para BEDELIA y EDITOR', async () => {
    expect((await request(t.app).get('/api/v1/audit')).status).toBe(401);
    for (const role of ['BEDELIA', 'EDITOR'] as const) {
      const { cookie } = await loginAs(t.app, role);
      expect((await request(t.app).get('/api/v1/audit').set('Cookie', cookie)).status).toBe(403);
    }
  });

  it('ADMIN lista registros, filtra por entidad y pagina', async () => {
    const { cookie, user } = await loginAs(t.app, 'ADMIN');
    await audit.log(testPrisma, { userId: user.id, action: 'notice.create', entity: 'Notice', entityId: 'n1', detail: { title: 'x' } });
    await audit.log(testPrisma, { userId: user.id, action: 'notice.delete', entity: 'Notice', entityId: 'n1' });
    await audit.log(testPrisma, { userId: user.id, action: 'document.archive', entity: 'Document', entityId: 'd1' });

    const all = await request(t.app).get('/api/v1/audit?pageSize=2').set('Cookie', cookie);
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.total).toBeGreaterThanOrEqual(4); // incluye el login del admin
    const notices = await request(t.app).get('/api/v1/audit?entity=Notice').set('Cookie', cookie);
    expect(notices.body.total).toBe(2);
    expect(notices.body.items[0]).toMatchObject({ entity: 'Notice', user: { id: user.id, role: 'ADMIN' } });
    expect((await request(t.app).get('/api/v1/audit?pageSize=500').set('Cookie', cookie)).status).toBe(400);
  });

  it('audit.fromReq toma el usuario de la sesión', async () => {
    const e = await audit.log(testPrisma, { action: 'x.y', entity: 'X' });
    expect(e.userId).toBeNull();
  });
});

describe('GET /health', () => {
  it('responde API y base, y el proveedor activo de cada integración sin secretos', async () => {
    const res = await request(t.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      api: 'ok',
      db: 'ok',
      integrations: { storage: 'memory', mailer: 'fake', instagram: 'fake' },
      demoMode: true,
    });
    expect((await request(t.app).get('/api/v1/health')).status).toBe(200);
  });
  it('con resolución real y sin configuración: consola + Instagram de demostración', async () => {
    const real = await createTestApp({ useRealIntegrationResolution: true });
    const res = await request(real.app).get('/health');
    expect(res.body.integrations).toMatchObject({ mailer: 'console', instagram: 'fake' });
    expect(res.body.demoMode).toBe(true);
  });
});

describe('GET /files (almacenamiento local firmado)', () => {
  it('404 si el almacenamiento activo no es local', async () => {
    const res = await request(t.app).get('/api/v1/files/files/a.pdf?exp=1&sig=x');
    expect(res.status).toBe(404);
  });
});
