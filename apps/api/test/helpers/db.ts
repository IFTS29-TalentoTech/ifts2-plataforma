import { PrismaClient } from '@prisma/client';
import { requireTestDatabaseUrl, verifyTestDatabase } from './test-database';

/** Cliente compartido de la base de prueba. */
export const testPrisma = new PrismaClient({
  datasources: { db: { url: requireTestDatabaseUrl() } },
});

try {
  await verifyTestDatabase(testPrisma);
} catch (error) {
  await testPrisma.$disconnect();
  throw error;
}

/** Vacía todas las tablas (excepto las migraciones). Llamar en `beforeEach`. */
export async function resetDb() {
  await testPrisma.$transaction(async (db) => {
    await verifyTestDatabase(db);
    const rows = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (rows.length === 0) return;
    const list = rows.map((r) => `"public"."${r.tablename.replaceAll('"', '""')}"`).join(', ');
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  });
}
