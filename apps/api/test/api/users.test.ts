import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { loginAs, loginWith } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';
import { createRole, createUser, ensureRole, TEST_PASSWORD } from '../helpers/factories';

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
        (
          await call('post', '/api/v1/users', {
            name: 'X',
            email: 'x@y.com',
            roleId: await ensureRole('EDITOR'),
          })
        ).status,
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
      .send({ name: 'Bea Bedel', email: 'BEA@ifts2.local', roleId: await ensureRole('BEDELIA') });
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
    const res = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        name: 'Cleo',
        email: 'cleo@ifts2.local',
        roleId: await ensureRole('EDITOR'),
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
      .send({ name: 'Otra', email: 'DUP@ifts2.local', roleId: await ensureRole('EDITOR') });
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
      .send({ name: 'A', email: 'sin-arroba', roleId: 'REY' });
    expect(bad.body.errors.email[0]).toMatch(/formato válido/);
    expect(bad.body.errors.roleId[0]).toMatch(/El rol/);
    // Un rol con formato válido pero que no existe también es un dato incorrecto (400).
    const missing = await request(t.app).post('/api/v1/users').set('Cookie', cookie).send({
      name: 'A',
      email: 'a@ifts2.local',
      roleId: '8d4e7b0e-1c1f-4c8e-9a43-2f5a3a3b7e11',
    });
    expect(missing.status).toBe(400);
    expect(missing.body.errors.roleId).toEqual(['El rol elegido no existe.']);
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
      .send({ name: 'Nuevo', roleId: await ensureRole('BEDELIA') });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Nuevo', role: 'BEDELIA', roleName: 'Rol BEDELIA' });
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

  it('no permite desactivarse a sí mismo ni dejar al sistema sin Superadministrador (409)', async () => {
    const { cookie, user } = await loginAs(t.app, 'SUPERADMIN');
    expect(
      (await request(t.app).post(`/api/v1/users/${user.id}/deactivate`).set('Cookie', cookie))
        .status,
    ).toBe(409);
    const res = await request(t.app)
      .patch(`/api/v1/users/${user.id}`)
      .set('Cookie', cookie)
      .send({ roleId: await ensureRole('ADMIN') });
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/al menos un Superadministrador/);
  });

  it('con dos Superadministradores, uno puede pasar al otro a ADMIN', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const { user: other } = await createUser({ role: 'SUPERADMIN' });
    const res = await request(t.app)
      .patch(`/api/v1/users/${other.id}`)
      .set('Cookie', cookie)
      .send({ roleId: await ensureRole('ADMIN') });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
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

describe('anti-escalada al asignar roles (RF11, Q125)', () => {
  it('un ADMIN crea otro ADMIN', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const res = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        name: 'Otra Dirección',
        email: 'dir2@ifts2.local',
        roleId: await ensureRole('ADMIN'),
      });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('un ADMIN no asigna SUPERADMIN, ni al crear ni al editar (403)', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const superId = await ensureRole('SUPERADMIN');
    const created = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ name: 'X', email: 'x@ifts2.local', roleId: superId });
    expect(created.status).toBe(403);
    const { user } = await createUser({ role: 'EDITOR' });
    const edited = await request(t.app)
      .patch(`/api/v1/users/${user.id}`)
      .set('Cookie', cookie)
      .send({ roleId: superId });
    expect(edited.status).toBe(403);
    expect(await testPrisma.user.count({ where: { roleId: superId } })).toBe(0);
  });

  it('un ADMIN no asigna roles con permisos que él no tiene', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    // El Superadministrador le quitó la auditoría al rol ADMIN.
    await testPrisma.rolePermission.delete({
      where: { roleId_permission: { roleId: await ensureRole('ADMIN'), permission: 'audit:read' } },
    });
    const withAudit = await createRole({ permissions: ['audit:read'] });
    const without = await createRole({ permissions: ['notices:manage'] });
    const denied = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ name: 'A', email: 'a@ifts2.local', roleId: withAudit.id });
    expect(denied.status).toBe(403);
    const ok = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ name: 'B', email: 'b@ifts2.local', roleId: without.id });
    expect(ok.status).toBe(201);
  });

  it('un ADMIN no administra al Superadministrador (no le restablece la clave ni lo desactiva)', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    const { user: sa } = await createUser({ role: 'SUPERADMIN' });
    for (const path of ['reset-password', 'deactivate']) {
      const res = await request(t.app).post(`/api/v1/users/${sa.id}/${path}`).set('Cookie', cookie);
      expect(res.status).toBe(403);
    }
    const patch = await request(t.app)
      .patch(`/api/v1/users/${sa.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Otro nombre' });
    expect(patch.status).toBe(403);
    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: sa.id } });
    expect(row).toMatchObject({ active: true, mustChangePassword: false });
  });

  it('el Superadministrador asigna cualquier rol, incluido SUPERADMIN', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const res = await request(t.app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({ name: 'S2', email: 's2@ifts2.local', roleId: await ensureRole('SUPERADMIN') });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('SUPERADMIN');
  });
});
