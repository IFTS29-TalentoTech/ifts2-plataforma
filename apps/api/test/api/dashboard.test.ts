import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createNotice } from '../helpers/factories';
import { createExamCallRow, createSocialPostRow, createTermRow } from '../helpers/social-factories';

let t: TestApp;
const url = '/api/v1/dashboard';
const day = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeEach(async () => {
  await resetDb();
  t = await createTestApp({ useRealIntegrationResolution: true });
});

describe('GET /dashboard: permisos', () => {
  it('401 sin sesión', async () => {
    expect((await request(t.app).get(url)).status).toBe(401);
  });
  it('lo ven los tres roles', async () => {
    for (const role of ['ADMIN', 'BEDELIA', 'EDITOR'] as const) {
      const { cookie } = await loginAs(t.app, role);
      expect((await request(t.app).get(url).set('Cookie', cookie)).status).toBe(200);
    }
  });
});

describe('GET /dashboard: contenido', () => {
  it('base vacía: ceros, sin ciclo ni llamado, Instagram en demostración', async () => {
    const { cookie } = await loginAs(t.app, 'EDITOR');
    const res = await request(t.app).get(url).set('Cookie', cookie);
    expect(res.body).toMatchObject({
      instagram: { mode: 'demo', status: 'demo', ok: true, lastSyncAt: null },
      pendingPosts: 0,
      activeNotices: 0,
      noticesExpiringIn7Days: 0,
      currentTerm: null,
      examCallNext: null,
    });
    expect(res.body.instagram.error).toBeUndefined();
    expect(res.body.ingresoCycle).toEqual({ year: new Date().getUTCFullYear() + 1, derived: true });
  });

  it('cuenta publicaciones pendientes, avisos activos y por vencer usando las reglas de vigencia', async () => {
    const { cookie } = await loginAs(t.app, 'BEDELIA');
    await createSocialPostRow({ status: 'DETECTED' });
    await createSocialPostRow({ status: 'DETECTED' });
    await createSocialPostRow({ status: 'DISCARDED' });
    await createSocialPostRow({ status: 'LINKED' });
    await createNotice({ title: 'Vigente sin fin' });
    await createNotice({ title: 'Vence en 3 días', visibleUntil: day(3) });
    await createNotice({ title: 'Vence en 30 días', visibleUntil: day(30) });
    await createNotice({ title: 'Vencido', visibleUntil: day(-1) });
    await createNotice({ title: 'Pausado', status: 'PAUSED' });
    await createNotice({ title: 'Futuro', visibleFrom: day(5) });
    const res = await request(t.app).get(url).set('Cookie', cookie);
    expect(res.body.pendingPosts).toBe(2);
    expect(res.body.activeNotices).toBe(3);
    expect(res.body.noticesExpiringIn7Days).toBe(1);
  });

  it('muestra el ciclo vigente y el próximo llamado a examen (no los pasados)', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const term = await createTermRow({ year: 2026, kind: 'SECOND', publicCurrent: true });
    await createTermRow({ year: 2026, kind: 'FIRST', publicCurrent: false });
    await createExamCallRow(term.id, { name: 'Pasado', startsOn: day(-20), endsOn: day(-18) });
    await createExamCallRow(term.id, { name: 'Lejano', startsOn: day(40), endsOn: day(42) });
    await createExamCallRow(term.id, { name: 'Próximo', startsOn: day(7), endsOn: day(9) });
    const res = await request(t.app).get(url).set('Cookie', cookie);
    expect(res.body.currentTerm).toMatchObject({
      year: 2026,
      kind: 'SECOND',
      label: '2.º cuatrimestre 2026',
    });
    expect(res.body.examCallNext).toMatchObject({ name: 'Próximo', published: true });
    expect(res.body.ingresoCycle).toEqual({ year: 2027, derived: true });
  });

  it('Instagram real: refleja último estado, error y vencimiento del token, sin secretos', async () => {
    const { cookie } = await loginAs(t.app, 'EDITOR');
    const expires = day(20);
    await t.ctx.integrations.set('instagram', {
      mode: 'real',
      appId: '123456',
      appSecret: 'secreto-xyz',
      accessToken: 'IGAA-token-secreto',
      tokenExpiresAt: expires.toISOString(),
    });
    await testPrisma.instagramToken.create({
      data: { id: 1, tokenEnc: '', expiresAt: expires, lastSyncAt: new Date(), lastSyncOk: true },
    });
    const ok = await request(t.app).get(url).set('Cookie', cookie);
    expect(ok.body.instagram).toMatchObject({ mode: 'real', status: 'connected', ok: true });
    expect(ok.body.instagram.lastSyncAt).toBeTruthy();
    expect(new Date(ok.body.instagram.tokenExpiresAt).getTime()).toBe(expires.getTime());

    await t.ctx.integrations.patch('instagram', {
      lastError: 'Instagram respondió con un error (500).',
    });
    const bad = await request(t.app).get(url).set('Cookie', cookie);
    expect(bad.body.instagram).toMatchObject({
      ok: false,
      status: 'error',
      error: 'Instagram respondió con un error (500).',
    });
    const raw = JSON.stringify(bad.body);
    expect(raw).not.toContain('IGAA-token-secreto');
    expect(raw).not.toContain('secreto-xyz');
  });

  it('cuenta real sin conectar: ok=false con motivo', async () => {
    const { cookie } = await loginAs(t.app, 'EDITOR');
    await t.ctx.integrations.set('instagram', { mode: 'real', appId: '1', appSecret: 'x' });
    const res = await request(t.app).get(url).set('Cookie', cookie);
    expect(res.body.instagram).toMatchObject({
      status: 'credentials_saved',
      ok: false,
      error: 'Falta conectar la cuenta de Instagram.',
    });
  });
});
