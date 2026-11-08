import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/db';
import { requireTestDatabaseUrl, verifyTestDatabase } from '../helpers/test-database';

const root = path.resolve(import.meta.dirname, '../../../..');
const historical = [
  '20261029224122_init',
  '20261029224406_integration_config',
  '20261106120000_roles_configurables',
];

async function prisma(args: string[]) {
  await verifyTestDatabase(testPrisma);
  execFileSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: requireTestDatabaseUrl() },
    stdio: 'pipe',
  });
}

async function clearSchema() {
  // A04: verificar de nuevo dentro de la transacción antes de cada borrado.
  await testPrisma.$transaction(async (tx) => {
    await verifyTestDatabase(tx);
    await tx.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await tx.$executeRawUnsafe('CREATE SCHEMA public');
  });
}

afterEach(async () => {
  await clearSchema();
  await prisma(['migrate', 'deploy']);
});

describe('migración histórica de roles sobre PostgreSQL descartable', () => {
  it('instala todas las migraciones desde cero sin inventar un usuario', async () => {
    await clearSchema();
    await prisma(['migrate', 'deploy']);
    expect(await testPrisma.user.count()).toBe(0);
    expect(await testPrisma.role.count({ where: { key: 'SUPERADMIN' } })).toBe(1);
  });

  for (const activeAdmins of [0, 1, 3]) {
    it(`con ${activeAdmins} ADMIN activos promueve únicamente al más antiguo, nunca a un inactivo`, async () => {
      await clearSchema();
      for (const name of historical.slice(0, 2)) {
        await prisma([
          'db',
          'execute',
          '--schema',
          'prisma/schema.prisma',
          '--file',
          `prisma/migrations/${name}/migration.sql`,
        ]);
      }
      // El inactivo es más antiguo que todos los activos; los otros roles tampoco se promueven.
      const fixtures = [
        { id: 'inactive', role: 'ADMIN', active: false, date: '2020-01-01' },
        { id: 'editor', role: 'EDITOR', active: true, date: '2021-01-01' },
        ...Array.from({ length: activeAdmins }, (_, i) => ({
          id: `admin-${i}`,
          role: 'ADMIN',
          active: true,
          date: `2022-01-0${i + 1}`,
        })),
      ];
      for (const f of fixtures) {
        await testPrisma.$executeRaw`
          INSERT INTO "User" (id, email, name, "passwordHash", role, active, "createdAt", "updatedAt")
          VALUES (${f.id}, ${`${f.id}@prueba.local`}, ${f.id}, 'hash-preservado',
            ${f.role}::"Role", ${f.active}, ${new Date(f.date)}, ${new Date(f.date)})`;
      }
      await prisma([
        'db',
        'execute',
        '--schema',
        'prisma/schema.prisma',
        '--file',
        `prisma/migrations/${historical[2]}/migration.sql`,
      ]);
      const users = await testPrisma.user.findMany({ include: { role: true } });
      expect(users).toHaveLength(fixtures.length);
      for (const f of fixtures) {
        expect(users.find((u) => u.id === f.id)).toMatchObject({
          email: `${f.id}@prueba.local`,
          passwordHash: 'hash-preservado',
          active: f.active,
          createdAt: new Date(f.date),
          role: { key: f.id === 'admin-0' ? 'SUPERADMIN' : f.role },
        });
      }
      expect(users.filter((u) => u.role.key === 'SUPERADMIN')).toHaveLength(activeAdmins ? 1 : 0);
    });
  }
});
