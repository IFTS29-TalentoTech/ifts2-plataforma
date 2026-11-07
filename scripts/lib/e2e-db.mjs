// Base PROPIA de la suite Cypress (`pnpm e2e`): `ifts2_e2e`, en el mismo contenedor `ifts2-db`.
//
// Por qué: las pruebas crean usuarios, roles, avisos y documentos con nombres únicos y nunca los
// borran (los usuarios no se eliminan por regla del proyecto). Antes corrían contra la base de
// DESARROLLO (`ifts2`): cada corrida la llenaba de restos ("Rol 18", "Persona de prueba"…), las listas
// se volvían largas y algunas pruebas dependían de lo que había dejado la corrida anterior.
// Ahora cada corrida arranca de cero, igual que en CI, y la base de desarrollo no se toca.
//
// Seguridad: SOLO se vacía una base llamada exactamente `ifts2_e2e` en localhost:5433. Cualquier otra
// URL se rechaza antes de conectarse (nunca puede borrar la base de desarrollo ni la de pruebas de API).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseEnv } from 'node:util';

export const E2E_DB_NAME = 'ifts2_e2e';

/** URL de la base E2E: `E2E_DATABASE_URL` o la de desarrollo con el nombre de base cambiado. */
export function e2eDatabaseUrl(root, env = process.env) {
  // Se lee SOLO DATABASE_URL del .env, sin cargarlo en el proceso: si se cargara entero, variables
  // como NODE_ENV=development se colarían en `next build` y romperían la compilación.
  const envFile = path.join(root, '.env');
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  const explicit = env.E2E_DATABASE_URL;
  if (explicit) return assertE2eUrl(explicit);
  const base =
    env.DATABASE_URL ?? fromFile.DATABASE_URL ?? 'postgresql://ifts2:ifts2@localhost:5433/ifts2';
  const url = new URL(base);
  url.pathname = `/${E2E_DB_NAME}`;
  return assertE2eUrl(url.toString());
}

/** Rechaza cualquier destino que no sea la base E2E local descartable. */
export function assertE2eUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('E2E_DATABASE_URL no es una URL de PostgreSQL válida.');
  }
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port !== '5433' ||
    url.pathname !== `/${E2E_DB_NAME}`
  ) {
    throw new Error(
      `La suite E2E solo puede usar la base local ${E2E_DB_NAME} en el puerto 5433 (recibió ${url.hostname}:${url.port}${url.pathname}).`,
    );
  }
  return value;
}

/**
 * Crea la base si no existe y la deja VACÍA (borra y recrea el esquema `public`). Después hay que
 * aplicar las migraciones y la semilla (`prepareE2eDatabase` en scripts/e2e.mjs).
 */
export async function emptyE2eDatabase(root, e2eUrl) {
  assertE2eUrl(e2eUrl);
  // El cliente de Prisma carga el .env de la raíz en process.env al conectarse. Eso metería, por
  // ejemplo, NODE_ENV=development en el `next build` que corre después y lo rompería ("<Html> should
  // not be imported…"). Al terminar se quitan las variables que haya agregado.
  const envBefore = new Set(Object.keys(process.env));
  try {
    await emptyWithPrisma(root, e2eUrl);
  } finally {
    for (const key of Object.keys(process.env)) if (!envBefore.has(key)) delete process.env[key];
  }
}

async function emptyWithPrisma(root, e2eUrl) {
  const require = createRequire(path.join(root, 'package.json'));
  const { PrismaClient } = require('@prisma/client');

  // 1. Crear la base (desde la base de mantenimiento `postgres` del mismo servidor).
  const admin = new URL(e2eUrl);
  admin.pathname = '/postgres';
  const server = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
  try {
    const rows = await server.$queryRawUnsafe(
      `SELECT 1 FROM pg_database WHERE datname = '${E2E_DB_NAME}'`,
    );
    if (rows.length === 0) await server.$executeRawUnsafe(`CREATE DATABASE "${E2E_DB_NAME}"`);
  } finally {
    await server.$disconnect();
  }

  // 2. Vaciarla: se verifica de nuevo el nombre CONECTADO antes de borrar nada.
  const db = new PrismaClient({ datasources: { db: { url: e2eUrl } } });
  try {
    const [{ name }] = await db.$queryRawUnsafe('SELECT current_database() AS name');
    if (name !== E2E_DB_NAME) throw new Error(`Se conectó a "${name}", no a ${E2E_DB_NAME}.`);
    await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await db.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await db.$disconnect();
  }
}
