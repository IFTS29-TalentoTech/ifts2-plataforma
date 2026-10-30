import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { SETTING_KEYS } from '@ifts2/shared';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs, type LoggedIn } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createLinkRow, createSectionRow } from '../helpers/academic-factories';

let t: TestApp;
let admin: LoggedIn;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  admin = await loginAs(t.app, 'ADMIN');
});

const as = (c: string) => ({
  get: (u: string) => request(t.app).get(u).set('Cookie', c),
  put: (u: string, b: object = {}) => request(t.app).put(u).set('Cookie', c).send(b),
  post: (u: string, b: object = {}) => request(t.app).post(u).set('Cookie', c).send(b),
  patch: (u: string, b: object = {}) => request(t.app).patch(u).set('Cookie', c).send(b),
  del: (u: string) => request(t.app).delete(u).set('Cookie', c),
});

describe('/settings', () => {
  it('GET: 401 sin sesión; cualquier rol del panel lee; todas las claves, null si faltan', async () => {
    expect((await request(t.app).get('/api/v1/settings')).status).toBe(401);
    for (const role of ['BEDELIA', 'EDITOR', 'ADMIN'] as const) {
      const u = await loginAs(t.app, role);
      const res = await as(u.cookie).get('/api/v1/settings');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual([...SETTING_KEYS].sort());
      expect(res.body.phone).toBeNull();
      expect(res.body.exam_enrollment_open).toBe(false);
    }
  });

  it('PUT: solo ADMIN (403 BEDELIA/EDITOR, 401 anónimo)', async () => {
    expect((await request(t.app).put('/api/v1/settings').send({ phone: '1' })).status).toBe(401);
    for (const role of ['BEDELIA', 'EDITOR'] as const) {
      const u = await loginAs(t.app, role);
      expect((await as(u.cookie).put('/api/v1/settings', { phone: '4638-5656' })).status).toBe(403);
    }
  });

  it('PUT guarda parcialmente, normaliza el hashtag, tipa el booleano y audita solo las claves', async () => {
    const res = await as(admin.cookie).put('/api/v1/settings', {
      institution_name: 'Instituto de Prueba',
      institution_short: 'IDP',
      phone: '4000-0000',
      email_institutional: 'Contacto@Prueba.EDU',
      instagram_hashtag: 'miInstituto',
      exam_enrollment_open: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      institution_name: 'Instituto de Prueba',
      phone: '4000-0000',
      email_institutional: 'contacto@prueba.edu',
      instagram_hashtag: '#miInstituto',
      exam_enrollment_open: true,
      address: null,
    });
    // segunda llamada parcial: no pisa lo anterior
    const res2 = await as(admin.cookie).put('/api/v1/settings', { address: 'Calle 1' });
    expect(res2.body).toMatchObject({
      address: 'Calle 1',
      phone: '4000-0000',
      exam_enrollment_open: true,
    });
    const logs = await testPrisma.auditLog.findMany({
      where: { action: 'settings.update' },
      orderBy: { at: 'asc' },
    });
    expect(logs).toHaveLength(2);
    expect(logs[1]!.detail).toEqual({ keys: ['address'] });
    expect(JSON.stringify(logs)).not.toContain('4000-0000');
  });

  it('PUT valida con mensajes claros: vacío, claves desconocidas, correo, hashtag, URL', async () => {
    const put = (b: object) => as(admin.cookie).put('/api/v1/settings', b);
    expect((await put({})).status).toBe(400);
    expect((await put({ inventada: 'x' })).status).toBe(400);
    let res = await put({
      email_bedelia: 'no-es-correo',
      instagram_url: 'ftp://x',
      instagram_hashtag: 'a b',
      phone: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.email_bedelia[0]).toMatch(/formato válido/);
    expect(res.body.errors.instagram_url[0]).toMatch(/http/);
    expect(res.body.errors.instagram_hashtag[0]).toMatch(/hashtag/);
    expect(res.body.errors.phone[0]).toBe('El teléfono es obligatorio.');
  });
});

describe('/content', () => {
  it('solo ADMIN; lista por página incluyendo ocultas', async () => {
    await createSectionRow({ page: 'carrera', slug: 'b', order: 2 });
    await createSectionRow({ page: 'carrera', slug: 'a', order: 1 });
    await createSectionRow({ page: 'carrera', slug: 'oculta', order: 3, visible: false });
    await createSectionRow({ page: 'ingreso', slug: 'otra' });
    expect((await request(t.app).get('/api/v1/content/carrera')).status).toBe(401);
    const bedelia = await loginAs(t.app, 'BEDELIA');
    expect((await as(bedelia.cookie).get('/api/v1/content/carrera')).status).toBe(403);
    expect(
      (await as(bedelia.cookie).put('/api/v1/content/carrera/x', { title: 'x', body: 'y' })).status,
    ).toBe(403);

    const res = await as(admin.cookie).get('/api/v1/content/carrera');
    expect(res.body.page).toBe('carrera');
    expect(res.body.items.map((s: { slug: string }) => s.slug)).toEqual(['a', 'b', 'oculta']);
    expect(res.body.items[0]).toEqual({
      id: expect.any(String),
      page: 'carrera',
      slug: 'a',
      title: expect.any(String),
      body: expect.any(String),
      order: 1,
      visible: true,
    });
    expect((await as(admin.cookie).get('/api/v1/content/inventada')).status).toBe(400);
  });

  it('PUT crea (201) y reemplaza (200), sanitiza el Markdown y audita', async () => {
    const dirty =
      'Hola <script>alert(1)</script>**mundo** <b>x</b> [ok](https://a.test) [mal](javascript:alert(1)) ![img](http://x/y.png)';
    const created = await as(admin.cookie).put('/api/v1/content/institucional/mision', {
      title: 'Misión',
      body: dirty,
      order: 2,
    });
    expect(created.status).toBe(201);
    expect(created.body.body).toBe('Hola **mundo** x [ok](https://a.test) mal img');
    expect(created.body).toMatchObject({
      page: 'institucional',
      slug: 'mision',
      order: 2,
      visible: true,
    });

    const updated = await as(admin.cookie).put('/api/v1/content/institucional/mision', {
      title: 'Misión 2',
      body: 'Nuevo',
      visible: false,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: created.body.id, title: 'Misión 2', visible: false });
    expect(await testPrisma.contentSection.count()).toBe(1);
    expect(await testPrisma.auditLog.count({ where: { action: 'content.create' } })).toBe(1);
    expect(await testPrisma.auditLog.count({ where: { action: 'content.update' } })).toBe(1);
  });

  it('valida slug, título y página', async () => {
    const put = (path: string, b: object) => as(admin.cookie).put(`/api/v1/content/${path}`, b);
    expect((await put('institucional/Mal Slug', { title: 'x', body: 'y' })).status).toBe(400);
    expect((await put('inventada/ok', { title: 'x', body: 'y' })).status).toBe(400);
    const res = await put('institucional/ok', { title: ' ', body: 'y' });
    expect(res.status).toBe(400);
    expect(res.body.errors.title[0]).toBe('El título de la sección es obligatorio.');
  });

  it('GET de una sección, 404 si no existe; DELETE solo oculta (409 si visible)', async () => {
    const visible = await createSectionRow({ page: 'ingreso', slug: 'visible' });
    const hidden = await createSectionRow({ page: 'ingreso', slug: 'oculta', visible: false });
    expect((await as(admin.cookie).get('/api/v1/content/ingreso/visible')).body.id).toBe(
      visible.id,
    );
    expect((await as(admin.cookie).get('/api/v1/content/ingreso/nada')).status).toBe(404);
    expect((await as(admin.cookie).del('/api/v1/content/ingreso/visible')).status).toBe(409);
    expect(await testPrisma.contentSection.count()).toBe(2);
    expect((await as(admin.cookie).del('/api/v1/content/ingreso/oculta')).status).toBe(204);
    expect(await testPrisma.contentSection.count({ where: { id: hidden.id } })).toBe(0);
    expect(await testPrisma.auditLog.count({ where: { action: 'content.delete' } })).toBe(1);
    expect((await as(admin.cookie).del('/api/v1/content/ingreso/oculta')).status).toBe(404);
  });
});

describe('/links', () => {
  it('solo ADMIN', async () => {
    const l = await createLinkRow();
    expect((await request(t.app).get('/api/v1/links')).status).toBe(401);
    for (const role of ['BEDELIA', 'EDITOR'] as const) {
      const u = await loginAs(t.app, role);
      expect((await as(u.cookie).get('/api/v1/links')).status).toBe(403);
      expect((await as(u.cookie).patch(`/api/v1/links/${l.id}`, { title: 'x' })).status).toBe(403);
      expect((await as(u.cookie).del(`/api/v1/links/${l.id}`)).status).toBe(403);
    }
  });

  it('crea con valores por defecto, lista ordenada (con ocultos) y audita', async () => {
    const res = await as(admin.cookie).post('/api/v1/links', {
      title: 'Aulas virtuales',
      url: 'https://aulasvirtuales.test/',
      description: 'Moodle',
      order: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      title: 'Aulas virtuales',
      url: 'https://aulasvirtuales.test/',
      description: 'Moodle',
      group: 'academico',
      order: 2,
      visible: true,
    });
    await createLinkRow({ title: 'Primero', order: 1 });
    await createLinkRow({ title: 'Oculto', order: 3, visible: false });
    const list = await as(admin.cookie).get('/api/v1/links');
    expect(list.body.items.map((l: { title: string }) => l.title)).toEqual([
      'Primero',
      'Aulas virtuales',
      'Oculto',
    ]);
    expect(list.body.total).toBe(3);
    expect((await as(admin.cookie).get('/api/v1/links?visible=false')).body.total).toBe(1);
    expect(await testPrisma.auditLog.count({ where: { action: 'link.create' } })).toBe(1);
  });

  it('valida: título/URL obligatorios y bien formados; título duplicado => 409', async () => {
    const post = (b: object) => as(admin.cookie).post('/api/v1/links', b);
    let res = await post({ title: '', url: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    expect(res.body.errors.title[0]).toBe('El título del enlace es obligatorio.');
    expect(res.body.errors.url[0]).toMatch(/http/);
    expect((await post({ title: 'SIU', url: 'https://siu.test' })).status).toBe(201);
    res = await post({ title: 'siu', url: 'https://otro.test' });
    expect(res.status).toBe(409);
    expect(res.body.errors.title).toBeDefined();
  });

  it('un enlace "a confirmar" (URL .invalid) no puede mostrarse hasta cargar la real', async () => {
    const pending = await createLinkRow({
      title: 'Tutoría',
      url: 'https://pendiente.invalid/a-confirmar',
      visible: false,
    });
    const bad = await as(admin.cookie).patch(`/api/v1/links/${pending.id}`, { visible: true });
    expect(bad.status).toBe(422);
    expect(bad.body.errors.url).toBeDefined();
    const ok = await as(admin.cookie).patch(`/api/v1/links/${pending.id}`, {
      url: 'https://tutoria.test',
      visible: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.visible).toBe(true);
    expect(
      (await as(admin.cookie).post('/api/v1/links', { title: 'Nuevo', url: 'https://x.invalid/a' }))
        .status,
    ).toBe(422);
  });

  it('PATCH edita/oculta y 404/400; DELETE solo si está oculto', async () => {
    const l = await createLinkRow({ title: 'Mi Argentina' });
    expect((await as(admin.cookie).patch(`/api/v1/links/${l.id}`, {})).status).toBe(400);
    expect(
      (
        await as(admin.cookie).patch('/api/v1/links/11111111-1111-4111-8111-111111111111', {
          title: 'x',
        })
      ).status,
    ).toBe(404);
    expect((await as(admin.cookie).del(`/api/v1/links/${l.id}`)).status).toBe(409);
    expect(
      (await as(admin.cookie).patch(`/api/v1/links/${l.id}`, { visible: false })).body.visible,
    ).toBe(false);
    expect((await as(admin.cookie).del(`/api/v1/links/${l.id}`)).status).toBe(204);
    expect(await testPrisma.auditLog.count({ where: { action: 'link.delete' } })).toBe(1);
    expect((await as(admin.cookie).del(`/api/v1/links/${l.id}`)).status).toBe(404);
  });
});
