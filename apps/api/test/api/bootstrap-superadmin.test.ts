import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testPrisma } from '../helpers/db';
import { createUser, ensureRole } from '../helpers/factories';
import { requireTestDatabaseUrl, verifyTestDatabase } from '../helpers/test-database';

const root = path.resolve(import.meta.dirname, '../../../..');
const run = promisify(execFile);
const email = 'bootstrap@prueba.local';
async function seed(over: NodeJS.ProcessEnv = {}) {
  await verifyTestDatabase(testPrisma);
  try {
    const result = await run('pnpm', ['db:seed'], {
      cwd: root,
      env: {
        ...process.env,
        ...over,
        DATABASE_URL: requireTestDatabaseUrl(),
        SEED_MODE: over.SEED_MODE ?? 'prod',
        SEED_ADMIN_EMAIL: over.SEED_ADMIN_EMAIL ?? email,
        SEED_ADMIN_PASSWORD: over.SEED_ADMIN_PASSWORD ?? 'Inicial-segura-123!',
        STORAGE_LOCAL_DIR: '/tmp/ifts2-a03-demo',
      },
    });
    return { code: 0, output: result.stdout + result.stderr };
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    return { code: result.code, output: result.stdout + result.stderr };
  }
}

beforeEach(resetDb);

describe('semilla de SUPERADMIN (CLI real)', () => {
  it('crea el primer SUPERADMIN activo y repetir no cambia cuenta, contraseña ni permisos', async () => {
    expect(await seed()).toMatchObject({ code: 0 });
    const admin = await testPrisma.user.findUniqueOrThrow({
      where: { email },
      include: { role: true },
    });
    expect(admin).toMatchObject({
      active: true,
      mustChangePassword: true,
      role: { key: 'SUPERADMIN' },
    });
    await testPrisma.user.update({ where: { id: admin.id }, data: { mustChangePassword: false } });
    const editor = await testPrisma.role.findUniqueOrThrow({ where: { key: 'EDITOR' } });
    await testPrisma.rolePermission.deleteMany({ where: { roleId: editor.id } });
    await testPrisma.role.update({ where: { id: editor.id }, data: { name: 'Prensa' } });
    const before = await testPrisma.user.findMany();
    expect(await seed({ SEED_ADMIN_PASSWORD: 'Otra-clave-456!' })).toMatchObject({ code: 0 });
    expect(await testPrisma.user.findMany()).toEqual(before);
    expect(await testPrisma.role.findUnique({ where: { id: editor.id } })).toMatchObject({
      name: 'Prensa',
    });
    expect(await testPrisma.rolePermission.count({ where: { roleId: editor.id } })).toBe(0);
    expect(await testPrisma.rolePermission.count({ where: { permission: 'roles:manage' } })).toBe(
      0,
    );
    await testPrisma.role.delete({ where: { id: editor.id } });
    expect(await seed()).toMatchObject({ code: 0 });
    expect(await testPrisma.role.count({ where: { key: 'EDITOR' } })).toBe(0);
  });

  for (const role of ['ADMIN', 'EDITOR', 'SUPERADMIN'] as const) {
    for (const active of [false, true]) {
      if (role === 'SUPERADMIN' && active) continue;
      it(`rechaza el correo existente con rol ${role}, active=${active}, sin modificarlo`, async () => {
        await createUser({ email, role, active });
        const before = await testPrisma.user.findMany();
        const result = await seed();
        expect(result.code).not.toBe(0);
        expect(result.output).toMatch(/SUPERADMIN activo/);
        expect(await testPrisma.user.findMany()).toEqual(before);
      });
    }
  }

  it('rechaza crear otra cuenta por cambiar el correo en una instalación existente', async () => {
    await createUser({ role: 'SUPERADMIN' });
    const before = await testPrisma.user.findMany();
    const result = await seed();
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/recuperaci[oó]n/i);
    expect(await testPrisma.user.findMany()).toEqual(before);
  });

  it('sin SUPERADMIN activo y con usuarios exige recuperación explícita', async () => {
    await createUser({ role: 'ADMIN' });
    await createUser({ role: 'SUPERADMIN', active: false });
    const before = await testPrisma.user.findMany();
    const result = await seed();
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/recuperaci[oó]n/i);
    expect(await testPrisma.user.findMany()).toEqual(before);
  });

  it('dos inicializaciones con correos diferentes no crean dos SUPERADMIN', async () => {
    await ensureRole('SUPERADMIN');
    const results = await Promise.all([seed(), seed({ SEED_ADMIN_EMAIL: 'otro@prueba.local' })]);
    expect(results.map((r) => r.code).filter((code) => code === 0)).toHaveLength(1);
    expect(await testPrisma.user.count()).toBe(1);
  });

  it('demo repetida no reactiva ni reasigna cuentas existentes, incluso si el correo inicial coincide', async () => {
    const demoEmail = 'bedelia@ifts2.local';
    expect(await seed({ SEED_MODE: 'demo', SEED_ADMIN_EMAIL: demoEmail })).toMatchObject({
      code: 0,
    });
    expect(
      await testPrisma.user.findUnique({ where: { email: demoEmail }, include: { role: true } }),
    ).toMatchObject({ role: { key: 'SUPERADMIN' } });
    await testPrisma.user.update({
      where: { email: 'direccion@ifts2.local' },
      data: { active: false, roleId: await ensureRole('EDITOR') },
    });
    const before = await testPrisma.user.findMany({ orderBy: { email: 'asc' } });
    expect(await seed({ SEED_MODE: 'demo', SEED_ADMIN_EMAIL: demoEmail })).toMatchObject({
      code: 0,
    });
    expect(await testPrisma.user.findMany({ orderBy: { email: 'asc' } })).toEqual(before);
  });
});
