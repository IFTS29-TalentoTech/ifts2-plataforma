import path from 'node:path';
import { config } from 'dotenv';

// Se ejecuta antes de cada archivo de prueba: fija un entorno de prueba aislado.
config({ path: path.resolve(import.meta.dirname, '../../../../.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://ifts2:ifts2@localhost:5433/ifts2_test';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.API_ORIGIN = 'http://localhost:4000';
process.env.STORAGE_PROVIDER = 'memory';
process.env.MAILER_PROVIDER = 'console';
process.env.INSTAGRAM_PROVIDER = 'fake';
process.env.APP_ENCRYPTION_KEY ??= 'ZGV2LW9ubHktZXhhbXBsZS1rZXktMzItYnl0ZXMhISE=';
process.env.LOG_LEVEL = 'silent';
// Las pruebas nunca deben avisarle a una web real (revalidación bajo demanda): se prueba con un fetch simulado.
delete process.env.REVALIDATE_SECRET;
