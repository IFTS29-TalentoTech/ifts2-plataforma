import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testPrisma } from '../helpers/db';
import { createUser, ensureRole } from '../helpers/factories';
import { requireTestDatabaseUrl, verifyTestDatabase } from '../helpers/test-database';

const root = path.resolve(import.meta.dirname, '../../../..');
const reason = "Acta de autorización 'A03'";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
async function recover(id: string, reference = reason) {
  await verifyTestDatabase(testPrisma);
  // Ejecuta el mismo SQL de operación; emula el quoting de literales de psql sin necesitar psql.
  const sql = readFileSync(path.join(root, 'docs/operaciones/recuperar-superadmin.sql'), 'utf8')
    .replace(":'recovery_user_id'", literal(id))
    .replace(":'recovery_reason'", literal(reference));
  execFileSync(
    'pnpm',
    ['exec', 'prisma', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'],
    {
      cwd: root,
      input: sql,
      env: { ...process.env, DATABASE_URL: requireTestDatabaseUrl() },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
}

beforeEach(resetDb);

describe('procedimiento SQL de recuperación explícita', () => {
  it('promueve solo la cuenta aprobada, revoca sesiones y audita sin cambiar clave ni estado', async () => {
    await ensureRole('SUPERADMIN');
    const { user } = await createUser({ role: 'ADMIN' });
    const { user: other } = await createUser({ role: 'EDITOR' });
    await testPrisma.session.create({
      data: { userId: user.id, tokenHash: 'session-test', expiresAt: new Date(Date.now() + 60000) },
    });
    await recover(user.id);
    const recovered = await testPrisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { role: true },
    });
    expect(recovered).toMatchObject({
      ...user,
      roleId: recovered.roleId,
      updatedAt: recovered.updatedAt,
      role: { key: 'SUPERADMIN' },
    });
    expect(await testPrisma.user.findUnique({ where: { id: other.id } })).toEqual(other);
    expect(await testPrisma.session.count()).toBe(0);
    expect(await testPrisma.auditLog.findMany()).toMatchObject([
      {
        userId: null,
        action: 'user.recover-superadmin',
        entity: 'User',
        entityId: user.id,
        detail: { previousRoleId: user.roleId, reason, databaseOperator: expect.any(String) },
      },
    ]);
    // No se puede repetir para promover arbitrariamente a otra cuenta.
    await expect(recover(other.id)).rejects.toThrow(/Ya existe un SUPERADMIN activo/);
    expect(await testPrisma.auditLog.count()).toBe(1);
  });

  for (const scenario of ['inactivo', 'inexistente', 'sin rol', 'sin autorización'] as const) {
    it(`rechaza destinatario ${scenario} y conserva todas las cuentas y auditoría`, async () => {
      if (scenario !== 'sin rol') await ensureRole('SUPERADMIN');
      const { user } = await createUser({ role: 'ADMIN', active: scenario !== 'inactivo' });
      const before = await testPrisma.user.findMany();
      await expect(
        recover(
          scenario === 'inexistente' ? 'id-erroneo' : user.id,
          scenario === 'sin autorización' ? ' ' : reason,
        ),
      ).rejects.toThrow();
      expect(await testPrisma.user.findMany()).toEqual(before);
      expect(await testPrisma.auditLog.count()).toBe(0);
    });
  }
});
