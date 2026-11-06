import { execSync } from 'node:child_process';
import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { requireTestDatabaseUrl, verifyTestDatabase } from './test-database';

/** Aplica las migraciones a la base de prueba (ifts2_test) una vez antes de toda la corrida. */
export default async function setup() {
  const root = path.resolve(import.meta.dirname, '../../../..');
  config({ path: path.join(root, '.env'), quiet: true });
  const url = requireTestDatabaseUrl();
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await verifyTestDatabase(db);
  } finally {
    await db.$disconnect();
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
