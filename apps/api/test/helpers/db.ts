import { PrismaClient } from '@prisma/client';

/** Cliente compartido de la base de prueba. */
export const testPrisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });

/** Vacía todas las tablas (excepto las migraciones). Llamar en `beforeEach`. */
export async function resetDb() {
  const rows = await testPrisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
