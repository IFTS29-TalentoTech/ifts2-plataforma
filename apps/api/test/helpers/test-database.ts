export const TEST_DATABASE_MARKER = 'ifts2:disposable-test-database';

export function requireTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.TEST_DATABASE_URL;
  if (!value) throw new Error('Falta TEST_DATABASE_URL; no se permite usar DATABASE_URL.');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL no es una URL PostgreSQL válida.');
  }

  // Solo se autoriza el destino local descartable definido por Docker y CI.
  if (
    value !== value.trim() ||
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port !== '5433' ||
    url.pathname !== '/ifts2_test' ||
    !url.username ||
    !url.password ||
    url.hash ||
    [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public') ||
    url.searchParams.getAll('schema').length > 1
  ) {
    throw new Error('TEST_DATABASE_URL debe apuntar a la base local descartable ifts2_test:5433.');
  }
  return value;
}

interface DatabaseIdentity {
  database: string;
  marker: string | null;
}

interface DatabaseConnection {
  $queryRaw<T>(query: TemplateStringsArray): Promise<T>;
}

export async function verifyTestDatabase(db: DatabaseConnection): Promise<void> {
  let rows: DatabaseIdentity[];
  try {
    rows = await db.$queryRaw<DatabaseIdentity[]>`
      SELECT current_database() AS database,
        shobj_description(oid, 'pg_database') AS marker
      FROM pg_database WHERE datname = current_database()`;
  } catch {
    throw new Error('No se pudo verificar la base de pruebas; se bloquean las operaciones.');
  }
  if (
    rows.length !== 1 ||
    rows[0]?.database !== 'ifts2_test' ||
    rows[0]?.marker !== TEST_DATABASE_MARKER
  ) {
    throw new Error('La conexión no corresponde a una base de pruebas descartable autorizada.');
  }
}
