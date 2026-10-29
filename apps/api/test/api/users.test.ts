import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { loginAs, loginWith } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';
import { createUser, TEST_PASSWORD } from '../helpers/factories';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
});

describe('permisos de /users', () => {
  it('401 sin sesión', async () => {
    expect((await request(t.app).get('/api/v1/users')).status).toBe(401);
  });
  for (const role of ['BEDELIA', 'EDITOR'] as const) {
    it(`403 para ${role} en todas las operaciones`, async () => {
      const { cookie } = await loginAs(t.app, role);
      const { user } = await createUser();
      const call = (m: 'get' | 'post' | 'patch', url: string, body?: object) =>
        request(t.app)[m](url).set('Cookie', cookie).send(body);
      expect((await call('get', '/api/v1/users')).status).toBe(403);
      expect(
        (await call('post', '/api/v1/users', { name: 'X', email: 'x@y.com', role: 'EDITOR' }))
          .status,
      ).toBe(403);
      expect((await call('patch', `/api/v1/users/${user.id}`, { name: 'Z' })).status).toBe(403);
      expect((await call('post', `/api/v1/users/${user.id}/deactivate`)).status).toBe(403);
      expect((await call('post', `/api/v1/users/${user.id}/reset-password`)).status).toBe(403);
    });
  }
});

describe('ADMIN: listar y crear', () => {
  it('lista con paginación y sin exponer hashes', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    await createUser({ role: 'EDITOR', name: 'Ana Editora' });
    const res = await request(t.app).get('/api/v1/users?pageSize=1&page=1').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(res.body.items).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    const filtered = await request(t.app).get('/api/v1/users?q=ana').set('Cookie', cookie);
    expect(filtered.body.total).toBe(1);
  });

  it('crea con clave temporal generada, obliga a cambiarla y audita', async () => {
    const { cookie, user: admin } = await loginAs(t.app, 'ADMIN');
    const res = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ name: 'Bea Bedel', email: 'BEA@ifts2.local', role: 'BEDELIA' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'bea@ifts2.local',
      role: 'BEDELIA',
      active: true,
      mustChangePassword: true,
    });
    expect(res.body.temporaryPassword).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{14}$/);
    // La clave temporal sirve para entrar y luego exige cambio
    const login = await loginWith(t.app, 'bea@ifts2.local', res.body.temporaryPassword);
    expect(login.status).toBe(204);
    const log = await testPrisma.auditLog.findFirstOrThrow({ where: { action: 'user.create' } });
    expect(log.userId).toBe(admin.id);
    expect(JSON.stringify(log.detail)).not.toContain(res.body.temporaryPassword);
  });

  it('crea con clave elegida (no exige cambio)', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const res = await request(t.app).post('/api/v1/users').set('Cookie', cookie).send({
      name: 'Cleo',
      email: 'cleo@ifts2.local',
      role: 'EDITOR',
      password: 'Clave-elegida-1',
    });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(res.body.user.mustChangePassword).toBe(false);
  });

  it('409 con mensaje claro si el correo ya existe (sin importar mayúsculas)', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    await createUser({ email: 'dup@ifts2.local' });
    const res = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ name: 'Otra', email: 'DUP@ifts2.local', role: 'EDITOR' });
    expect(res.status).toBe(409);
    expect(res.body.errors.email).toEqual(['Ya existe un usuario con ese correo.']);
  });

  it('400 con mensajes claros: vacío, correo inválido, rol inválido', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const empty = await request(t.app).post('/api/v1/users').set('Cookie', cookie).send({});
    expect(empty.status).toBe(400);
    expect(empty.body.errors.name).toContain('El nombre es obligatorio.');
    expect(empty.body.errors.email).toContain('El correo es obligatorio.');
    const bad = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ name: 'A', email: 'sin-arroba', role: 'REY' });
    expect(bad.body.errors.email[0]).toMatch(/formato válido/);
    expect(bad.body.errors.role[0]).toMatch(/El rol/);
  });
});

describe('ADMIN: editar, desactivar, reset', () => {
  it('edita nombre y rol, y 409 si el correo ya existe', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const a = (await createUser({ email: 'a@ifts2.local' })).user;
    await createUser({ email: 'b@ifts2.local' });
    const ok = await request(t.app)
      .patch(`/api/v1/users/${a.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Nuevo', role: 'BEDELIA' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Nuevo', role: 'BEDELIA' });
    const dup = await request(t.app)
      .patch(`/api/v1/users/${a.id}`)
      .set('Cookie', cookie)
      .send({ email: 'b@ifts2.local' });
    expect(dup.status).toBe(409);
    expect(
      (await request(t.app).patch(`/api/v1/users/${a.id}`).set('Cookie', cookie).send({})).status,
    ).toBe(400);
    expect(
      (
        await request(t.app)
          .patch(`/api/v1/users/no-es-uuid`)
          .set('Cookie', cookie)
          .send({ name: 'x' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(t.app)
          .patch(`/api/v1/users/8d4e7b0e-1c1f-4c8e-9a43-2f5a3a3b7e11`)
          .set('Cookie', cookie)
          .send({ name: 'x' })
      ).status,
    ).toBe(404);
  });

  it('desactivar: el usuario ya no puede entrar y pierde sus sesiones', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const victim = await loginAs(t.app, 'EDITOR');
    const res = await request(t.app)
      .post(`/api/v1/users/${victim.user.id}/deactivate`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect((await request(t.app).get('/api/v1/auth/me').set('Cookie', victim.cookie)).status).toBe(
      401,
    );
    expect((await loginWith(t.app, victim.user.email, TEST_PASSWORD)).status).toBe(401);
    // reactivar
    await request(t.app)
      .post(`/api/v1/users/${victim.user.id}/activate`)
      .set('Cookie', cookie)
      .expect(200);
    expect((await loginWith(t.app, victim.user.email, TEST_PASSWORD)).status).toBe(204);
  });

  it('no permite desactivarse a sí mismo ni dejar al sistema sin administradores', async () => {
    const { cookie, user } = await loginAs(t.app, 'ADMIN');
    expect(
      (await request(t.app).post(`/api/v1/users/${user.id}/deactivate`).set('Cookie', cookie))
        .status,
    ).toBe(422);
    expect(
      (
        await request(t.app)
          .patch(`/api/v1/users/${user.id}`)
          .set('Cookie', cookie)
          .send({ role: 'EDITOR' })
      ).status,
    ).toBe(422);
  });

  it('no existe DELETE /users/:id', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const { user } = await createUser();
    const res = await request(t.app).delete(`/api/v1/users/${user.id}`).set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(await testPrisma.user.count({ where: { id: user.id } })).toBe(1);
  });

  it('reset-password: clave temporal, obliga a cambiarla, cierra sesiones y la vieja deja de servir', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const victim = await loginAs(t.app, 'EDITOR');
    const res = await request(t.app)
      .post(`/api/v1/users/${victim.user.id}/reset-password`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    const temp = res.body.temporaryPassword as string;
    expect(temp).toBeTruthy();
    expect((await request(t.app).get('/api/v1/auth/me').set('Cookie', victim.cookie)).status).toBe(
      401,
    );
    expect((await loginWith(t.app, victim.user.email, TEST_PASSWORD)).status).toBe(401);
    const login = await loginWith(t.app, victim.user.email, temp);
    expect(login.status).toBe(204);
    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: victim.user.id } });
    expect(row.mustChangePassword).toBe(true);
    const log = await testPrisma.auditLog.findFirstOrThrow({
      where: { action: 'user.reset-password' },
    });
    expect(JSON.stringify(log)).not.toContain(temp);
  });
});
