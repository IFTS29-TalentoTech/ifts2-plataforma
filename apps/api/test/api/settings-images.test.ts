/**
 * Imágenes del sitio como archivo (`POST/DELETE /settings/image/:key`): permisos, subida (se guarda
 * la clave del almacenamiento y la API responde la URL lista), validación del tipo, reemplazo que borra
 * el archivo anterior, quitado manual auditado y publicación en `/public/settings`.
 */
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loginAs } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';

let t: TestApp;
let admin: string;
let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 20, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
});

beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  admin = (await loginAs(t.app, 'ADMIN')).cookie;
});

const url = (key: string) => `/api/v1/settings/image/${key}`;
const upload = (key: string, file: Buffer, name = 'logo.png', c = admin) =>
  request(t.app).post(url(key)).set('Cookie', c).attach('file', file, name);
const stored = async (key: string) =>
  (await testPrisma.siteSetting.findUnique({ where: { key } }))?.value ?? '';

describe('imágenes de ajustes', () => {
  it('401 sin sesión y 403 sin settings:manage', async () => {
    expect((await request(t.app).post(url('logo_url'))).status).toBe(401);
    const editor = (await loginAs(t.app, 'EDITOR')).cookie;
    expect((await upload('logo_url', png, 'logo.png', editor)).status).toBe(403);
    expect((await request(t.app).delete(url('logo_url')).set('Cookie', editor)).status).toBe(403);
  });

  it('sube la imagen: guarda la clave, responde una URL y la publica', async () => {
    const res = await upload('logo_url', png);
    expect(res.status).toBe(200);
    const key = await stored('logo_url');
    expect(key).toMatch(/^site\/.+\.webp$/);
    expect(await t.storage.exists(key)).toBe(true);
    // URL firmada (memory:// en las pruebas), no la clave del almacenamiento.
    expect(res.body.logo_url).toMatch(/^(https?|memory):\/\//);
    const pub = await request(t.app).get('/api/v1/public/settings');
    expect(pub.body.logo_url).toMatch(/^(https?|memory):\/\//);
    expect(await testPrisma.auditLog.count({ where: { action: 'settings.image' } })).toBe(1);
  });

  it('reemplazar borra el archivo anterior; una ruta provisoria no se toca', async () => {
    await testPrisma.siteSetting.create({
      data: { key: 'hero_image_1', value: '/img/provisorio/inicio-plato.webp' },
    });
    expect((await upload('hero_image_1', png)).status).toBe(200);
    const first = await stored('hero_image_1');
    expect((await upload('hero_image_1', png)).status).toBe(200);
    expect(await stored('hero_image_1')).not.toBe(first);
    expect(await t.storage.exists(first)).toBe(false);
  });

  it('rechaza lo que no es una imagen (415), una clave desconocida (400) y la falta de archivo', async () => {
    expect((await upload('logo_url', Buffer.from('%PDF-1.4 x'), 'x.pdf')).status).toBe(415);
    expect((await upload('logo_url', Buffer.from('texto'), 'x.png')).status).toBe(415);
    expect((await upload('institution_name', png)).status).toBe(400);
    expect((await request(t.app).post(url('logo_url')).set('Cookie', admin)).status).toBe(400);
    expect(await stored('logo_url')).toBe('');
  });

  it('quitar vacía el ajuste, borra el archivo y audita', async () => {
    await upload('career_image', png);
    const key = await stored('career_image');
    const res = await request(t.app).delete(url('career_image')).set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(res.body.career_image).toBeFalsy();
    expect(await t.storage.exists(key)).toBe(false);
    expect(await testPrisma.auditLog.count({ where: { action: 'settings.image.remove' } })).toBe(1);
    const pub = await request(t.app).get('/api/v1/public/settings');
    expect(pub.body.career_image).toBeUndefined();
  });
});
