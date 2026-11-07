/**
 * Plantel docente (RF10, US-29, ADR-037): permisos, alta y validaciones, edición, baja lógica
 * (ocultar), foto, orden, eliminación manual solo de personas ocultas (409 si siguen visibles),
 * auditoría y lectura pública (solo visibles, con degradación del almacenamiento).
 */
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loginAs } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';

let t: TestApp;
let cookie: string;
let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 90, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
});

beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  cookie = (await loginAs(t.app, 'EDITOR')).cookie;
});

const url = '/api/v1/teachers';
const publicUrl = '/api/v1/public/teachers';

const create = (body: Record<string, unknown> = {}, c = cookie) =>
  request(t.app)
    .post(url)
    .set('Cookie', c)
    .send({ name: 'Docente de prueba', ...body });

describe('permisos', () => {
  it('401 sin sesión', async () => {
    expect((await request(t.app).get(url)).status).toBe(401);
  });

  it('BEDELIA no tiene teachers:manage: 403 en todo', async () => {
    const { cookie: c } = await loginAs(t.app, 'BEDELIA');
    const row = await testPrisma.teacher.create({ data: { name: 'X' } });
    const calls = [
      request(t.app).get(url),
      request(t.app).post(url).send({ name: 'Y' }),
      request(t.app)
        .put(`${url}/order`)
        .send({ ids: [row.id] }),
      request(t.app).patch(`${url}/${row.id}`).send({ visible: false }),
      request(t.app).post(`${url}/${row.id}/photo`),
      request(t.app).delete(`${url}/${row.id}/photo`),
      request(t.app).delete(`${url}/${row.id}`),
    ];
    for (const call of calls) expect((await call.set('Cookie', c)).status).toBe(403);
    expect(await testPrisma.teacher.count()).toBe(1);
  });

  it('ADMIN y EDITOR sí pueden', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    expect((await request(t.app).get(url).set('Cookie', admin.cookie)).status).toBe(200);
    expect((await request(t.app).get(url).set('Cookie', cookie)).status).toBe(200);
  });
});

describe('alta y validaciones', () => {
  it('201: guarda al final, completa los valores por defecto y audita', async () => {
    const a = await create({ name: '  Persona Uno ', role: 'Profesora', subjects: ['Materia A'] });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      name: 'Persona Uno',
      role: 'Profesora',
      subjects: ['Materia A'],
      photo: '',
      photoSrc: null,
      order: 0,
      visible: true,
    });
    const b = await create({ name: 'Persona Dos' });
    expect(b.body).toMatchObject({ order: 1, role: '', subjects: [], visible: true });
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'teachers.create' } });
    expect(log).toMatchObject({ entity: 'Teacher', entityId: a.body.id });
  });

  it('400: el nombre es obligatorio y los textos tienen largo máximo', async () => {
    const sin = await request(t.app).post(url).set('Cookie', cookie).send({});
    expect(sin.status).toBe(400);
    expect(sin.body.errors.name).toBeDefined();
    const largo = await create({ role: 'x'.repeat(81) });
    expect(largo.status).toBe(400);
    expect(largo.body.errors.role).toBeDefined();
    expect(await testPrisma.teacher.count()).toBe(0);
  });

  it('las materias se recortan, sin vacías ni repetidas, y tienen un máximo', async () => {
    const ok = await create({ subjects: [' Química ', '', 'química', 'Panadería'] });
    expect(ok.body.subjects).toEqual(['Química', 'Panadería']);
    const muchas = await create({ subjects: Array.from({ length: 13 }, (_, i) => `M${i}`) });
    expect(muchas.status).toBe(400);
    expect(muchas.body.errors.subjects).toBeDefined();
  });
});

describe('edición y baja lógica', () => {
  it('PATCH cambia datos y la visibilidad; el listado del panel muestra todas', async () => {
    const a = await create({ name: 'Persona', subjects: ['A'] });
    const edit = await request(t.app)
      .patch(`${url}/${a.body.id}`)
      .set('Cookie', cookie)
      .send({ role: 'Jefa de área', subjects: ['A', 'B'], visible: false });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ role: 'Jefa de área', subjects: ['A', 'B'], visible: false });
    const list = await request(t.app).get(url).set('Cookie', cookie);
    expect(list.body.items).toHaveLength(1);
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'teachers.update' } });
    expect(log?.detail).toMatchObject({ fields: ['role', 'subjects', 'visible'] });
  });

  it('400 sin cambios y 404 si no existe', async () => {
    const a = await create();
    expect(
      (await request(t.app).patch(`${url}/${a.body.id}`).set('Cookie', cookie).send({})).status,
    ).toBe(400);
    const missing = '00000000-0000-4000-8000-000000000000';
    expect(
      (await request(t.app).patch(`${url}/${missing}`).set('Cookie', cookie).send({ role: 'x' }))
        .status,
    ).toBe(404);
  });
});

describe('foto', () => {
  const upload = (id: string, file: Buffer | null = png, name = 'foto.png') => {
    const r = request(t.app).post(`${url}/${id}/photo`).set('Cookie', cookie);
    return file ? r.attach('file', file, name) : r;
  };

  it('sube, convierte a WebP con clave propia, reemplaza (borra la anterior) y quita', async () => {
    const a = await create();
    const first = await upload(a.body.id);
    expect(first.status).toBe(200);
    expect(first.body.photo).toMatch(/^teachers\/.+\.webp$/);
    expect(first.body.photoSrc).toEqual(expect.any(String));
    const second = await upload(a.body.id);
    expect(second.body.photo).not.toBe(first.body.photo);
    expect(await t.storage.exists(first.body.photo)).toBe(false); // la anterior ya no está
    expect(await t.storage.exists(second.body.photo)).toBe(true);
    const del = await request(t.app).delete(`${url}/${a.body.id}/photo`).set('Cookie', cookie);
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ photo: '', photoSrc: null });
    expect(await t.storage.exists(second.body.photo)).toBe(false);
    expect(await testPrisma.auditLog.count({ where: { action: 'teachers.photo' } })).toBe(3);
  });

  it('400 sin archivo, 415 si no es una imagen y 404 si no existe', async () => {
    const a = await create();
    expect((await upload(a.body.id, null)).status).toBe(400);
    expect((await upload(a.body.id, Buffer.from('no soy una imagen'), 'x.png')).status).toBe(415);
    const pdf = Buffer.from('%PDF-1.4\n%fake\n');
    expect((await upload(a.body.id, pdf, 'x.pdf')).status).toBe(415);
    expect((await upload('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await testPrisma.teacher.findUnique({ where: { id: a.body.id } }))!.photo).toBe('');
  });
});

describe('orden', () => {
  it('PUT /order reordena y audita; 409 si el conjunto cambió', async () => {
    const [a, b, c] = [
      (await create({ name: 'A' })).body,
      (await create({ name: 'B' })).body,
      (await create({ name: 'C' })).body,
    ];
    const ok = await request(t.app)
      .put(`${url}/order`)
      .set('Cookie', cookie)
      .send({ ids: [c.id, a.id, b.id] });
    expect(ok.status).toBe(200);
    expect(ok.body.items.map((i: { name: string }) => i.name)).toEqual(['C', 'A', 'B']);
    expect(await testPrisma.auditLog.count({ where: { action: 'teachers.order' } })).toBe(1);
    const incompleto = await request(t.app)
      .put(`${url}/order`)
      .set('Cookie', cookie)
      .send({ ids: [a.id, b.id] });
    expect(incompleto.status).toBe(409);
    const repetido = await request(t.app)
      .put(`${url}/order`)
      .set('Cookie', cookie)
      .send({ ids: [a.id, a.id, b.id] });
    expect(repetido.status).toBe(409);
  });
});

describe('eliminación manual', () => {
  it('409 si la persona sigue visible: no se borra nada', async () => {
    const a = await create();
    const res = await request(t.app).delete(`${url}/${a.body.id}`).set('Cookie', cookie);
    expect(res.status).toBe(409);
    expect(await testPrisma.teacher.count()).toBe(1);
    expect(await testPrisma.auditLog.count({ where: { action: 'teachers.delete' } })).toBe(0);
  });

  it('204 si está oculta: borra, renumera, borra la foto y audita', async () => {
    const a = (await create({ name: 'A' })).body;
    const b = (await create({ name: 'B' })).body;
    const photo = await request(t.app)
      .post(`${url}/${a.id}/photo`)
      .set('Cookie', cookie)
      .attach('file', png, 'foto.png');
    await request(t.app).patch(`${url}/${a.id}`).set('Cookie', cookie).send({ visible: false });
    const res = await request(t.app).delete(`${url}/${a.id}`).set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(await t.storage.exists(photo.body.photo)).toBe(false);
    const rest = await testPrisma.teacher.findMany();
    expect(rest).toHaveLength(1);
    expect(rest[0]).toMatchObject({ id: b.id, order: 0 });
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'teachers.delete' } });
    expect(log).toMatchObject({ entityId: a.id });
    expect(log?.detail).toMatchObject({ name: 'A' });
    expect((await request(t.app).delete(`${url}/${a.id}`).set('Cookie', cookie)).status).toBe(404);
  });
});

describe('lectura pública', () => {
  it('sin sesión: solo las visibles, en orden, sin datos de gestión', async () => {
    const a = (await create({ name: 'A', subjects: ['M1'] })).body;
    await create({ name: 'B' });
    await request(t.app).patch(`${url}/${a.id}`).set('Cookie', cookie).send({ visible: false });
    const res = await request(t.app).get(publicUrl);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual(['B']);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      ['id', 'name', 'photoSrc', 'role', 'subjects'].sort(),
    );
  });

  it('sin plantel responde una lista vacía', async () => {
    const res = await request(t.app).get(publicUrl);
    expect(res.body).toEqual({ items: [] });
  });

  it('RNF03: si el almacenamiento falla, la persona se muestra igual, sin foto', async () => {
    const a = (await create({ name: 'Con foto' })).body;
    await request(t.app)
      .post(`${url}/${a.id}/photo`)
      .set('Cookie', cookie)
      .attach('file', png, 'foto.png');
    t.storage.getSignedUrl = async () => {
      throw new Error('almacenamiento caído');
    };
    const res = await request(t.app).get(publicUrl);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].photoSrc).toBeNull();
  });
});
