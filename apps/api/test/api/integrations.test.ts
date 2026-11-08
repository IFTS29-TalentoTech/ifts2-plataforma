import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { loginAs } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';

let t: TestApp;
let cookie: string;
const SECRET = 'super-secreto-de-meta-ABCD1234';
const TOKEN = 'IGAA-token-de-acceso-largo-WXYZ9876';

beforeEach(async () => {
  await resetDb();
  t = await createTestApp({ useRealIntegrationResolution: true });
  cookie = (await loginAs(t.app, 'ADMIN')).cookie;
});

const put = (body: object, c = cookie) =>
  request(t.app).put('/api/v1/integrations/instagram').set('Cookie', c).send(body);
const get = (c = cookie) => request(t.app).get('/api/v1/integrations/instagram').set('Cookie', c);

describe('permisos', () => {
  it('401 sin sesión', async () => {
    expect((await request(t.app).get('/api/v1/integrations/instagram')).status).toBe(401);
    expect((await request(t.app).get('/api/v1/integrations/mail')).status).toBe(401);
  });
  for (const role of ['BEDELIA', 'EDITOR'] as const) {
    it(`403 para ${role} en todos los endpoints`, async () => {
      const { cookie: c } = await loginAs(t.app, role);
      const base = '/api/v1/integrations';
      expect((await request(t.app).get(`${base}/instagram`).set('Cookie', c)).status).toBe(403);
      expect(
        (await request(t.app).put(`${base}/instagram`).set('Cookie', c).send({ mode: 'demo' }))
          .status,
      ).toBe(403);
      expect((await request(t.app).get(`${base}/instagram/connect`).set('Cookie', c)).status).toBe(
        403,
      );
      expect((await request(t.app).get(`${base}/instagram/callback`).set('Cookie', c)).status).toBe(
        403,
      );
      expect((await request(t.app).post(`${base}/instagram/test`).set('Cookie', c)).status).toBe(
        403,
      );
      expect(
        (await request(t.app).post(`${base}/instagram/disconnect`).set('Cookie', c)).status,
      ).toBe(403);
      expect((await request(t.app).get(`${base}/mail`).set('Cookie', c)).status).toBe(403);
      expect(
        (
          await request(t.app)
            .put(`${base}/mail`)
            .set('Cookie', c)
            .send({ contactToEmail: 'a@b.com' })
        ).status,
      ).toBe(403);
    });
  }
});

describe('Instagram: estado y guía', () => {
  it('sin configurar: modo demostración, redirectUri exacta, scopes y guía paso a paso', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'demo',
      statusLabel: 'Sin configurar (modo demostración)',
      demoMode: true,
      redirectUri: 'http://localhost:4000/api/v1/integrations/instagram/callback',
      hasAccessToken: false,
    });
    expect(res.body.scopes).toContain('instagram_business_basic');
    expect(res.body.setupSteps.steps.length).toBeGreaterThanOrEqual(5);
    expect(res.body.setupSteps.manualTokenNote).toMatch(/token/i);
  });

  it('recorre los estados: credenciales guardadas -> conectada -> por vencer -> error -> demo', async () => {
    await put({ mode: 'real', appId: '1234567890', appSecret: SECRET }).expect(200);
    expect((await get()).body.status).toBe('credentials_saved');

    await put({ accessToken: TOKEN }).expect(200);
    expect((await get()).body.status).toBe('connected');

    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await t.ctx.integrations.patch('instagram', { tokenExpiresAt: soon });
    expect((await get()).body.status).toBe('expiring');

    await t.ctx.integrations.patch('instagram', {
      tokenExpiresAt: new Date(Date.now() + 40 * 86_400_000).toISOString(),
      lastError: 'Token rechazado',
    });
    const err = await get();
    expect(err.body.status).toBe('error');
    expect(err.body.lastError).toBe('Token rechazado');

    const off = await request(t.app)
      .post('/api/v1/integrations/instagram/disconnect')
      .set('Cookie', cookie);
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ status: 'demo', demoMode: true, hasAccessToken: false });
  });
});

describe('Instagram: los secretos nunca salen', () => {
  it('ninguna respuesta contiene App Secret ni token en claro; en base están cifrados', async () => {
    const a = await put({
      mode: 'real',
      appId: '1234567890',
      appSecret: SECRET,
      accessToken: TOKEN,
      hashtag: 'ifts2web',
    });
    expect(a.status).toBe(200);
    const responses = [
      a,
      await get(),
      await request(t.app).post('/api/v1/integrations/instagram/test').set('Cookie', cookie),
    ];
    for (const r of responses) {
      const raw = JSON.stringify(r.body);
      expect(raw).not.toContain(SECRET);
      expect(raw).not.toContain(TOKEN);
      expect(raw).not.toContain('1234567890');
    }
    expect(a.body.appIdMasked).toBe('••••7890');
    expect(a.body.accessTokenMasked).toBe('••••9876');
    expect(a.body.appSecretMasked).toBe('••••••••');

    const row = await testPrisma.integrationConfig.findUniqueOrThrow({
      where: { key: 'instagram' },
    });
    expect(row.valueEnc).not.toContain(SECRET);
    expect(row.valueEnc).not.toContain(TOKEN);
    expect(row.valueEnc.startsWith('v1.')).toBe(true);

    const audits = await testPrisma.auditLog.findMany({ where: { entity: 'IntegrationConfig' } });
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain(SECRET);
    expect(JSON.stringify(audits)).not.toContain(TOKEN);
  });
});

describe('Instagram: persistencia y resolución del cliente', () => {
  it('lo guardado persiste (nueva instancia de la app) y el hashtag va a SiteSetting', async () => {
    await put({
      mode: 'real',
      appId: '1234567890',
      appSecret: SECRET,
      hashtag: '#ifts2web',
    }).expect(200);
    const t2 = await createTestApp({ useRealIntegrationResolution: true });
    const res = await request(t2.app).get('/api/v1/integrations/instagram').set('Cookie', cookie);
    expect(res.body).toMatchObject({
      status: 'credentials_saved',
      hashtag: '#ifts2web',
      appIdMasked: '••••7890',
    });
  });

  it('el cliente se resuelve desde la base antes que desde el entorno y sin cachear', async () => {
    // Entorno: Graph con otras credenciales; base: modo demostración explícito => gana la base
    const envConfig = loadConfig({
      ...process.env,
      INSTAGRAM_PROVIDER: 'graph',
      INSTAGRAM_APP_ID: 'env-app',
      INSTAGRAM_APP_SECRET: 'env-secret',
    });
    const t2 = await createTestApp({ useRealIntegrationResolution: true, config: envConfig });
    expect((await t2.ctx.getInstagramClient()).kind).toBe('graph'); // sin base: el entorno es el valor por defecto
    await t2.ctx.integrations.set('instagram', { mode: 'demo' });
    expect((await t2.ctx.getInstagramClient()).kind).toBe('fake'); // la base manda
    await t2.ctx.integrations.set('instagram', {
      mode: 'real',
      appId: 'panel-app',
      appSecret: 'panel-secret',
    });
    expect((await t2.ctx.getInstagramClient()).kind).toBe('graph'); // cambios del panel aplican de inmediato
  });

  it('cambiar el App ID descarta el token anterior', async () => {
    await put({ mode: 'real', appId: '1111111111', appSecret: SECRET, accessToken: TOKEN }).expect(
      200,
    );
    const res = await put({ appId: '2222222222' });
    expect(res.body).toMatchObject({ hasAccessToken: false, status: 'credentials_saved' });
  });
});

describe('Instagram: conexión con token pegado (sin App ID ni Secret)', () => {
  it('con el método token, pegar el token alcanza: modo real, conectada y cliente Graph', async () => {
    const res = await put({ connectionMethod: 'token', accessToken: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      connectionMethod: 'token',
      mode: 'real',
      status: 'connected',
      demoMode: false,
      hasAccessToken: true,
      appIdMasked: null,
      appSecretMasked: null,
    });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN); // el token nunca sale en claro
    expect((await t.ctx.getInstagramClient()).kind).toBe('graph');
    expect((await get()).body).toMatchObject({ connectionMethod: 'token', status: 'connected' });
  });

  it('422 si pide modo real con el método token pero sin token; no pide App ID ni Secret', async () => {
    const res = await put({ connectionMethod: 'token', mode: 'real' });
    expect(res.status).toBe(422);
    expect(res.body.errors.accessToken[0]).toMatch(/token/i);
    expect(res.body.errors.appId).toBeUndefined();
  });

  it('cambiar de método descarta lo conectado con el otro y vuelve a demostración', async () => {
    await put({ connectionMethod: 'token', accessToken: TOKEN }).expect(200);
    const res = await put({ connectionMethod: 'oauth' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      connectionMethod: 'oauth',
      status: 'demo',
      hasAccessToken: false,
    });
    expect((await t.ctx.getInstagramClient()).kind).toBe('fake');
  });

  it('con el método token, cambiar el App ID no descarta el token', async () => {
    await put({ connectionMethod: 'token', accessToken: TOKEN }).expect(200);
    const res = await put({ appId: '2222222222' });
    expect(res.body).toMatchObject({ hasAccessToken: true, status: 'connected' });
  });

  it('las configuraciones guardadas antes (sin método) se tratan como OAuth', async () => {
    await t.ctx.integrations.set('instagram', {
      mode: 'real',
      appId: 'panel-app',
      appSecret: 'panel-secret',
    });
    expect((await get()).body).toMatchObject({
      connectionMethod: 'oauth',
      status: 'credentials_saved',
    });
  });
});

describe('Instagram: validaciones y flujo de conexión', () => {
  it('400 con mensajes claros; 422 si pide modo real sin credenciales', async () => {
    const bad = await put({ mode: 'otro', hashtag: '#a b', accessToken: 'corto' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.mode[0]).toMatch(/El modo/);
    expect(bad.body.errors.hashtag[0]).toMatch(/hashtag/);
    expect(bad.body.errors.accessToken[0]).toMatch(/token/);
    expect((await put({})).status).toBe(400);
    const noCreds = await put({ mode: 'real' });
    expect(noCreds.status).toBe(422);
    expect(noCreds.body.errors.appId).toBeDefined();
  });

  it('connect: 422 sin credenciales; con credenciales devuelve la URL de autorización con state firmado', async () => {
    const no = await request(t.app)
      .get('/api/v1/integrations/instagram/connect')
      .set('Cookie', cookie);
    expect(no.status).toBe(422);
    await put({ mode: 'real', appId: '1234567890', appSecret: SECRET }).expect(200);
    const ok = await request(t.app)
      .get('/api/v1/integrations/instagram/connect')
      .set('Cookie', cookie);
    expect(ok.status).toBe(200);
    const u = new URL(ok.body.url);
    expect(u.searchParams.get('client_id')).toBe('1234567890');
    expect(u.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4000/api/v1/integrations/instagram/callback',
    );
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(ok.body.url).not.toContain(SECRET);
  });

  it('callback: con state inválido o cancelado vuelve al panel con error y lo registra', async () => {
    await put({ mode: 'real', appId: '1234567890', appSecret: SECRET }).expect(200);
    const bad = await request(t.app)
      .get('/api/v1/integrations/instagram/callback?code=abc&state=falso')
      .set('Cookie', cookie);
    expect(bad.status).toBe(302);
    expect(bad.headers.location).toBe('http://localhost:3000/panel/configuracion?instagram=error');
    expect((await get()).body.status).toBe('error');
    const denied = await request(t.app)
      .get('/api/v1/integrations/instagram/callback?error=access_denied')
      .set('Cookie', cookie);
    expect(denied.headers.location).toContain('instagram=error');
  });

  it('test: en modo demostración responde ok/demo; en real sin token informa el motivo', async () => {
    const demo = await request(t.app)
      .post('/api/v1/integrations/instagram/test')
      .set('Cookie', cookie);
    expect(demo.body).toMatchObject({ ok: true, demo: true });
    await put({ mode: 'real', appId: '1234567890', appSecret: SECRET }).expect(200);
    const real = await request(t.app)
      .post('/api/v1/integrations/instagram/test')
      .set('Cookie', cookie);
    expect(real.status).toBe(200);
    expect(real.body.ok).toBe(false);
    expect(real.body.error).toMatch(/falta conectar/);
  });
});

describe('Correo configurable desde el panel', () => {
  it('guarda el destino y el SMTP cifrado, devuelve solo máscaras y aplica de inmediato', async () => {
    const before = await request(t.app).get('/api/v1/integrations/mail').set('Cookie', cookie);
    expect(before.body).toMatchObject({ provider: 'console', demoMode: true });
    const smtp = 'smtp://usuario:clave-super-secreta@smtp.example.com:587';
    const res = await request(t.app)
      .put('/api/v1/integrations/mail')
      .set('Cookie', cookie)
      .send({ contactToEmail: 'contacto@ifts2.local', smtpUrl: smtp });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      provider: 'smtp',
      contactToEmail: 'contacto@ifts2.local',
      source: 'panel',
      demoMode: false,
    });
    expect(JSON.stringify(res.body)).not.toContain('clave-super-secreta');
    expect(res.body.smtpMasked).toBe('smtp://••••@smtp.example.com:587');
    const row = await testPrisma.integrationConfig.findUniqueOrThrow({ where: { key: 'mail' } });
    expect(row.valueEnc).not.toContain('clave-super-secreta');
    // quitar SMTP vuelve a consola
    const off = await request(t.app)
      .put('/api/v1/integrations/mail')
      .set('Cookie', cookie)
      .send({ smtpUrl: null });
    expect(off.body.provider).toBe('console');
    expect(off.body.contactToEmail).toBe('contacto@ifts2.local');
  });
  it('400 con mensajes claros', async () => {
    const res = await request(t.app)
      .put('/api/v1/integrations/mail')
      .set('Cookie', cookie)
      .send({ contactToEmail: 'mal', smtpUrl: 'http://x' });
    expect(res.status).toBe(400);
    expect(res.body.errors.contactToEmail[0]).toMatch(/formato válido/);
    expect(res.body.errors.smtpUrl[0]).toMatch(/smtp:\/\//);
  });
});
