import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../../src/infra/crypto';
import { cookieFrom, loginAs, loginWith } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';
import { createUser, TEST_PASSWORD } from '../helpers/factories';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
});

describe('POST /auth/login', () => {
  it('caso feliz: 204, cookie httpOnly SameSite=Lax y sesión con hash del token', async () => {
    const { user } = await createUser({ role: 'ADMIN' });
    const res = await loginWith(t.app, user.email, TEST_PASSWORD);
    expect(res.status).toBe(204);
    const raw = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    const token = cookieFrom(res).split('=')[1]!;
    const session = await testPrisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.tokenHash).toBe(sha256(token)); // en base solo el hash
    expect(session.tokenHash).not.toBe(token);
    // 8 horas por defecto
    const hours = (session.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(7.9);
    expect(hours).toBeLessThanOrEqual(8);
    expect(
      (await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt,
    ).not.toBeNull();
    expect(await testPrisma.auditLog.count({ where: { action: 'auth.login' } })).toBe(1);
  });

  it('"recordar sesión" extiende a 14 días', async () => {
    const { user } = await createUser();
    await loginWith(t.app, user.email, TEST_PASSWORD, true);
    const session = await testPrisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const days = (session.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
  });

  it('401 con mensaje genérico para clave incorrecta y para correo inexistente', async () => {
    const { user } = await createUser();
    const a = await loginWith(t.app, user.email, 'incorrecta-123');
    const b = await loginWith(t.app, 'noexiste@prueba.local', 'incorrecta-123');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.detail).toBe('Correo o contraseña incorrectos.');
    expect(b.body.detail).toBe(a.body.detail);
    expect(a.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(a.body).toMatchObject({ status: 401, code: 'unauthorized' });
  });

  it('un usuario desactivado no puede entrar (mismo 401 genérico)', async () => {
    const { user } = await createUser({ active: false });
    const res = await loginWith(t.app, user.email, TEST_PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.detail).toBe('Correo o contraseña incorrectos.');
  });

  it('400 con mensajes claros si faltan campos', async () => {
    const res = await request(t.app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.email).toContain('El correo es obligatorio.');
    expect(res.body.errors.password).toContain('La contraseña es obligatoria.');
  });

  it('429 tras 5 intentos fallidos; el límite también corre por correo', async () => {
    const { user } = await createUser();
    for (let i = 0; i < 5; i++) {
      expect((await loginWith(t.app, user.email, 'mala-12345')).status).toBe(401);
    }
    const blocked = await loginWith(t.app, user.email, TEST_PASSWORD); // aun con la clave correcta
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('too-many-requests');
  });

  it('un login exitoso no consume el límite', async () => {
    const { user } = await createUser();
    for (let i = 0; i < 7; i++)
      expect((await loginWith(t.app, user.email, TEST_PASSWORD)).status).toBe(204);
  });
});

describe('GET /auth/me', () => {
  it('devuelve usuario, rol y permisos', async () => {
    const { cookie, user } = await loginAs(t.app, 'BEDELIA');
    const res = await request(t.app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      email: user.email,
      role: 'BEDELIA',
      mustChangePassword: false,
    });
    expect(res.body.permissions).toContain('notices:manage');
    expect(res.body.permissions).not.toContain('users:manage');
    expect(res.body.passwordHash).toBeUndefined();
  });
  it('401 sin sesión', async () => {
    const res = await request(t.app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
  it('401 con una cookie inventada', async () => {
    const res = await request(t.app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'ifts2_session=' + 'x'.repeat(43));
    expect(res.status).toBe(401);
  });
  it('401 si la sesión venció', async () => {
    const { cookie, user } = await loginAs(t.app, 'EDITOR');
    await testPrisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await request(t.app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('cierra la sesión: la cookie deja de servir', async () => {
    const { cookie, user } = await loginAs(t.app, 'EDITOR');
    expect((await request(t.app).post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(
      204,
    );
    expect(await testPrisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await request(t.app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
  it('es idempotente sin sesión', async () => {
    expect((await request(t.app).post('/api/v1/auth/logout')).status).toBe(204);
  });
});

describe('POST /auth/change-password', () => {
  it('caso feliz: cambia la clave, cierra otras sesiones y permite entrar con la nueva', async () => {
    const { cookie, user } = await loginAs(t.app, 'EDITOR');
    const other = await loginWith(t.app, user.email, TEST_PASSWORD);
    const res = await request(t.app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ current: TEST_PASSWORD, next: 'Nueva-clave-2026' });
    expect(res.status).toBe(204);
    expect(
      (await request(t.app).get('/api/v1/auth/me').set('Cookie', cookieFrom(other))).status,
    ).toBe(401);
    expect((await request(t.app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect((await loginWith(t.app, user.email, 'Nueva-clave-2026')).status).toBe(204);
    expect((await loginWith(t.app, user.email, TEST_PASSWORD)).status).toBe(401);
  });
  it('400 si la actual es incorrecta o la nueva es débil/igual', async () => {
    const { cookie } = await loginAs(t.app, 'EDITOR');
    const post = (b: object) =>
      request(t.app).post('/api/v1/auth/change-password').set('Cookie', cookie).send(b);
    expect(
      (await post({ current: 'mala', next: 'Nueva-clave-2026' })).body.errors.current,
    ).toBeDefined();
    expect((await post({ current: TEST_PASSWORD, next: 'corta1' })).body.errors.next[0]).toMatch(
      /al menos 10/,
    );
    expect(
      (await post({ current: TEST_PASSWORD, next: 'sololetrasaqui' })).body.errors.next[0],
    ).toMatch(/letras y números/);
    expect(
      (await post({ current: TEST_PASSWORD, next: TEST_PASSWORD })).body.errors.next[0],
    ).toMatch(/distinta/);
  });
  it('401 sin sesión', async () => {
    const res = await request(t.app)
      .post('/api/v1/auth/change-password')
      .send({ current: 'a', next: 'Nueva-clave-2026' });
    expect(res.status).toBe(401);
  });
});

describe('cambio de clave obligatorio', () => {
  it('con mustChangePassword solo se puede ver /me, cambiar clave y salir; el resto da 403', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN', { mustChangePassword: true });
    const blocked = await request(t.app).get('/api/v1/users').set('Cookie', cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.reason).toBe('password-change-required');
    expect(
      (await request(t.app).get('/api/v1/auth/me').set('Cookie', cookie)).body.mustChangePassword,
    ).toBe(true);
    await request(t.app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ current: TEST_PASSWORD, next: 'Nueva-clave-2026' })
      .expect(204);
    expect((await request(t.app).get('/api/v1/users').set('Cookie', cookie)).status).toBe(200);
  });
});

describe('CSRF: verificación de Origin', () => {
  it('rechaza métodos mutantes con un Origin ajeno (403) y acepta el del frontend', async () => {
    const { user } = await createUser();
    const bad = await request(t.app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(bad.status).toBe(403);
    const good = await request(t.app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(good.status).toBe(204);
  });
});

describe('formato de errores', () => {
  it('404 en Problem Details', async () => {
    const res = await request(t.app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, code: 'not-found', title: 'No encontrado' });
  });
  it('JSON inválido da 400 claro', async () => {
    const res = await request(t.app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{no-json');
    expect(res.status).toBe(400);
  });
});
