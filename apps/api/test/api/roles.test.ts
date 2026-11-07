/**
 * Roles y permisos configurables (RF11, US-36). Cubre los criterios de aceptación de
 * 01-requerimientos.md y los escenarios de API de E2E-18 y E2E-19.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { loginAs, loginWith, cookieFrom } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';
import { createRole, createUser, ensureRole, TEST_PASSWORD } from '../helpers/factories';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
});

const api = (cookie: string) => ({
  get: (url: string) => request(t.app).get(`/api/v1${url}`).set('Cookie', cookie),
  post: (url: string, body?: object) =>
    request(t.app).post(`/api/v1${url}`).set('Cookie', cookie).send(body),
  patch: (url: string, body?: object) =>
    request(t.app).patch(`/api/v1${url}`).set('Cookie', cookie).send(body),
  put: (url: string, body?: object) =>
    request(t.app).put(`/api/v1${url}`).set('Cookie', cookie).send(body),
  del: (url: string) => request(t.app).delete(`/api/v1${url}`).set('Cookie', cookie),
});

describe('quién accede a /roles y /permissions', () => {
  it('401 sin sesión', async () => {
    expect((await request(t.app).get('/api/v1/roles')).status).toBe(401);
    expect((await request(t.app).get('/api/v1/permissions')).status).toBe(401);
  });

  it('ADMIN: 403 en todo salvo GET /roles, que usa para elegir el rol de un usuario', async () => {
    const { cookie } = await loginAs(t.app, 'ADMIN');
    await ensureRole('SUPERADMIN');
    const role = await createRole();
    const a = api(cookie);
    expect((await a.get('/permissions')).status).toBe(403);
    expect((await a.get(`/roles/${role.id}`)).status).toBe(403);
    expect((await a.post('/roles', { name: 'Nuevo' })).status).toBe(403);
    expect((await a.patch(`/roles/${role.id}`, { name: 'Otro' })).status).toBe(403);
    expect((await a.put(`/roles/${role.id}/permissions`, { permissions: [] })).status).toBe(403);
    expect((await a.del(`/roles/${role.id}`)).status).toBe(403);

    const list = await a.get('/roles');
    expect(list.status).toBe(200);
    const byKey = Object.fromEntries(
      list.body.items.map((r: { key: string; assignable: boolean }) => [r.key, r.assignable]),
    );
    // El selector de un ADMIN no ofrece SUPERADMIN.
    expect(byKey.SUPERADMIN).toBe(false);
    expect(byKey.ADMIN).toBe(true);
  });

  it('BEDELIA y EDITOR: 403 incluso en GET /roles', async () => {
    for (const r of ['BEDELIA', 'EDITOR'] as const) {
      const { cookie } = await loginAs(t.app, r);
      expect((await api(cookie).get('/roles')).status).toBe(403);
    }
  });
});

describe('GET /permissions', () => {
  it('devuelve el catálogo agrupado con etiquetas en español, sin roles:manage', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const res = await api(cookie).get('/permissions');
    expect(res.status).toBe(200);
    expect(res.body.groups.map((g: { title: string }) => g.title)).toEqual([
      'Contenido y comunicación',
      'Académico',
      'Sitio y sistema',
    ]);
    expect(JSON.stringify(res.body.groups)).not.toContain('roles:manage');
    expect(res.body.reserved).toEqual(['roles:manage']);
  });
});

describe('RF11: el Superadministrador crea un rol acotado (E2E-18)', () => {
  it('el usuario con ese rol ve solo lo tildado y recibe 403 en el resto; queda auditado', async () => {
    const sa = await loginAs(t.app, 'SUPERADMIN');
    const created = await api(sa.cookie).post('/roles', {
      name: 'Comunicación sin archivo',
      description: 'Solo publica noticias.',
      permissions: ['dashboard:read', 'publications:manage'],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      key: 'COMUNICACION_SIN_ARCHIVO',
      isSystem: false,
      editable: true,
      userCount: 0,
      permissions: ['dashboard:read', 'publications:manage'],
    });
    const log = await testPrisma.auditLog.findFirstOrThrow({ where: { action: 'role.create' } });
    expect(log.userId).toBe(sa.user.id);

    // Queda disponible al crear usuarios.
    const user = await api(sa.cookie).post('/users', {
      name: 'Lu',
      email: 'lu@ifts2.local',
      roleId: created.body.id,
      password: 'Clave-de-Lu-1',
    });
    expect(user.status).toBe(201);
    const login = await loginWith(t.app, 'lu@ifts2.local', 'Clave-de-Lu-1');
    const lu = api(cookieFrom(login));

    const me = await lu.get('/auth/me');
    expect(me.body).toMatchObject({
      role: 'COMUNICACION_SIN_ARCHIVO',
      roleName: 'Comunicación sin archivo',
      permissions: ['dashboard:read', 'publications:manage'],
    });
    expect((await lu.get('/dashboard')).status).toBe(200);
    expect((await lu.get('/publications')).status).toBe(200);
    for (const url of ['/notices', '/documents', '/users', '/audit', '/roles', '/permissions']) {
      expect((await lu.get(url)).status, url).toBe(403);
    }
  });

  it('crear con nombre repetido (sin importar mayúsculas) -> 409', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    await createRole({ name: 'Docentes' });
    const res = await api(cookie).post('/roles', { name: 'DOCENTES' });
    expect(res.status).toBe(409);
    expect(res.body.errors.name).toEqual(['Ya existe un rol con ese nombre.']);
  });

  it('permisos inexistentes o roles:manage -> 400 con mensaje claro', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const role = await createRole();
    const a = api(cookie);
    const reserved = await a.put(`/roles/${role.id}/permissions`, {
      permissions: ['roles:manage'],
    });
    expect(reserved.status).toBe(400);
    expect(JSON.stringify(reserved.body)).toContain('exclusivo del Superadministrador');
    expect((await a.post('/roles', { name: 'X', permissions: ['inventado:todo'] })).status).toBe(
      400,
    );
    expect(await testPrisma.rolePermission.count({ where: { roleId: role.id } })).toBe(0);
  });
});

describe('cambiar permisos rige sin volver a iniciar sesión (E2E-19)', () => {
  it('tildar y destildar cambia el acceso en el pedido siguiente, con la misma cookie', async () => {
    const sa = await loginAs(t.app, 'SUPERADMIN');
    const role = await createRole({ permissions: ['dashboard:read'] });
    await createUser({ email: 'x@ifts2.local', roleId: role.id });
    const user = api(cookieFrom(await loginWith(t.app, 'x@ifts2.local', TEST_PASSWORD)));

    expect((await user.get('/notices')).status).toBe(403);
    const put = await api(sa.cookie).put(`/roles/${role.id}/permissions`, {
      permissions: ['dashboard:read', 'notices:manage'],
    });
    expect(put.status).toBe(200);
    expect((await user.get('/notices')).status).toBe(200);

    await api(sa.cookie).put(`/roles/${role.id}/permissions`, { permissions: ['dashboard:read'] });
    expect((await user.get('/notices')).status).toBe(403);

    const logs = await testPrisma.auditLog.findMany({
      where: { action: 'role.permissions' },
      orderBy: { at: 'asc' },
    });
    expect(logs.map((l) => l.detail)).toEqual([
      { added: ['notices:manage'], removed: [] },
      { added: [], removed: ['notices:manage'] },
    ]);
  });

  it('los roles del sistema (ADMIN, BEDELIA, EDITOR) también se editan casilla por casilla', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const bedelia = await loginAs(t.app, 'BEDELIA');
    expect((await api(bedelia.cookie).get('/documents')).status).toBe(200);
    const res = await api(cookie).put(`/roles/${await ensureRole('BEDELIA')}/permissions`, {
      permissions: ['dashboard:read', 'notices:manage'],
    });
    expect(res.status).toBe(200);
    expect((await api(bedelia.cookie).get('/documents')).status).toBe(403);
  });
});

describe('reglas del rol SUPERADMIN y de eliminación', () => {
  it('SUPERADMIN no se edita (409)', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const id = await ensureRole('SUPERADMIN');
    expect((await api(cookie).patch(`/roles/${id}`, { name: 'Otro' })).status).toBe(409);
    expect((await api(cookie).put(`/roles/${id}/permissions`, { permissions: [] })).status).toBe(
      409,
    );
    expect((await api(cookie).del(`/roles/${id}`)).status).toBe(409);
  });

  it('un rol del sistema se renombra pero no se elimina', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const id = await ensureRole('EDITOR');
    const renamed = await api(cookie).patch(`/roles/${id}`, { name: 'Prensa' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key: 'EDITOR', name: 'Prensa' });
    const del = await api(cookie).del(`/roles/${id}`);
    expect(del.status).toBe(409);
    expect(del.body.detail).toBe('Los roles del sistema no se eliminan.');
  });

  it('un rol con usuarios no se elimina (409 con mensaje claro); sin usuarios sí, y se audita', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const role = await createRole({ name: 'Docentes invitados' });
    const { user } = await createUser({ roleId: role.id, active: false });
    const blocked = await api(cookie).del(`/roles/${role.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.detail).toBe('Reasigná a los usuarios antes de eliminar el rol.');

    await testPrisma.user.update({
      where: { id: user.id },
      data: { roleId: await ensureRole('EDITOR') },
    });
    expect((await api(cookie).del(`/roles/${role.id}`)).status).toBe(204);
    expect(await testPrisma.role.count({ where: { id: role.id } })).toBe(0);
    const log = await testPrisma.auditLog.findFirstOrThrow({ where: { action: 'role.delete' } });
    expect(log.detail).toMatchObject({ name: 'Docentes invitados' });
    expect((await api(cookie).get(`/roles/${role.id}`)).status).toBe(404);
  });

  it('PATCH sin cambios -> 400; id inexistente -> 404', async () => {
    const { cookie } = await loginAs(t.app, 'SUPERADMIN');
    const role = await createRole();
    expect((await api(cookie).patch(`/roles/${role.id}`, {})).status).toBe(400);
    expect(
      (await api(cookie).patch('/roles/8d4e7b0e-1c1f-4c8e-9a43-2f5a3a3b7e11', { name: 'x' }))
        .status,
    ).toBe(404);
  });
});
