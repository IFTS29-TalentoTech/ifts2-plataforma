/**
 * Carga manual por enlace (ADR-045): Instagram no deja copiar la dirección de la imagen, solo la de la
 * publicación. Un solo campo acepta el enlace de la publicación (se resuelve con la API oficial, nunca raspando
 * instagram.com) o la dirección directa de una imagen de otro sitio.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GraphInstagramClient } from '../../src/infra/instagram';
import { assertPublicHttpUrl, MediaDownloadError } from '../../src/infra/media-download';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { InstagramMock } from '../helpers/instagram-mock';

const mock = new InstagramMock();
beforeAll(() => mock.start());
afterAll(() => mock.stop());

let t: TestApp;
let cookie: string;
const base = '/api/v1/social';

async function boot(connected: boolean) {
  t = await createTestApp({
    fetch: mock.fetch,
    downloadImage: async (url) => {
      assertPublicHttpUrl(url);
      const response = await mock.fetch(url);
      if (!response.ok) throw new MediaDownloadError('No pudimos descargar la imagen.');
      return Buffer.from(await response.arrayBuffer());
    },
    ...(connected
      ? {
          instagramClient: new GraphInstagramClient({
            method: 'token',
            accessToken: 'IGAA-token-de-prueba-123456',
            fetchFn: mock.fetch,
          }),
        }
      : {}),
  });
  cookie = (await loginAs(t.app, 'EDITOR')).cookie;
}

beforeEach(async () => {
  await resetDb();
  mock.reset();
  mock.media = Array.from({ length: 5 }, (_, i) => ({
    id: `Post${i}ABC`,
    caption: `Texto de la publicación ${i} #ifts2web`,
  }));
});

const manual = (body: object) =>
  request(t.app).post(`${base}/manual`).set('Cookie', cookie).send(body);
const approve = (id: string, body: object = {}) =>
  request(t.app)
    .post(`${base}/posts/${id}/approve`)
    .set('Cookie', cookie)
    .send({ section: 'BOTH', consentConfirmed: true, ...body });

describe('con la cuenta conectada', () => {
  beforeEach(() => boot(true));

  it('un enlace /reel/ con ?igsh= trae sola la imagen, la leyenda y la fecha, y se puede aprobar', async () => {
    const res = await manual({
      permalink: 'https://www.instagram.com/reel/Post4ABC/?igsh=MWx0b2g5',
    });
    expect(res.status).toBe(201);
    expect(res.body.resolution).toMatchObject({ source: 'instagram', imageFound: true });
    expect(res.body.caption).toBe('Texto de la publicación 4 #ifts2web');
    expect(res.body.permalink).toBe('https://www.instagram.com/p/Post4ABC/');
    expect(res.body.externalId).toBe('Post4ABC'); // la sincronización no la duplica después
    expect(res.body.mediaUrl).toContain('/img/Post4ABC.jpg');
    const ok = await approve(res.body.id);
    expect(ok.status).toBe(201);
    expect(ok.body.publication.coverSrc).toBeTruthy();
  });

  it('lo escrito a mano manda sobre lo que trae Instagram', async () => {
    const res = await manual({
      permalink: 'https://www.instagram.com/p/Post1ABC/',
      caption: 'Leyenda corregida a mano',
    });
    expect(res.status).toBe(201);
    expect(res.body.caption).toBe('Leyenda corregida a mano');
  });

  it('la misma publicación con otra forma del enlace es un 409', async () => {
    expect((await manual({ permalink: 'https://www.instagram.com/p/Post2ABC/' })).status).toBe(201);
    const again = await manual({ permalink: 'https://instagram.com/reel/Post2ABC?igsh=x' });
    expect(again.status).toBe(409);
  });

  it('si no está entre las recientes avisa el motivo y sigue con lo escrito a mano', async () => {
    const sin = await manual({ permalink: 'https://www.instagram.com/p/NoExiste99/' });
    expect(sin.status).toBe(400); // sin leyenda no hay de dónde sacarla
    expect(JSON.stringify(sin.body)).toMatch(/leyenda/i);
    const res = await manual({
      permalink: 'https://www.instagram.com/p/NoExiste99/',
      caption: 'Escrita a mano #ifts2web',
    });
    expect(res.status).toBe(201);
    expect(res.body.resolution.source).toBe('none');
    expect(res.body.resolution.imageFound).toBe(false);
    expect(res.body.resolution.reason).toMatch(/No encontramos esa publicación/);
    // Sin imagen: al aprobar se explica y se puede publicar sin imagen.
    const blocked = await approve(res.body.id);
    expect(blocked.status).toBe(422);
    expect(blocked.body.imageProblem).toBe('missing');
    expect((await approve(res.body.id, { withoutImage: true })).status).toBe(201);
  });

  it('si Meta falla al buscar la publicación, la carga manual NO se rompe', async () => {
    mock.listError = {
      status: 400,
      body: { error: { message: '(#10) Permission denied', type: 'OAuthException', code: 10 } },
    };
    const res = await manual({
      permalink: 'https://www.instagram.com/p/Post1ABC/',
      caption: 'A mano',
    });
    expect(res.status).toBe(201);
    expect(res.body.resolution.source).toBe('none');
    expect(res.body.resolution.reason).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('IGAA-token');
  });
});

describe('un solo campo: enlace de Instagram o dirección de una imagen', () => {
  beforeEach(() => boot(false));

  it('una dirección que NO es de Instagram se toma como la imagen', async () => {
    const res = await manual({
      permalink: 'https://scontent.cdninstagram.com/img/Post3ABC.jpg',
      caption: 'Foto de otro sitio',
    });
    expect(res.status).toBe(201);
    expect(res.body.resolution.source).toBe('none');
    expect(res.body.mediaUrl).toBe('https://scontent.cdninstagram.com/img/Post3ABC.jpg');
    expect((await approve(res.body.id)).status).toBe(201);
  });

  it('con la cuenta sin conectar (demostración) explica por qué no trajo la imagen', async () => {
    const res = await manual({
      permalink: 'https://www.instagram.com/p/Post1ABC/',
      caption: 'A mano',
    });
    expect(res.status).toBe(201);
    expect(res.body.resolution.reason).toMatch(/no está conectada/);
    expect(await testPrisma.auditLog.count({ where: { action: 'social.manual' } })).toBe(1);
  });
});
