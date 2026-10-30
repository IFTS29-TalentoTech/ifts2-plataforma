import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createCategory, createNotice } from '../helpers/factories';
import { createPublicationRow } from '../helpers/social-factories';

let t: TestApp;
let cookie: string;
const url = '/api/v1/categories';

beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  cookie = (await loginAs(t.app, 'EDITOR')).cookie;
});

const post = (body: object, c = cookie) => request(t.app).post(url).set('Cookie', c).send(body);

describe('permisos', () => {
  it('401 sin sesión en todos los endpoints', async () => {
    expect((await request(t.app).get(url)).status).toBe(401);
    expect((await request(t.app).post(url).send({})).status).toBe(401);
    expect((await request(t.app).patch(`${url}/x`).send({})).status).toBe(401);
    expect((await request(t.app).delete(`${url}/x`)).status).toBe(401);
  });

  it('ADMIN, BEDELIA y EDITOR pueden gestionar categorías', async () => {
    for (const role of ['ADMIN', 'BEDELIA', 'EDITOR'] as const) {
      const { cookie: c } = await loginAs(t.app, role);
      const res = await post({ name: `Cat ${role}`, kind: 'PUBLICATION' }, c);
      expect(res.status).toBe(201);
    }
  });
});

describe('POST /categories', () => {
  it('crea y audita', async () => {
    const res = await post({ name: '  Eventos  ', kind: 'PUBLICATION' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Eventos', kind: 'PUBLICATION', usageCount: 0 });
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'category.create' } });
    expect(log).toMatchObject({ entity: 'Category', entityId: res.body.id });
  });

  it('valida campos con mensajes en español', async () => {
    const res = await post({ name: '', kind: 'OTRA' });
    expect(res.status).toBe(400);
    expect(res.body.errors.name[0]).toBe('El nombre de la categoría es obligatorio.');
    expect(res.body.errors.kind[0]).toMatch(/elegí una opción válida/);
  });

  it('409 si ya existe el mismo nombre en el mismo tipo (sin distinguir mayúsculas)', async () => {
    await post({ name: 'Eventos', kind: 'PUBLICATION' });
    const dup = await post({ name: 'eventos', kind: 'PUBLICATION' });
    expect(dup.status).toBe(409);
    expect(dup.body.errors.name[0]).toMatch(/Ya existe una categoría/);
    // el mismo nombre en otro tipo sí se permite
    expect((await post({ name: 'Eventos', kind: 'NOTICE' })).status).toBe(201);
  });
});

describe('GET /categories', () => {
  it('lista y filtra por tipo, con cantidad de usos', async () => {
    const used = await createCategory({ name: 'En uso', kind: 'PUBLICATION' });
    await createCategory({ name: 'Aviso', kind: 'NOTICE' });
    await createPublicationRow({ categoryId: used.id });
    const all = await request(t.app).get(url).set('Cookie', cookie);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    const pubs = await request(t.app).get(`${url}?kind=PUBLICATION`).set('Cookie', cookie);
    expect(pubs.body.items).toEqual([
      { id: used.id, name: 'En uso', kind: 'PUBLICATION', usageCount: 1 },
    ]);
    expect((await request(t.app).get(`${url}?kind=ZZZ`).set('Cookie', cookie)).status).toBe(400);
  });
});

describe('PATCH /categories/:id', () => {
  it('renombra, audita y valida', async () => {
    const c = await createCategory({ name: 'Viejo', kind: 'PUBLICATION' });
    const res = await request(t.app)
      .patch(`${url}/${c.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Nuevo' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nuevo');
    expect(await testPrisma.auditLog.count({ where: { action: 'category.update' } })).toBe(1);
    expect(
      (await request(t.app).patch(`${url}/${c.id}`).set('Cookie', cookie).send({ name: '' }))
        .status,
    ).toBe(400);
  });

  it('409 si el nombre ya existe en ese tipo y 404 si no existe', async () => {
    await createCategory({ name: 'Uno', kind: 'PUBLICATION' });
    const dos = await createCategory({ name: 'Dos', kind: 'PUBLICATION' });
    const res = await request(t.app)
      .patch(`${url}/${dos.id}`)
      .set('Cookie', cookie)
      .send({ name: 'uno' });
    expect(res.status).toBe(409);
    // renombrar a sí misma con otra capitalización está permitido
    expect(
      (await request(t.app).patch(`${url}/${dos.id}`).set('Cookie', cookie).send({ name: 'DOS' }))
        .status,
    ).toBe(200);
    const missing = await request(t.app)
      .patch(`${url}/6f1c8a5e-1d3b-4c55-9b1e-2f0c1a7b9d11`)
      .set('Cookie', cookie)
      .send({ name: 'X' });
    expect(missing.status).toBe(404);
  });
});

describe('DELETE /categories/:id', () => {
  it('204 si no está referenciada, y queda auditado', async () => {
    const c = await createCategory({ name: 'Libre', kind: 'GALLERY' });
    const res = await request(t.app).delete(`${url}/${c.id}`).set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(await testPrisma.category.count()).toBe(0);
    expect(await testPrisma.auditLog.count({ where: { action: 'category.delete' } })).toBe(1);
  });

  it('409 si la usa una publicación', async () => {
    const c = await createCategory({ name: 'Con publicación', kind: 'PUBLICATION' });
    await createPublicationRow({ categoryId: c.id });
    const res = await request(t.app).delete(`${url}/${c.id}`).set('Cookie', cookie);
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/está en uso \(1 elemento\)/);
    expect(await testPrisma.category.count()).toBe(1);
  });

  it('409 si la usa un aviso', async () => {
    const c = await createCategory({ name: 'Con aviso', kind: 'NOTICE' });
    const n = await createNotice();
    await testPrisma.notice.update({ where: { id: n.id }, data: { categoryId: c.id } });
    expect((await request(t.app).delete(`${url}/${c.id}`).set('Cookie', cookie)).status).toBe(409);
  });

  it('404 si no existe', async () => {
    const res = await request(t.app)
      .delete(`${url}/6f1c8a5e-1d3b-4c55-9b1e-2f0c1a7b9d11`)
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});
