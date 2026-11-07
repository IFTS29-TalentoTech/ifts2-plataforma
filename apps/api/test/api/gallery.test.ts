/**
 * Galerías editables (RF09, ADR-036): permisos, alta con imagen, validaciones (415/413/422), edición,
 * reemplazo de foto, orden, eliminación auditada y lectura pública (con degradación de almacenamiento).
 */
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GALLERY_MAX_PER_AREA } from '@ifts2/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';

let t: TestApp;
let cookie: string;
let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
});

beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  cookie = (await loginAs(t.app, 'EDITOR')).cookie;
});

const url = '/api/v1/gallery';
const publicUrl = '/api/v1/public/gallery';

/** Sube una diapositiva con la foto de prueba. */
function create(fields: Record<string, string> = {}, c = cookie, file: Buffer | null = png) {
  const r = request(t.app).post(url).set('Cookie', c);
  for (const [k, v] of Object.entries({ area: 'STUDENTS', ...fields })) r.field(k, v);
  return file ? r.attach('file', file, 'foto.png') : r;
}

/** Fila directa en la base (por ejemplo una imagen provisoria con ruta propia, como deja la semilla). */
const seedRow = (area: 'STUDENTS' | 'CAREER', order: number, image: string, title = 't') =>
  testPrisma.galleryItem.create({ data: { area, order, image, title } });

describe('permisos', () => {
  it('401 sin sesión', async () => {
    expect((await request(t.app).get(url)).status).toBe(401);
  });

  it('BEDELIA no tiene gallery:manage: 403 en todo', async () => {
    const { cookie: c } = await loginAs(t.app, 'BEDELIA');
    const row = await seedRow('STUDENTS', 0, '/img/x.webp');
    const calls = [
      request(t.app).get(url),
      request(t.app).post(url),
      request(t.app)
        .put(`${url}/order`)
        .send({ area: 'STUDENTS', ids: [row.id] }),
      request(t.app).patch(`${url}/${row.id}`).send({ title: 'x' }),
      request(t.app).post(`${url}/${row.id}/image`),
      request(t.app).delete(`${url}/${row.id}`),
    ];
    for (const call of calls) expect((await call.set('Cookie', c)).status).toBe(403);
    expect(await testPrisma.galleryItem.count()).toBe(1);
  });

  it('ADMIN y EDITOR sí pueden', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    expect((await request(t.app).get(url).set('Cookie', admin.cookie)).status).toBe(200);
    expect((await request(t.app).get(url).set('Cookie', cookie)).status).toBe(200);
  });
});

describe('alta con imagen', () => {
  it('201: guarda la foto como WebP con clave propia, ordena al final y audita', async () => {
    const a = await create({ title: 'Cocina', caption: 'Equipo', alt: 'Dos personas' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      area: 'STUDENTS',
      order: 0,
      title: 'Cocina',
      caption: 'Equipo',
      alt: 'Dos personas',
    });
    expect(a.body.image).toMatch(/^gallery\/.+\.webp$/);
    expect(a.body.src).toBeTruthy();
    expect(await t.storage.exists(a.body.image)).toBe(true);

    const b = await create({ title: 'Segunda' });
    expect(b.body.order).toBe(1);
    // El otro área empieza de cero.
    expect((await create({ area: 'CAREER' })).body.order).toBe(0);

    const log = await testPrisma.auditLog.findFirst({
      where: { action: 'gallery.create', entityId: a.body.id },
    });
    expect(log).not.toBeNull();
    expect(log?.userId).toBeTruthy();
  });

  it('rechaza sin archivo (400), con área inválida (400) y textos demasiado largos (400)', async () => {
    expect((await create({}, cookie, null)).status).toBe(400);
    const badArea = await create({ area: 'OTRA' });
    expect(badArea.status).toBe(400);
    expect(badArea.body.errors.area[0]).toMatch(/área/i);
    const long = await create({ title: 'x'.repeat(81) });
    expect(long.status).toBe(400);
    expect(long.body.errors.title[0]).toMatch(/80/);
    expect(await testPrisma.galleryItem.count()).toBe(0);
  });

  it('415 si no es una imagen (PDF o basura) y no deja archivos', async () => {
    const pdf = await create({}, cookie, Buffer.from('%PDF-1.4 contenido'));
    expect(pdf.status).toBe(415);
    const junk = await create({}, cookie, Buffer.from('esto no es una imagen'));
    expect(junk.status).toBe(415);
    expect(await testPrisma.galleryItem.count()).toBe(0);
  });

  it('413 si pesa más de 5 MB', async () => {
    const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const res = await create({}, cookie, big);
    expect(res.status).toBe(413);
    expect(await testPrisma.galleryItem.count()).toBe(0);
  });

  it('422 al pasar el máximo por área y no deja la imagen huérfana', async () => {
    for (let i = 0; i < GALLERY_MAX_PER_AREA; i++) {
      expect((await create({ title: `n${i}` })).status).toBe(201);
    }
    const before = t.storage.files.size;
    const extra = await create({ title: 'de más' });
    expect(extra.status).toBe(422);
    expect(extra.body.detail).toMatch(/máximo/i);
    expect(await testPrisma.galleryItem.count({ where: { area: 'STUDENTS' } })).toBe(
      GALLERY_MAX_PER_AREA,
    );
    expect(t.storage.files.size).toBe(before); // la rechazada no dejó la imagen huérfana
    // Otra galería tiene su propio cupo.
    expect((await create({ area: 'CAREER' })).status).toBe(201);
  });
});

describe('listado, edición y foto', () => {
  it('GET filtra por área y trae el máximo', async () => {
    await seedRow('STUDENTS', 0, '/img/a.webp');
    await seedRow('CAREER', 0, '/img/b.webp');
    const all = await request(t.app).get(url).set('Cookie', cookie);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.max).toBe(GALLERY_MAX_PER_AREA);
    const career = await request(t.app).get(`${url}?area=CAREER`).set('Cookie', cookie);
    expect(career.body.items).toHaveLength(1);
    expect(career.body.items[0].src).toBe('/img/b.webp');
    expect((await request(t.app).get(`${url}?area=X`).set('Cookie', cookie)).status).toBe(400);
  });

  it('PATCH edita los textos y audita; 400 sin cambios; 404 si no existe', async () => {
    const row = await seedRow('STUDENTS', 0, '/img/a.webp', 'viejo');
    const res = await request(t.app)
      .patch(`${url}/${row.id}`)
      .set('Cookie', cookie)
      .send({ title: 'nuevo', caption: 'desc' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'nuevo', caption: 'desc' });
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.update' } })).toBe(1);
    expect(
      (await request(t.app).patch(`${url}/${row.id}`).set('Cookie', cookie).send({})).status,
    ).toBe(400);
    const missing = await request(t.app)
      .patch(`${url}/6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111`)
      .set('Cookie', cookie)
      .send({ title: 'x' });
    expect(missing.status).toBe(404);
  });

  it('reemplazar la foto guarda la nueva, borra la anterior propia y audita', async () => {
    const created = await create({ title: 'a' });
    const oldKey = created.body.image;
    const res = await request(t.app)
      .post(`${url}/${created.body.id}/image`)
      .set('Cookie', cookie)
      .attach('file', png, 'otra.png');
    expect(res.status).toBe(200);
    expect(res.body.image).not.toBe(oldKey);
    expect(await t.storage.exists(res.body.image)).toBe(true);
    expect(await t.storage.exists(oldKey)).toBe(false);
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.image' } })).toBe(1);
    // PDF: 415 y se conserva la foto vigente.
    const bad = await request(t.app)
      .post(`${url}/${created.body.id}/image`)
      .set('Cookie', cookie)
      .attach('file', Buffer.from('%PDF-1.4 x'), 'x.pdf');
    expect(bad.status).toBe(415);
    expect(await t.storage.exists(res.body.image)).toBe(true);
  });
});

describe('orden', () => {
  it('PUT /order reordena con los ids de toda el área y audita', async () => {
    const a = await seedRow('STUDENTS', 0, '/img/a.webp', 'A');
    const b = await seedRow('STUDENTS', 1, '/img/b.webp', 'B');
    const c = await seedRow('STUDENTS', 2, '/img/c.webp', 'C');
    const res = await request(t.app)
      .put(`${url}/order`)
      .set('Cookie', cookie)
      .send({ area: 'STUDENTS', ids: [c.id, a.id, b.id] });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual(['C', 'A', 'B']);
    expect(res.body.items.map((i: { order: number }) => i.order)).toEqual([0, 1, 2]);
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.order' } })).toBe(1);
  });

  it('409 si faltan ids, sobran o se repiten; 400 con ids inválidos', async () => {
    const a = await seedRow('STUDENTS', 0, '/img/a.webp');
    await seedRow('STUDENTS', 1, '/img/b.webp');
    const put = (ids: string[]) =>
      request(t.app).put(`${url}/order`).set('Cookie', cookie).send({ area: 'STUDENTS', ids });
    expect((await put([a.id])).status).toBe(409);
    expect((await put([a.id, a.id])).status).toBe(409);
    expect((await put(['no-es-uuid'])).status).toBe(400);
  });
});

describe('eliminación', () => {
  it('204: borra la fila y el archivo propio, renumera y audita (gallery.delete)', async () => {
    const a = await create({ title: 'A' });
    const b = await create({ title: 'B' });
    const c = await create({ title: 'C' });
    const del = await request(t.app).delete(`${url}/${a.body.id}`).set('Cookie', cookie);
    expect(del.status).toBe(204);
    expect(await t.storage.exists(a.body.image)).toBe(false);
    expect(await t.storage.exists(b.body.image)).toBe(true);
    const list = await request(t.app).get(`${url}?area=STUDENTS`).set('Cookie', cookie);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([b.body.id, c.body.id]);
    expect(list.body.items.map((i: { order: number }) => i.order)).toEqual([0, 1]);
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'gallery.delete' } });
    expect(log?.entityId).toBe(a.body.id);
    expect((await request(t.app).delete(`${url}/${a.body.id}`).set('Cookie', cookie)).status).toBe(
      404,
    );
  });

  it('una imagen con ruta propia del sitio (semilla) no toca el almacenamiento', async () => {
    const row = await seedRow('CAREER', 0, '/img/provisorio/la-carrera-perfil.webp');
    const del = await request(t.app).delete(`${url}/${row.id}`).set('Cookie', cookie);
    expect(del.status).toBe(204);
    expect(await testPrisma.galleryItem.count()).toBe(0);
  });
});

describe('categorías (RF09, US-30)', () => {
  it('se guardan al crear, se editan, se quitan y salen en el panel y en la API pública', async () => {
    const a = await create({ title: 'A', category: '  Eventos ' });
    expect(a.status).toBe(201);
    expect(a.body.category).toBe('Eventos');
    expect((await request(t.app).get(`${publicUrl}?area=STUDENTS`)).body.items[0].category).toBe(
      'Eventos',
    );
    const edit = await request(t.app)
      .patch(`${url}/${a.body.id}`)
      .set('Cookie', cookie)
      .send({ category: 'Cocina' });
    expect(edit.status).toBe(200);
    expect(edit.body.category).toBe('Cocina');
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'gallery.update' } });
    expect(log?.detail).toMatchObject({ fields: ['category'] });
    const clear = await request(t.app)
      .patch(`${url}/${a.body.id}`)
      .set('Cookie', cookie)
      .send({ category: '' });
    expect(clear.body.category).toBe('');
  });

  it('sin categoría queda vacía y una categoría de más de 40 caracteres da 400', async () => {
    expect((await create({ title: 'B' })).body.category).toBe('');
    const long = await create({ category: 'x'.repeat(41) });
    expect(long.status).toBe(400);
    expect(long.body.errors.category).toBeDefined();
    expect(await testPrisma.galleryItem.count()).toBe(1);
  });
});

describe('lectura pública', () => {
  it('sin sesión: devuelve el área pedida en orden, con rutas propias tal cual y claves firmadas', async () => {
    await seedRow('STUDENTS', 1, '/img/dos.webp', 'Dos');
    await seedRow('STUDENTS', 0, '/img/uno.webp', 'Uno');
    await seedRow('CAREER', 0, '/img/carrera.webp', 'Carrera');
    const own = await create({ title: 'Subida' });
    const res = await request(t.app).get(`${publicUrl}?area=STUDENTS`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/s-maxage/);
    expect(res.body.area).toBe('STUDENTS');
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual(['Uno', 'Dos', 'Subida']);
    expect(res.body.items[0].src).toBe('/img/uno.webp');
    expect(res.body.items[2].src).toBe(own.body.src);
    // Nunca sale la clave interna ni datos del panel.
    expect(JSON.stringify(res.body)).not.toContain(own.body.image);
  });

  it('400 sin área o con un área inválida', async () => {
    expect((await request(t.app).get(publicUrl)).status).toBe(400);
    expect((await request(t.app).get(`${publicUrl}?area=X`)).status).toBe(400);
  });

  it('RNF03: si el almacenamiento falla, omite las diapositivas con clave y el sitio responde', async () => {
    await seedRow('STUDENTS', 0, '/img/uno.webp', 'Propia del sitio');
    await create({ title: 'En el almacenamiento' });
    t.storage.getSignedUrl = async () => {
      throw new Error('almacenamiento caído');
    };
    const res = await request(t.app).get(`${publicUrl}?area=STUDENTS`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual(['Propia del sitio']);
  });
});
