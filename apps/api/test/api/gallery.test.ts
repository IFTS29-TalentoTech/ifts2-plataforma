/**
 * Galerías con nombre (RF09, ADR-036, ADR-041): permisos, alta de galerías y de fotos con imagen,
 * validaciones (415/413/422), edición, reemplazo de foto, orden, eliminación auditada (la galería en uso
 * no se elimina) y publicación dentro de `/public/content/:page` como sección de galería.
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
const as = (c = cookie) => ({
  get: (u: string) => request(t.app).get(u).set('Cookie', c),
  post: (u: string, b: object = {}) => request(t.app).post(u).set('Cookie', c).send(b),
  patch: (u: string, b: object = {}) => request(t.app).patch(u).set('Cookie', c).send(b),
  put: (u: string, b: object = {}) => request(t.app).put(u).set('Cookie', c).send(b),
  del: (u: string) => request(t.app).delete(u).set('Cookie', c),
});

/** Crea una galería por la API (201). */
const newGallery = async (name = 'Mi galería') => (await as().post(url, { name })).body;

/** Sube una foto a una galería con la imagen de prueba. */
function addPhoto(
  galleryId: string,
  fields: Record<string, string> = {},
  c = cookie,
  file: Buffer | null = png,
) {
  const r = request(t.app).post(`${url}/${galleryId}/items`).set('Cookie', c);
  for (const [k, v] of Object.entries(fields)) r.field(k, v);
  return file ? r.attach('file', file, 'foto.png') : r;
}

/** Fila directa en la base (por ejemplo una imagen provisoria con ruta propia, como deja la semilla). */
const seedRow = (galleryId: string, order: number, image: string, title = 't') =>
  testPrisma.galleryItem.create({ data: { galleryId, order, image, title } });

describe('permisos', () => {
  it('401 sin sesión', async () => {
    expect((await request(t.app).get(url)).status).toBe(401);
  });

  it('BEDELIA no tiene gallery:manage: 403 en todo', async () => {
    const { cookie: c } = await loginAs(t.app, 'BEDELIA');
    const g = await testPrisma.gallery.create({ data: { name: 'G' } });
    const row = await seedRow(g.id, 0, '/img/x.webp');
    const a = as(c);
    const calls = [
      a.get(url),
      a.post(url, { name: 'x' }),
      a.patch(`${url}/${g.id}`, { name: 'x' }),
      a.del(`${url}/${g.id}`),
      a.put(`${url}/${g.id}/order`, { ids: [row.id] }),
      request(t.app).post(`${url}/${g.id}/items`).set('Cookie', c),
      a.patch(`${url}/items/${row.id}`, { title: 'x' }),
      request(t.app).post(`${url}/items/${row.id}/image`).set('Cookie', c),
      a.del(`${url}/items/${row.id}`),
    ];
    for (const call of calls) expect((await call).status).toBe(403);
    expect(await testPrisma.galleryItem.count()).toBe(1);
  });

  it('ADMIN y EDITOR sí pueden', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    expect((await as(admin.cookie).get(url)).status).toBe(200);
    expect((await as().get(url)).status).toBe(200);
  });
});

describe('galerías con nombre', () => {
  it('201: crea la galería, la ordena al final y audita; el nombre es obligatorio', async () => {
    const a = await as().post(url, { name: '  Egresados 2026 ' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ name: 'Egresados 2026', order: 0, items: [], pages: [] });
    expect((await as().post(url, { name: 'Otra' })).body.order).toBe(1);
    expect((await as().post(url, { name: '   ' })).status).toBe(400);
    expect((await as().post(url, {})).status).toBe(400);
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.create' } })).toBe(2);
  });

  it('PATCH renombra (404 si no existe) y audita', async () => {
    const g = await newGallery('Vieja');
    const res = await as().patch(`${url}/${g.id}`, { name: 'Nueva' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nueva');
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.rename' } })).toBe(1);
    const missing = await as().patch(`${url}/6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111`, { name: 'x' });
    expect(missing.status).toBe(404);
  });

  it('GET lista las galerías con sus fotos y las páginas donde se muestran', async () => {
    const g = await newGallery('Con fotos');
    await seedRow(g.id, 0, '/img/b.webp');
    await testPrisma.contentSection.create({
      data: {
        page: 'estudiantes',
        slug: 'fotos',
        title: 'Fotos',
        body: '',
        kind: 'GALLERY',
        galleryId: g.id,
      },
    });
    const res = await as().get(url);
    expect(res.status).toBe(200);
    expect(res.body.max).toBe(GALLERY_MAX_PER_AREA);
    expect(res.body.galleries).toHaveLength(1);
    expect(res.body.galleries[0]).toMatchObject({ name: 'Con fotos', pages: ['estudiantes'] });
    expect(res.body.galleries[0].items[0].src).toBe('/img/b.webp');
  });

  it('eliminar: 409 si se muestra en una página; si no, borra fotos y archivos y audita', async () => {
    const g = await newGallery('Se va');
    const photo = await addPhoto(g.id, { title: 'a' });
    expect(photo.status).toBe(201);
    const section = await testPrisma.contentSection.create({
      data: {
        page: 'carrera',
        slug: 'fotos',
        title: 'F',
        body: '',
        kind: 'GALLERY',
        galleryId: g.id,
      },
    });
    const busy = await as().del(`${url}/${g.id}`);
    expect(busy.status).toBe(409);
    expect(busy.body.detail).toMatch(/La carrera/);
    expect(await testPrisma.gallery.count()).toBe(1);

    await testPrisma.contentSection.delete({ where: { id: section.id } });
    expect((await as().del(`${url}/${g.id}`)).status).toBe(204);
    expect(await testPrisma.gallery.count()).toBe(0);
    expect(await testPrisma.galleryItem.count()).toBe(0);
    expect(await t.storage.exists(photo.body.image)).toBe(false);
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.delete' } })).toBe(1);
    expect((await as().del(`${url}/${g.id}`)).status).toBe(404);
  });
});

describe('alta de fotos con imagen', () => {
  it('201: guarda la foto como WebP con clave propia, ordena al final y audita', async () => {
    const g = await newGallery();
    const a = await addPhoto(g.id, { title: 'Cocina', caption: 'Equipo', alt: 'Dos personas' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      galleryId: g.id,
      order: 0,
      title: 'Cocina',
      caption: 'Equipo',
      alt: 'Dos personas',
    });
    expect(a.body.image).toMatch(/^gallery\/.+\.webp$/);
    expect(a.body.src).toBeTruthy();
    expect(await t.storage.exists(a.body.image)).toBe(true);

    expect((await addPhoto(g.id, { title: 'Segunda' })).body.order).toBe(1);
    // Otra galería empieza de cero.
    const other = await newGallery('Otra');
    expect((await addPhoto(other.id)).body.order).toBe(0);

    const log = await testPrisma.auditLog.findFirst({
      where: { action: 'gallery.item.create', entityId: a.body.id },
    });
    expect(log?.userId).toBeTruthy();
  });

  it('rechaza sin archivo (400), galería inexistente (404) y textos demasiado largos (400)', async () => {
    const g = await newGallery();
    expect((await addPhoto(g.id, {}, cookie, null)).status).toBe(400);
    expect((await addPhoto('6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111')).status).toBe(404);
    const long = await addPhoto(g.id, { title: 'x'.repeat(81) });
    expect(long.status).toBe(400);
    expect(long.body.errors.title[0]).toMatch(/80/);
    expect(await testPrisma.galleryItem.count()).toBe(0);
  });

  it('415 si no es una imagen (PDF o basura) y no deja archivos', async () => {
    const g = await newGallery();
    expect((await addPhoto(g.id, {}, cookie, Buffer.from('%PDF-1.4 contenido'))).status).toBe(415);
    expect((await addPhoto(g.id, {}, cookie, Buffer.from('esto no es una imagen'))).status).toBe(
      415,
    );
    expect(await testPrisma.galleryItem.count()).toBe(0);
  });

  it('413 si pesa más de 5 MB', async () => {
    const g = await newGallery();
    const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    expect((await addPhoto(g.id, {}, cookie, big)).status).toBe(413);
    expect(await testPrisma.galleryItem.count()).toBe(0);
  });

  it('422 al pasar el máximo por galería y no deja la imagen huérfana', async () => {
    const g = await newGallery();
    for (let i = 0; i < GALLERY_MAX_PER_AREA; i++) {
      expect((await addPhoto(g.id, { title: `n${i}` })).status).toBe(201);
    }
    const before = t.storage.files.size;
    const extra = await addPhoto(g.id, { title: 'de más' });
    expect(extra.status).toBe(422);
    expect(extra.body.detail).toMatch(/máximo/i);
    expect(t.storage.files.size).toBe(before);
    // Otra galería tiene su propio cupo.
    expect((await addPhoto((await newGallery('B')).id)).status).toBe(201);
  });
});

describe('edición de fotos', () => {
  it('PATCH edita los textos y audita; 400 sin cambios; 404 si no existe', async () => {
    const g = await newGallery();
    const row = await seedRow(g.id, 0, '/img/a.webp', 'viejo');
    const res = await as().patch(`${url}/items/${row.id}`, { title: 'nuevo', caption: 'desc' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'nuevo', caption: 'desc' });
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.item.update' } })).toBe(1);
    expect((await as().patch(`${url}/items/${row.id}`, {})).status).toBe(400);
    const missing = await as().patch(`${url}/items/6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111`, {
      title: 'x',
    });
    expect(missing.status).toBe(404);
  });

  it('reemplazar la foto guarda la nueva, borra la anterior propia y audita', async () => {
    const g = await newGallery();
    const created = await addPhoto(g.id, { title: 'a' });
    const oldKey = created.body.image;
    const res = await request(t.app)
      .post(`${url}/items/${created.body.id}/image`)
      .set('Cookie', cookie)
      .attach('file', png, 'otra.png');
    expect(res.status).toBe(200);
    expect(res.body.image).not.toBe(oldKey);
    expect(await t.storage.exists(res.body.image)).toBe(true);
    expect(await t.storage.exists(oldKey)).toBe(false);
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.image' } })).toBe(1);
    // PDF: 415 y se conserva la foto vigente.
    const bad = await request(t.app)
      .post(`${url}/items/${created.body.id}/image`)
      .set('Cookie', cookie)
      .attach('file', Buffer.from('%PDF-1.4 x'), 'x.pdf');
    expect(bad.status).toBe(415);
    expect(await t.storage.exists(res.body.image)).toBe(true);
  });

  it('reemplazar una ruta provisoria no borra nada del almacenamiento', async () => {
    const g = await newGallery();
    const row = await seedRow(g.id, 0, '/img/provisorio/x.webp');
    const res = await request(t.app)
      .post(`${url}/items/${row.id}/image`)
      .set('Cookie', cookie)
      .attach('file', png, 'otra.png');
    expect(res.status).toBe(200);
    expect(res.body.image).toMatch(/^gallery\//);
  });
});

describe('orden y eliminación de fotos', () => {
  it('PUT /:id/order reordena; 409 si la lista no coincide', async () => {
    const g = await newGallery();
    const a = await seedRow(g.id, 0, '/img/a.webp');
    const b = await seedRow(g.id, 1, '/img/b.webp');
    const ok = await as().put(`${url}/${g.id}/order`, { ids: [b.id, a.id] });
    expect(ok.status).toBe(200);
    expect(ok.body.items.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]);
    expect((await as().put(`${url}/${g.id}/order`, { ids: [a.id] })).status).toBe(409);
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.order' } })).toBe(1);
  });

  it('DELETE de una foto: manual, renumera, borra el archivo propio y audita', async () => {
    const g = await newGallery();
    const a = await addPhoto(g.id, { title: 'a' });
    const b = await addPhoto(g.id, { title: 'b' });
    expect((await as().del(`${url}/items/${a.body.id}`)).status).toBe(204);
    expect(await t.storage.exists(a.body.image)).toBe(false);
    const left = await testPrisma.galleryItem.findUnique({ where: { id: b.body.id } });
    expect(left?.order).toBe(0);
    expect(await testPrisma.auditLog.count({ where: { action: 'gallery.item.delete' } })).toBe(1);
    expect((await as().del(`${url}/items/${a.body.id}`)).status).toBe(404);
  });
});

describe('sección de galería en el contenido de una página (ADR-041)', () => {
  const content = '/api/v1/content';
  const publicContent = (page: string) => request(t.app).get(`/api/v1/public/content/${page}`);

  it('POST /content/:page crea una sección de galería con identificador generado y audita', async () => {
    const admin = (await loginAs(t.app, 'ADMIN')).cookie;
    const g = await newGallery('Egresados');
    await seedRow(g.id, 0, '/img/a.webp', 'Foto');
    const res = await as(admin).post(`${content}/ingreso`, {
      title: 'Nuestros egresados',
      kind: 'GALLERY',
      galleryId: g.id,
      order: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      slug: 'nuestros-egresados',
      kind: 'GALLERY',
      galleryId: g.id,
    });
    // Mismo título: el identificador se hace único.
    const again = await as(admin).post(`${content}/ingreso`, {
      title: 'Nuestros egresados',
      kind: 'GALLERY',
      galleryId: g.id,
    });
    expect(again.body.slug).toBe('nuestros-egresados-2');
    expect(await testPrisma.auditLog.count({ where: { action: 'content.create' } })).toBe(2);

    const pub = await publicContent('ingreso');
    expect(pub.body.sections).toEqual([]);
    expect(pub.body.galleries).toHaveLength(2);
    expect(pub.body.galleries[0]).toMatchObject({ title: 'Nuestros egresados' });
    expect(pub.body.galleries[0].items[0]).toMatchObject({ src: '/img/a.webp', title: 'Foto' });
  });

  it('valida: la galería es obligatoria y debe existir; sirve en las páginas nuevas', async () => {
    const admin = (await loginAs(t.app, 'ADMIN')).cookie;
    const sin = await as(admin).post(`${content}/estudiantes`, { title: 'X', kind: 'GALLERY' });
    expect(sin.status).toBe(400);
    expect(sin.body.errors.galleryId).toBeTruthy();
    const falsa = await as(admin).post(`${content}/inscripciones`, {
      title: 'X',
      kind: 'GALLERY',
      galleryId: '6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111',
    });
    expect(falsa.status).toBe(422);
    const texto = await as(admin).post(`${content}/estudiantes`, { title: 'Aviso', body: 'Hola' });
    expect(texto.status).toBe(201);
    expect((await publicContent('estudiantes')).body.sections).toHaveLength(1);
    expect((await publicContent('inscripciones')).status).toBe(200);
  });

  it('el sitio omite las galerías ocultas y las que no tienen fotos', async () => {
    const empty = await newGallery('Vacía');
    const full = await newGallery('Llena');
    await seedRow(full.id, 0, '/img/a.webp');
    const mk = (slug: string, galleryId: string, visible: boolean) =>
      testPrisma.contentSection.create({
        data: { page: 'carrera', slug, title: slug, body: '', kind: 'GALLERY', galleryId, visible },
      });
    await mk('vacia', empty.id, true);
    await mk('oculta', full.id, false);
    await mk('visible', full.id, true);
    const pub = await publicContent('carrera');
    expect(pub.body.galleries.map((g: { slug: string }) => g.slug)).toEqual(['visible']);
  });
});
