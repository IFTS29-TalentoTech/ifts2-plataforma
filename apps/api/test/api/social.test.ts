/**
 * Módulo social (RF04, ADR-09): sincronización idempotente, moderación, carga manual, cron y degradación
 * cuando falla Instagram. La API de Instagram y la CDN de imágenes se simulan con un servidor HTTP local.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { assertPublicHttpUrl, MediaDownloadError } from '../../src/infra/media-download';
import { InstagramApiError, InstagramNotConfiguredError } from '../../src/infra/instagram';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createCategory } from '../helpers/factories';
import { InstagramMock, TOKEN_ERROR_BODY } from '../helpers/instagram-mock';
import { createSocialPostRow, setSetting } from '../helpers/social-factories';

const mock = new InstagramMock();
beforeAll(() => mock.start());
afterAll(() => mock.stop());

let t: TestApp;
let cookie: string;
const base = '/api/v1/social';
const TOKEN = 'IGAA-token-secreto-de-prueba-123456';
const day = (n: number) => new Date(Date.now() + n * 86_400_000);
const CRON = 'secreto-del-cron-0123456789';

async function boot(over: Parameters<typeof createTestApp>[0] = {}) {
  t = await createTestApp({
    fetch: mock.fetch,
    downloadImage: async (url) => {
      assertPublicHttpUrl(url);
      const response = await mock.fetch(url);
      if (!response.ok) throw new MediaDownloadError('No pudimos descargar la imagen.');
      return Buffer.from(await response.arrayBuffer());
    },
    ...over,
  });
  cookie = (await loginAs(t.app, 'EDITOR')).cookie;
}

beforeEach(async () => {
  await resetDb();
  mock.reset();
  await boot();
});

const sync = (c = cookie) => request(t.app).post(`${base}/sync`).set('Cookie', c);
const list = (qs = '', c = cookie) => request(t.app).get(`${base}/posts${qs}`).set('Cookie', c);
const approve = (id: string, body: object = {}, c = cookie) =>
  request(t.app)
    .post(`${base}/posts/${id}/approve`)
    .set('Cookie', c)
    .send({ section: 'BOTH', consentConfirmed: true, ...body });
const post = (id: string, action: string, c = cookie) =>
  request(t.app).post(`${base}/posts/${id}/${action}`).set('Cookie', c);
const audited = (action: string) => testPrisma.auditLog.count({ where: { action } });
const NIL = '6f1c8a5e-1d3b-4c55-9b1e-2f0c1a7b9d11';

/** Conecta una cuenta "real" (guardada cifrada en la base) para usar el cliente Graph contra el mock. */
async function connectReal(over: { expiresInDays?: number | null } = {}) {
  await t.ctx.integrations.set('instagram', {
    mode: 'real',
    appId: '123',
    appSecret: 'secreto-de-la-app',
    accessToken: TOKEN,
    ...(over.expiresInDays === null
      ? {}
      : { tokenExpiresAt: day(over.expiresInDays ?? 40).toISOString() }),
  });
}

describe('permisos', () => {
  it('401 sin sesión en todos los endpoints de panel', async () => {
    const r = request(t.app);
    expect((await r.post(`${base}/sync`)).status).toBe(401);
    expect((await r.get(`${base}/posts`)).status).toBe(401);
    expect((await r.post(`${base}/posts/${NIL}/approve`).send({})).status).toBe(401);
    expect((await r.post(`${base}/posts/${NIL}/discard`)).status).toBe(401);
    expect((await r.post(`${base}/posts/${NIL}/restore`)).status).toBe(401);
    expect((await r.post(`${base}/manual`).send({})).status).toBe(401);
    expect((await r.delete(`${base}/posts/${NIL}`)).status).toBe(401);
  });

  it('403 para BEDELIA en todos los endpoints', async () => {
    const { cookie: c } = await loginAs(t.app, 'BEDELIA');
    const r = request(t.app);
    expect((await r.post(`${base}/sync`).set('Cookie', c)).status).toBe(403);
    expect((await r.get(`${base}/posts`).set('Cookie', c)).status).toBe(403);
    expect((await r.post(`${base}/posts/${NIL}/approve`).set('Cookie', c).send({})).status).toBe(
      403,
    );
    expect((await r.post(`${base}/posts/${NIL}/discard`).set('Cookie', c)).status).toBe(403);
    expect((await r.post(`${base}/posts/${NIL}/restore`).set('Cookie', c)).status).toBe(403);
    expect((await r.post(`${base}/manual`).set('Cookie', c).send({})).status).toBe(403);
    expect((await r.delete(`${base}/posts/${NIL}`).set('Cookie', c)).status).toBe(403);
  });

  it('ADMIN y EDITOR pueden moderar', async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
    for (const role of ['ADMIN', 'EDITOR'] as const) {
      const { cookie: c } = await loginAs(t.app, role);
      expect((await sync(c)).status).toBe(200);
    }
  });
});

describe('POST /social/sync (modo demostración)', () => {
  it('422 con mensaje claro si no hay hashtag configurado, sin tocar nada', async () => {
    const res = await sync();
    expect(res.status).toBe(422);
    expect(res.body.detail).toMatch(/hashtag configurado/);
    expect(res.body.errors.hashtag).toBeDefined();
    expect(await testPrisma.socialPost.count()).toBe(0);
  });

  it('trae las publicaciones con el hashtag como PENDIENTES (nada llega al sitio sin aprobación)', async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
    const res = await sync();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 3, matched: 3, alreadyKnown: 0, demo: true });
    expect(typeof res.body.lastSyncAt).toBe('string');
    const rows = await testPrisma.socialPost.findMany();
    expect(rows.every((r) => r.status === 'DETECTED')).toBe(true);
    expect(await testPrisma.publication.count()).toBe(0);
    expect(await audited('social.sync')).toBe(1);
  });

  it('es idempotente: sincronizar dos veces no duplica', async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
    await sync();
    const second = await sync();
    expect(second.body).toMatchObject({ created: 0, matched: 3, alreadyKnown: 3 });
    expect(await testPrisma.socialPost.count()).toBe(3);
  });

  it('dos sincronizaciones simultáneas tampoco duplican', async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
    const [a, b] = await Promise.all([sync(), sync()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.created + b.body.created).toBe(3);
    expect(await testPrisma.socialPost.count()).toBe(3);
  });

  it('respeta el hashtag configurado (cambiarlo cambia lo que se importa)', async () => {
    await setSetting('instagram_hashtag', '#otrohashtag');
    const res = await sync();
    expect(res.body).toMatchObject({ created: 0, matched: 0 });
  });

  it('las ya moderadas conservan su estado al volver a sincronizar', async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
    await sync();
    const [one, two] = await testPrisma.socialPost.findMany({ orderBy: { externalId: 'asc' } });
    await post(one!.id, 'discard');
    await approve(two!.id);
    await sync();
    expect((await testPrisma.socialPost.findUnique({ where: { id: one!.id } }))?.status).toBe(
      'DISCARDED',
    );
    expect((await testPrisma.socialPost.findUnique({ where: { id: two!.id } }))?.status).toBe(
      'LINKED',
    );
  });

  it('actualiza la imagen (la URL de Instagram vence) solo de las pendientes', async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
    await createSocialPostRow({
      externalId: 'fake-ig-001',
      mediaUrl: 'https://viejo.example.com/a.jpg',
    });
    await createSocialPostRow({
      externalId: 'fake-ig-002',
      mediaUrl: 'https://viejo.example.com/b.jpg',
      status: 'DISCARDED',
    });
    await sync();
    const a = await testPrisma.socialPost.findUnique({ where: { externalId: 'fake-ig-001' } });
    const b = await testPrisma.socialPost.findUnique({ where: { externalId: 'fake-ig-002' } });
    expect(a?.mediaUrl).toContain('example.invalid');
    expect(b?.mediaUrl).toBe('https://viejo.example.com/b.jpg');
  });

  it('guarda el resultado de la última sincronización para el Resumen', async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
    await sync();
    const row = await testPrisma.instagramToken.findUnique({ where: { id: 1 } });
    expect(row?.lastSyncOk).toBe(true);
    expect(row?.lastSyncAt).toBeInstanceOf(Date);
  });
});

describe('POST /social/sync: Instagram falla (degradación)', () => {
  beforeEach(async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
  });

  it('502 con mensaje claro, registra el error y el resto del panel sigue funcionando', async () => {
    t.instagram.failWith = new InstagramApiError('Instagram respondió con un error (500).');
    const res = await sync();
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('bad-gateway');
    expect(res.body.detail).toMatch(/respondió con un error \(500\)/);
    expect(res.body.detail).toMatch(/cargar publicaciones a mano/);
    const row = await testPrisma.instagramToken.findUnique({ where: { id: 1 } });
    expect(row?.lastSyncOk).toBe(false);
    expect(await audited('social.sync.failed')).toBe(1);
    // el panel y la carga manual siguen andando
    expect((await list()).status).toBe(200);
    const manual = await request(t.app).post(`${base}/manual`).set('Cookie', cookie).send({
      permalink: 'https://www.instagram.com/p/XYZ/',
      caption: 'Cargada a mano #ifts2web',
      mediaUrl: 'https://scontent.cdninstagram.com/img/x.jpg',
      postedAt: '2026-10-20',
    });
    expect(manual.status).toBe(201);
  });

  it('un error inesperado se muestra con un mensaje genérico (sin detalles internos)', async () => {
    t.instagram.failWith = new Error('ECONNRESET 10.0.0.1:443 token=SECRETO');
    const res = await sync();
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('SECRETO');
    expect(res.body.detail).toMatch(/No pudimos sincronizar con Instagram/);
  });

  it('si la cuenta no está configurada es un 422 (no una caída de Instagram)', async () => {
    t.instagram.failWith = new InstagramNotConfiguredError();
    const res = await sync();
    expect(res.status).toBe(422);
    expect(await audited('social.sync.failed')).toBe(0);
  });

  it('se recupera solo: la siguiente sincronización correcta limpia el error', async () => {
    t.instagram.failWith = new InstagramApiError('caída');
    await sync();
    t.instagram.failWith = null;
    expect((await sync()).status).toBe(200);
    expect((await testPrisma.instagramToken.findUnique({ where: { id: 1 } }))?.lastSyncOk).toBe(
      true,
    );
  });
});

describe('POST /social/sync con la API real simulada (GraphInstagramClient + servidor HTTP)', () => {
  beforeEach(async () => {
    await boot({ useRealIntegrationResolution: true });
    await setSetting('instagram_hashtag', '#ifts2web');
    await connectReal();
  });

  it('pagina, filtra por hashtag y guarda como pendientes', async () => {
    mock.media = [
      { id: 'r1', caption: 'Primera #ifts2web' },
      { id: 'r2', caption: 'Sin etiqueta' },
      { id: 'r3', caption: 'Tercera #IFTS2WEB' },
      { id: 'r4', caption: 'Otra #ifts2web2' },
      { id: 'r5', caption: 'Quinta #ifts2web' },
    ];
    const res = await sync();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 3, matched: 3, demo: false });
    const ids = (await testPrisma.socialPost.findMany({ orderBy: { externalId: 'asc' } })).map(
      (p) => p.externalId,
    );
    expect(ids).toEqual(['r1', 'r3', 'r5']);
    expect((await sync()).body).toMatchObject({ created: 0, alreadyKnown: 3 });
  });

  it('token vencido en Instagram: 502 claro, el Resumen muestra el error y NO se filtra el token', async () => {
    mock.mediaError = { status: 400, body: TOKEN_ERROR_BODY };
    const res = await sync();
    expect(res.status).toBe(502);
    expect(res.body.detail).toMatch(/Volvé a conectar la cuenta/);
    const dash = await request(t.app).get('/api/v1/dashboard').set('Cookie', cookie);
    expect(dash.body.instagram).toMatchObject({ mode: 'real', ok: false });
    expect(dash.body.instagram.error).toMatch(/Volvé a conectar/);
    const everything = JSON.stringify([
      res.body,
      dash.body,
      await testPrisma.auditLog.findMany(),
      await testPrisma.instagramToken.findMany(),
    ]);
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain('secreto-de-la-app');
  });

  it('antes de sincronizar renueva el token si le quedan 10 días o menos', async () => {
    await connectReal({ expiresInDays: 5 });
    mock.media = [{ id: 'r1', caption: '#ifts2web' }];
    const res = await sync();
    expect(res.status).toBe(200);
    expect(res.body.token.status).toBe('renewed');
    expect(mock.callsTo('/refresh_access_token')).toHaveLength(1);
    const stored = await t.ctx.integrations.get('instagram');
    expect(stored?.accessToken).toBe(`${TOKEN}-renovado`);
    // se leyó con el token NUEVO
    expect(mock.callsTo('/me/media')[0]!.query.get('access_token')).toBe(`${TOKEN}-renovado`);
    expect(new Date(stored!.tokenExpiresAt!).getTime()).toBeGreaterThan(day(50).getTime());
    expect(
      (await testPrisma.instagramToken.findUnique({ where: { id: 1 } }))?.expiresAt.getTime(),
    ).toBeGreaterThan(day(50).getTime());
  });

  it('con el token vigente no lo renueva', async () => {
    mock.media = [{ id: 'r1', caption: '#ifts2web' }];
    const res = await sync();
    expect(res.body.token).toEqual({ status: 'skipped', reason: 'not-needed' });
    expect(mock.callsTo('/refresh_access_token')).toHaveLength(0);
  });
});

describe('renovación del token (token.service)', () => {
  beforeEach(async () => {
    await boot({ useRealIntegrationResolution: true });
  });

  it('no hace nada en modo demostración ni sin token', async () => {
    const { renewInstagramTokenIfNeeded } = await import('../../src/modules/social/token.service');
    expect(await renewInstagramTokenIfNeeded(t.ctx)).toEqual({
      status: 'skipped',
      reason: 'not-real-mode',
    });
    await t.ctx.integrations.set('instagram', { mode: 'real', appId: '1', appSecret: 'x' });
    expect(await renewInstagramTokenIfNeeded(t.ctx)).toEqual({
      status: 'skipped',
      reason: 'no-token',
    });
  });

  it('vencido: no intenta renovar y deja el motivo para el Resumen', async () => {
    const { renewInstagramTokenIfNeeded } = await import('../../src/modules/social/token.service');
    await connectReal({ expiresInDays: -1 });
    const r = await renewInstagramTokenIfNeeded(t.ctx);
    expect(r.status).toBe('expired');
    expect(mock.callsTo('/refresh_access_token')).toHaveLength(0);
    expect((await t.ctx.integrations.get('instagram'))?.lastError).toMatch(/Volvé a conectar/);
  });

  it('falla la renovación con vencimiento conocido: registra el motivo y no lanza', async () => {
    const { renewInstagramTokenIfNeeded } = await import('../../src/modules/social/token.service');
    await connectReal({ expiresInDays: 3 });
    mock.refreshError = { status: 500, body: {} };
    const r = await renewInstagramTokenIfNeeded(t.ctx);
    expect(r.status).toBe('failed');
    expect((await t.ctx.integrations.get('instagram'))?.lastError).toBeTruthy();
    expect((await t.ctx.integrations.get('instagram'))?.accessToken).toBe(TOKEN); // conserva el actual
  });

  it('vencimiento desconocido (token pegado a mano): intenta renovar; si falla no marca error', async () => {
    const { renewInstagramTokenIfNeeded } = await import('../../src/modules/social/token.service');
    await connectReal({ expiresInDays: null });
    mock.refreshError = { status: 400, body: TOKEN_ERROR_BODY };
    expect((await renewInstagramTokenIfNeeded(t.ctx)).status).toBe('failed');
    expect((await t.ctx.integrations.get('instagram'))?.lastError ?? null).toBeNull();
    mock.refreshError = null;
    const ok = await renewInstagramTokenIfNeeded(t.ctx);
    expect(ok.status).toBe('renewed');
    expect((await t.ctx.integrations.get('instagram'))?.tokenExpiresAt).toBeTruthy(); // ahora se conoce
  });

  it('renovar audita sin incluir el token', async () => {
    const { renewInstagramTokenIfNeeded } = await import('../../src/modules/social/token.service');
    await connectReal({ expiresInDays: 2 });
    await renewInstagramTokenIfNeeded(t.ctx);
    const logs = await testPrisma.auditLog.findMany({
      where: { action: 'integration.instagram.token-refresh' },
    });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
  });
});

describe('GET /social/posts', () => {
  it('lista paginado, más nuevas primero, con conteo por estado', async () => {
    await createSocialPostRow({ externalId: 'a', postedAt: new Date('2026-10-01') });
    await createSocialPostRow({ externalId: 'b', postedAt: new Date('2026-10-03') });
    await createSocialPostRow({
      externalId: 'c',
      postedAt: new Date('2026-10-02'),
      status: 'DISCARDED',
    });
    const res = await list('?pageSize=2&page=1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      counts: { DETECTED: 2, LINKED: 0, DISCARDED: 1 },
    });
    expect(res.body.items.map((i: { externalId: string }) => i.externalId)).toEqual(['b', 'c']);
    expect(res.body.items[0]).toMatchObject({
      platform: 'INSTAGRAM',
      source: 'instagram',
      status: 'DETECTED',
      publication: null,
    });
  });

  it('filtra por origen (?source=) en el servidor: instagram o carga manual', async () => {
    await createSocialPostRow({ status: 'DETECTED' });
    await createSocialPostRow({ status: 'DETECTED' });
    await createSocialPostRow({ status: 'DETECTED', externalId: 'manual-abc' });
    await createSocialPostRow({ status: 'DISCARDED', externalId: 'manual-def' });
    const ig = (await list('?status=DETECTED&source=instagram')).body;
    expect(ig.total).toBe(2);
    expect(ig.items.every((p: { source: string }) => p.source === 'instagram')).toBe(true);
    const man = (await list('?status=DETECTED&source=manual')).body;
    expect(man.total).toBe(1);
    expect(man.items[0].source).toBe('manual');
    // Los conteos por estado siguen siendo globales (alimentan las pestañas).
    expect(man.counts).toMatchObject({ DETECTED: 3, DISCARDED: 1 });
    expect((await list('?source=otro')).status).toBe(400);
  });

  it('filtra por estado y valida el filtro', async () => {
    await createSocialPostRow({ status: 'DETECTED' });
    await createSocialPostRow({ status: 'DISCARDED' });
    expect((await list('?status=DETECTED&pageSize=3')).body.total).toBe(1);
    expect((await list('?status=DISCARDED')).body.items).toHaveLength(1);
    const bad = await list('?status=OTRO');
    expect(bad.status).toBe(400);
    expect(bad.body.errors.status[0]).toMatch(/elegí una opción válida/);
    expect((await list('?pageSize=500')).status).toBe(400);
  });
});

describe('POST /social/posts/:id/approve', () => {
  it('aprueba: crea la publicación PUBLISHED de origen INSTAGRAM, copia la imagen y vincula', async () => {
    const cat = await createCategory({ name: 'Eventos', kind: 'PUBLICATION' });
    const p = await createSocialPostRow({
      caption: 'Jornada en Lugano. Muy linda. #ifts2web',
      mediaUrl: 'https://scontent.cdninstagram.com/img/jornada.jpg',
    });
    const res = await approve(p.id, {
      categoryId: cat.id,
      section: 'HOME',
      visibleUntil: '2030-12-31',
    });
    expect(res.status).toBe(201);
    expect(res.body.publication).toMatchObject({
      status: 'PUBLISHED',
      origin: 'INSTAGRAM',
      kind: 'NEWS',
      section: 'HOME',
      title: 'Jornada en Lugano',
      category: { id: cat.id, name: 'Eventos' },
      socialPostId: p.id,
      visible: true,
      expired: false,
    });
    expect(res.body.publication.coverUrl).toMatch(/^social\/.+\.webp$/);
    expect(res.body.publication.coverSrc).toBeTruthy();
    expect(res.body.post).toMatchObject({ id: p.id, status: 'LINKED' });
    expect(res.body.post.publication).toMatchObject({
      id: res.body.publication.id,
      status: 'PUBLISHED',
    });
    // la imagen se copió a NUESTRO almacenamiento (las URLs de Instagram expiran)
    expect(await t.storage.exists(res.body.publication.coverUrl)).toBe(true);
    expect(mock.callsTo('/img/jornada.jpg')).toHaveLength(1);
    expect(await audited('social.approve')).toBe(1);
    expect(await audited('publication.create')).toBe(1);
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'social.approve' } });
    expect(log?.detail).toMatchObject({ consentConfirmed: true, section: 'HOME' });
  });

  it('usa título y resumen del editor si los envía, y respeta una vigencia futura de inicio', async () => {
    const p = await createSocialPostRow({
      mediaUrl: 'https://scontent.cdninstagram.com/img/b.jpg',
    });
    const res = await approve(p.id, {
      title: 'Título a mano',
      summary: 'Resumen a mano',
      visibleFrom: '2030-01-10',
    });
    expect(res.body.publication).toMatchObject({
      title: 'Título a mano',
      summary: 'Resumen a mano',
      visible: false,
    });
  });

  it('en modo demostración (imágenes .invalid) usa una imagen neutra y el flujo se completa', async () => {
    await setSetting('instagram_hashtag', '#ifts2web');
    await sync();
    const first = await testPrisma.socialPost.findFirstOrThrow();
    const res = await approve(first.id);
    expect(res.status).toBe(201);
    expect(await t.storage.exists(res.body.publication.coverUrl)).toBe(true);
  });

  it('exige confirmar explícitamente el consentimiento (400 con mensaje claro)', async () => {
    const p = await createSocialPostRow();
    const cases = [
      { consentConfirmed: false },
      { consentConfirmed: 'true' },
      { consentConfirmed: undefined },
    ];
    for (const c of cases) {
      const res = await request(t.app)
        .post(`${base}/posts/${p.id}/approve`)
        .set('Cookie', cookie)
        .send({ section: 'BOTH', ...c });
      expect(res.status).toBe(400);
      expect(res.body.errors.consentConfirmed[0]).toMatch(/consentimiento/);
    }
    expect(await testPrisma.publication.count()).toBe(0);
    expect((await testPrisma.socialPost.findUnique({ where: { id: p.id } }))?.status).toBe(
      'DETECTED',
    );
  });

  it('valida la sección y la ventana de fechas', async () => {
    const p = await createSocialPostRow();
    const bad = await approve(p.id, { section: 'PORTADA' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.section).toBeDefined();
    const win = await approve(p.id, { visibleFrom: '2030-02-01', visibleUntil: '2030-01-01' });
    expect(win.status).toBe(400);
    const past = await approve(p.id, { visibleUntil: '2020-01-01' });
    expect(past.status).toBe(422);
    expect(past.body.errors.visibleUntil[0]).toMatch(/futura/);
  });

  it('422 si la categoría no existe o no es de publicaciones', async () => {
    const p = await createSocialPostRow();
    const aviso = await createCategory({ name: 'Aviso', kind: 'NOTICE' });
    expect((await approve(p.id, { categoryId: aviso.id })).status).toBe(422);
    expect((await approve(p.id, { categoryId: NIL })).status).toBe(422);
  });

  it('409 si ya estaba vinculada (no se duplica la publicación)', async () => {
    const p = await createSocialPostRow({
      mediaUrl: 'https://scontent.cdninstagram.com/img/c.jpg',
    });
    expect((await approve(p.id)).status).toBe(201);
    const again = await approve(p.id);
    expect(again.status).toBe(409);
    expect(again.body.detail).toMatch(/ya está vinculada/);
    expect(await testPrisma.publication.count()).toBe(1);
  });

  it('409 si está descartada (hay que restaurarla antes) y 404 si no existe', async () => {
    const p = await createSocialPostRow({ status: 'DISCARDED' });
    const res = await approve(p.id);
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/Restaurala/);
    expect((await approve(NIL)).status).toBe(404);
    expect((await approve('no-es-uuid')).status).toBe(400);
  });

  it('dos aprobaciones simultáneas: una gana, la otra recibe 409 y no queda una imagen huérfana', async () => {
    const p = await createSocialPostRow({
      mediaUrl: 'https://scontent.cdninstagram.com/img/d.jpg',
    });
    const [a, b] = await Promise.all([approve(p.id), approve(p.id)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await testPrisma.publication.count()).toBe(1);
    const pub = await testPrisma.publication.findFirstOrThrow();
    const keys = [...(t.storage as unknown as { files: Map<string, unknown> }).files.keys()];
    expect(keys).toEqual([pub.coverUrl]);
  });

  it('la imagen vencida/no disponible: 502 claro y no se crea nada (sigue pendiente)', async () => {
    mock.goneImages.add('/img/gone.jpg');
    const p = await createSocialPostRow({
      mediaUrl: 'https://scontent.cdninstagram.com/img/gone.jpg',
    });
    const res = await approve(p.id);
    expect(res.status).toBe(502);
    expect(res.body.detail).toMatch(/Sincronizá de nuevo/);
    expect(await testPrisma.publication.count()).toBe(0);
    expect((await testPrisma.socialPost.findUnique({ where: { id: p.id } }))?.status).toBe(
      'DETECTED',
    );
  });

  it.each([
    ['manual-dns-bloqueado', 422],
    ['instagram-dns-bloqueado', 502],
  ])(
    'un destino rechazado conserva pendiente %s y permite reintentar',
    async (externalId, status) => {
      const p = await createSocialPostRow({
        externalId: String(externalId),
        mediaUrl: 'https://scontent.cdninstagram.com/img/reintento.jpg',
      });
      const downloader = t.ctx.downloadImage;
      t.ctx.downloadImage = async () => {
        throw new MediaDownloadError('La dirección de la imagen apunta a una red no permitida.');
      };
      const failed = await approve(p.id);
      expect(failed.status).toBe(status);
      expect(failed.body.detail).toMatch(/red no permitida/);
      expect(await testPrisma.publication.count()).toBe(0);
      expect(await audited('social.approve')).toBe(0);
      expect((await testPrisma.socialPost.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
        'DETECTED',
      );
      expect((await list()).status).toBe(200);
      expect(mock.calls).toHaveLength(0);
      t.ctx.downloadImage = downloader;
      expect((await approve(p.id)).status).toBe(201);
      expect(await testPrisma.publication.count()).toBe(1);
    },
  );

  it('una imagen inválida (no es JPG/PNG/WebP) da 422', async () => {
    const p = await createSocialPostRow({
      mediaUrl: 'https://scontent.cdninstagram.com/bad/not-image',
    });
    const res = await approve(p.id);
    expect(res.status).toBe(422);
    expect(res.body.detail).toMatch(/no se puede usar/);
    expect(await testPrisma.publication.count()).toBe(0);
  });
});

describe('descartar, restaurar y eliminar', () => {
  it('descartar -> pasa a DESCARTADAS, no aparece en el sitio, y se puede restaurar', async () => {
    const p = await createSocialPostRow();
    const d = await post(p.id, 'discard');
    expect(d.status).toBe(200);
    expect(d.body.status).toBe('DISCARDED');
    expect(await audited('social.discard')).toBe(1);
    expect((await list('?status=DISCARDED')).body.total).toBe(1);
    expect((await list('?status=DETECTED')).body.total).toBe(0);
    const r = await post(p.id, 'restore');
    expect(r.body.status).toBe('DETECTED');
    expect(await audited('social.restore')).toBe(1);
  });

  it('409 en transiciones inválidas y 404 si no existe', async () => {
    const detected = await createSocialPostRow();
    expect((await post(detected.id, 'restore')).status).toBe(409); // restaurar una pendiente
    await post(detected.id, 'discard');
    expect((await post(detected.id, 'discard')).status).toBe(409); // descartar dos veces
    const linked = await createSocialPostRow({ status: 'LINKED' });
    expect((await post(linked.id, 'discard')).status).toBe(409);
    expect((await post(NIL, 'discard')).status).toBe(404);
    expect((await post(NIL, 'restore')).status).toBe(404);
  });

  it('DELETE: solo descartadas (204, auditado); pendientes y vinculadas dan 409', async () => {
    const del = (id: string) => request(t.app).delete(`${base}/posts/${id}`).set('Cookie', cookie);
    const discarded = await createSocialPostRow({ status: 'DISCARDED' });
    const detected = await createSocialPostRow({ status: 'DETECTED' });
    const linked = await createSocialPostRow({ status: 'LINKED' });
    expect((await del(detected.id)).status).toBe(409);
    const l = await del(linked.id);
    expect(l.status).toBe(409);
    expect(l.body.detail).toMatch(/vinculada/);
    expect((await del(discarded.id)).status).toBe(204);
    expect(await testPrisma.socialPost.findUnique({ where: { id: discarded.id } })).toBeNull();
    expect(await audited('social.delete')).toBe(1);
    expect((await del(NIL)).status).toBe(404);
  });
});

describe('POST /social/manual (contingencia)', () => {
  const manual = (body: object) =>
    request(t.app).post(`${base}/manual`).set('Cookie', cookie).send(body);
  const valid = {
    permalink: 'https://www.instagram.com/p/ABC123/',
    caption: 'Acto de egreso #ifts2web',
    mediaUrl: 'https://scontent.cdninstagram.com/img/egreso.jpg',
    postedAt: '2026-10-15',
  };

  it('crea una publicación de redes pendiente que sigue el mismo flujo de moderación', async () => {
    const res = await manual(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'DETECTED',
      source: 'manual',
      permalink: valid.permalink,
    });
    expect(await audited('social.manual')).toBe(1);
    const ok = await approve(res.body.id);
    expect(ok.status).toBe(201);
    expect(ok.body.publication.origin).toBe('INSTAGRAM');
  });

  it('valida los campos con mensajes en español', async () => {
    const res = await manual({
      permalink: 'instagram.com/p/x',
      caption: '',
      mediaUrl: '',
      postedAt: 'ayer',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.permalink[0]).toMatch(/http/);
    expect(res.body.errors.caption[0]).toMatch(/La leyenda es obligator/);
    expect(res.body.errors.postedAt[0]).toMatch(/fecha válida/);
  });

  it('409 si ya está cargada esa publicación', async () => {
    await manual(valid);
    const dup = await manual(valid);
    expect(dup.status).toBe(409);
    expect(dup.body.errors.permalink[0]).toMatch(/Ya existe/);
  });

  it('no permite copiar imágenes de direcciones internas (SSRF): 422 al aprobar', async () => {
    const res = await manual({ ...valid, mediaUrl: 'http://127.0.0.1:4000/api/v1/health' });
    expect(res.status).toBe(201);
    const ap = await approve(res.body.id);
    expect(ap.status).toBe(422);
    expect(ap.body.detail).toMatch(/red no permitida/);
    expect(await testPrisma.publication.count()).toBe(0);
    expect(mock.calls).toHaveLength(0);
  });
});

describe('POST /social/cron (cron externo)', () => {
  const cron = (headers: Record<string, string> = {}) => {
    const r = request(t.app).post(`${base}/cron`);
    for (const [k, v] of Object.entries(headers)) r.set(k, v);
    return r;
  };

  it('deshabilitado (403) si no hay CRON_SECRET configurado', async () => {
    const res = await cron({ 'x-cron-secret': CRON });
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/CRON_SECRET/);
  });

  describe('con CRON_SECRET', () => {
    beforeEach(async () => {
      const config = loadConfig(process.env);
      await boot({
        config: { ...config, social: { ...config.social, cronSecret: CRON } },
        useRealIntegrationResolution: true,
      });
      await setSetting('instagram_hashtag', '#ifts2web');
    });

    it('401 sin secreto o con uno incorrecto (aunque haya sesión de otro rol no sirve)', async () => {
      expect((await cron()).status).toBe(401);
      expect((await cron({ 'x-cron-secret': 'incorrecto-incorrecto' })).status).toBe(401);
      expect((await cron({ authorization: 'Bearer otro' })).status).toBe(401);
      expect((await cron().set('Cookie', cookie)).status).toBe(401);
    });

    it('en demostración omite la sincronización', async () => {
      const res = await cron({ 'x-cron-secret': CRON });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, sync: { status: 'skipped', reason: 'demo' } });
    });

    it('con cuenta real: renueva el token y sincroniza (acepta Authorization: Bearer)', async () => {
      await connectReal({ expiresInDays: 4 });
      mock.media = [{ id: 'c1', caption: 'Cron #ifts2web' }];
      const res = await cron({ authorization: `Bearer ${CRON}` });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.token.status).toBe('renewed');
      expect(res.body.sync).toMatchObject({ status: 'done', created: 1 });
      expect(await testPrisma.socialPost.count()).toBe(1);
      expect(JSON.stringify(res.body)).not.toContain(TOKEN);
      // segunda vez: idempotente
      const again = await cron({ 'x-cron-secret': CRON });
      expect(again.body.sync).toMatchObject({ status: 'done', created: 0 });
    });

    it('si Instagram falla responde 200 con ok:false y el motivo (el cron no rompe nada)', async () => {
      await connectReal();
      mock.mediaError = { status: 500, body: {} };
      const res = await cron({ 'x-cron-secret': CRON });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: false,
        sync: { status: 'failed', code: 'bad-gateway' },
      });
    });

    it('sin hashtag configurado omite la sincronización', async () => {
      await connectReal();
      await testPrisma.siteSetting.deleteMany();
      const res = await cron({ 'x-cron-secret': CRON });
      expect(res.body.sync).toEqual({ status: 'skipped', reason: 'no-hashtag' });
    });
  });
});
