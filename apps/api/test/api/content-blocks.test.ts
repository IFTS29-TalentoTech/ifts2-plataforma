/**
 * Páginas del sitio (ADR-042): mostrar/ocultar bloques fijos, interruptor de las secciones, orden,
 * secciones fijas que no se eliminan y secciones agregadas en cualquier página (Inicio incluida).
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { loginAs, type LoggedIn } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';
import { createSectionRow } from '../helpers/academic-factories';

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

describe('bloques fijos: PUT /content/blocks/:blockId', () => {
  it('401 sin sesión y 403 sin content:manage', async () => {
    const url = '/api/v1/content/blocks/estudiantes.avisos';
    expect((await request(t.app).put(url).send({ visible: false })).status).toBe(401);
    const bedelia = await loginAs(t.app, 'BEDELIA');
    expect((await as(bedelia.cookie).put(url, { visible: false })).status).toBe(403);
  });

  it('oculta y vuelve a mostrar; el sitio público recibe la lista y queda auditado', async () => {
    const url = '/api/v1/content/blocks/estudiantes.avisos';
    const hide = await as(admin.cookie).put(url, { visible: false });
    expect(hide.status).toBe(200);
    expect(hide.body.hidden).toEqual(['estudiantes.avisos']);
    // Ocultar dos veces no duplica; otro bloque se suma.
    await as(admin.cookie).put(url, { visible: false });
    const second = await as(admin.cookie).put('/api/v1/content/blocks/inicio.proximos', {
      visible: false,
    });
    expect(second.body.hidden.sort()).toEqual(['estudiantes.avisos', 'inicio.proximos']);

    const pub = await request(t.app).get('/api/v1/public/settings');
    expect(JSON.parse(pub.body.hidden_blocks).sort()).toEqual([
      'estudiantes.avisos',
      'inicio.proximos',
    ]);
    const panel = await as(admin.cookie).get('/api/v1/content/estudiantes');
    expect(panel.body.hidden.sort()).toEqual(['estudiantes.avisos', 'inicio.proximos']);

    const show = await as(admin.cookie).put(url, { visible: true });
    expect(show.body.hidden).toEqual(['inicio.proximos']);
    expect(await testPrisma.auditLog.count({ where: { action: 'content.block' } })).toBe(4);
  });

  it('el encabezado y los bloques inventados no se pueden ocultar (400)', async () => {
    for (const id of ['inicio.encabezado', 'estudiantes.encabezado', 'inventado']) {
      const res = await as(admin.cookie).put(`/api/v1/content/blocks/${id}`, { visible: false });
      expect(res.status).toBe(400);
    }
    expect((await as(admin.cookie).put('/api/v1/content/blocks/inicio.accesos', {})).status).toBe(
      400,
    );
  });
});

describe('secciones: interruptor, orden y eliminación', () => {
  it('PATCH muestra u oculta una sección sin tocar su texto', async () => {
    await createSectionRow({ page: 'institucional', slug: 'sede', body: 'Texto original' });
    const res = await as(admin.cookie).patch('/api/v1/content/institucional/sede', {
      visible: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.visible).toBe(false);
    expect(res.body.body).toBe('Texto original');
    expect(await testPrisma.auditLog.count({ where: { action: 'content.visibility' } })).toBe(1);
    expect(
      (await as(admin.cookie).patch('/api/v1/content/institucional/no-existe', { visible: true }))
        .status,
    ).toBe(404);
  });

  it('el encabezado de la página no se puede ocultar (409)', async () => {
    await createSectionRow({ page: 'institucional', slug: 'presentacion', order: 1 });
    const res = await as(admin.cookie).patch('/api/v1/content/institucional/presentacion', {
      visible: false,
    });
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/siempre se muestra/);
  });

  it('una sección fija no se elimina ni estando oculta (409); una agregada sí', async () => {
    await createSectionRow({ page: 'institucional', slug: 'sede', visible: false });
    const fixed = await as(admin.cookie).del('/api/v1/content/institucional/sede');
    expect(fixed.status).toBe(409);
    expect(fixed.body.detail).toMatch(/no se puede eliminar/);
    expect(await testPrisma.contentSection.count({ where: { slug: 'sede' } })).toBe(1);

    await createSectionRow({ page: 'institucional', slug: 'extra', visible: false });
    expect((await as(admin.cookie).del('/api/v1/content/institucional/extra')).status).toBe(204);
  });

  it('PUT /:page/order reparte las mismas posiciones; el encabezado no se mueve', async () => {
    await createSectionRow({ page: 'institucional', slug: 'presentacion', order: 1 });
    await createSectionRow({ page: 'institucional', slug: 'a', order: 5 });
    await createSectionRow({ page: 'institucional', slug: 'b', order: 9 });
    const res = await as(admin.cookie).put('/api/v1/content/institucional/order', {
      slugs: ['b', 'a'],
    });
    expect(res.status).toBe(204);
    const rows = await testPrisma.contentSection.findMany({ where: { page: 'institucional' } });
    const order = Object.fromEntries(rows.map((r) => [r.slug, r.order]));
    expect(order).toEqual({ presentacion: 1, b: 5, a: 9 });

    const header = await as(admin.cookie).put('/api/v1/content/institucional/order', {
      slugs: ['presentacion', 'a'],
    });
    expect(header.status).toBe(422);
    const stale = await as(admin.cookie).put('/api/v1/content/institucional/order', {
      slugs: ['a', 'ya-no-existe'],
    });
    expect(stale.status).toBe(409);
    expect(await testPrisma.auditLog.count({ where: { action: 'content.order' } })).toBe(1);
  });
});

describe('secciones agregadas en cualquier página', () => {
  it('Inicio acepta una sección de texto y la publica; "order" no puede ser un identificador', async () => {
    const created = await as(admin.cookie).post('/api/v1/content/inicio', {
      title: 'Order',
      body: 'Un texto extra para Inicio.',
      order: 1,
    });
    expect(created.status).toBe(201);
    expect(created.body.page).toBe('inicio');
    expect(created.body.slug).not.toBe('order');
    const pub = await request(t.app).get('/api/v1/public/content/inicio');
    expect(pub.status).toBe(200);
    expect(pub.body.sections.map((s: { title: string }) => s.title)).toEqual(['Order']);
  });
});
