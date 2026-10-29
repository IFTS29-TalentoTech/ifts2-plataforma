import { execSync } from 'node:child_process';
import path from 'node:path';
import { config } from 'dotenv';

/** Aplica las migraciones a la base de prueba (ifts2_test) una vez antes de toda la corrida. */
export default function setup() {
  const root = path.resolve(import.meta.dirname, '../../../..');
  config({ path: path.join(root, '.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://ifts2:ifts2@localhost:5433/ifts2_test';
  execSync('pnpm exec prisma migrate deploy', {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
