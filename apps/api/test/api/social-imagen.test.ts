/**
 * Aprobar una publicación de redes cuando la IMAGEN falla: cada causa tiene su mensaje y su
 * `imageProblem` (descarga, página web, formato, peso), no se crea nada a medias y, si quien modera lo
 * decide, se publica SIN imagen (`withoutImage`, RNF03: la foto nunca bloquea la publicación).
 */
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MediaDownloadError } from '../../src/infra/media-download';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createSocialPostRow } from '../helpers/social-factories';

let t: TestApp;
let cookie: string;
let jpeg: Buffer;
/** Lo que "descarga" la imagen simulada en cada prueba. */
let download: () => Promise<Buffer>;

beforeAll(async () => {
  jpeg = await sharp({
    create: { width: 80, height: 60, channels: 3, background: '#8D775F' },
  })
    .jpeg()
    .toBuffer();
});

beforeEach(async () => {
  await resetDb();
  download = async () => jpeg;
  t = await createTestApp({ downloadImage: (u) => (void u, download()) });
  cookie = (await loginAs(t.app, 'EDITOR')).cookie;
});

const approve = (id: string, body: object = {}) =>
  request(t.app)
    .post(`/api/v1/social/posts/${id}/approve`)
    .set('Cookie', cookie)
    .send({ section: 'BOTH', consentConfirmed: true, ...body });
const manual = () =>
  createSocialPostRow({
    externalId: 'manual-prueba-1',
    mediaUrl: 'https://cdn.example.com/foto.jpg',
  });

describe('causas del error de imagen al aprobar', () => {
  it('una página web (enlace de la publicación pegado como imagen): 422 "page"', async () => {
    download = async () => Buffer.from('<!DOCTYPE html><html><body>Instagram</body></html>');
    const p = await manual();
    const res = await approve(p.id);
    expect(res.status).toBe(422);
    expect(res.body.imageProblem).toBe('page');
    expect(res.body.detail).toMatch(/página web, no una imagen/);
    expect(res.body.detail).toMatch(/sin imagen/);
    expect(await testPrisma.publication.count()).toBe(0);
  });

  it('un archivo que no es imagen: 422 "format"', async () => {
    download = async () => Buffer.from('esto no es una imagen');
    const res = await approve((await manual()).id);
    expect(res.status).toBe(422);
    expect(res.body.imageProblem).toBe('format');
    expect(res.body.detail).toMatch(/no se puede usar/);
  });

  it('una imagen muy pesada: 422 "size"', async () => {
    download = async () => Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024 + 1)]);
    const res = await approve((await manual()).id);
    expect(res.status).toBe(422);
    expect(res.body.imageProblem).toBe('size');
    expect(res.body.detail).toMatch(/pesa demasiado/);
  });

  it('el servidor de la imagen falla: manual 422 y Instagram 502, ambos "download"', async () => {
    download = async () => {
      throw new MediaDownloadError('No pudimos descargar la imagen (el servidor respondió 403).');
    };
    const m = await approve((await manual()).id);
    expect(m.status).toBe(422);
    expect(m.body.imageProblem).toBe('download');
    const ig = await approve((await createSocialPostRow()).id);
    expect(ig.status).toBe(502);
    expect(ig.body.imageProblem).toBe('download');
    expect(await testPrisma.publication.count()).toBe(0);
  });

  it('un TIFF (sin firma JPG/PNG/WebP) se acepta y se reconvierte', async () => {
    download = async () =>
      sharp({ create: { width: 40, height: 30, channels: 3, background: '#8D775F' } })
        .tiff()
        .toBuffer();
    const res = await approve((await manual()).id);
    expect(res.status).toBe(201);
    expect(res.body.publication.coverUrl ?? res.body.publication.coverSrc).toBeTruthy();
  });
});

describe('publicar sin imagen', () => {
  it('con withoutImage crea la publicación sin portada, no descarga nada y audita', async () => {
    let calls = 0;
    download = async () => {
      calls += 1;
      return jpeg;
    };
    const p = await manual();
    const res = await approve(p.id, { withoutImage: true });
    expect(res.status).toBe(201);
    expect(calls).toBe(0);
    const pub = await testPrisma.publication.findFirstOrThrow();
    expect(pub.coverUrl).toBeNull();
    expect((await testPrisma.socialPost.findUnique({ where: { id: p.id } }))?.status).toBe(
      'LINKED',
    );
    const log = await testPrisma.auditLog.findFirstOrThrow({ where: { action: 'social.approve' } });
    expect(JSON.stringify(log.detail)).toContain('withoutImage');
  });

  it('tras un fallo de imagen, la publicación sigue pendiente y se puede reintentar sin imagen', async () => {
    download = async () => Buffer.from('<html></html>');
    const p = await manual();
    expect((await approve(p.id)).status).toBe(422);
    expect((await testPrisma.socialPost.findUnique({ where: { id: p.id } }))?.status).toBe(
      'DETECTED',
    );
    expect((await approve(p.id, { withoutImage: true })).status).toBe(201);
  });
});
