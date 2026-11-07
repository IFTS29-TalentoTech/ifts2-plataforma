import { describe, expect, it, vi } from 'vitest';
import {
  requireTestDatabaseUrl,
  TEST_DATABASE_MARKER,
  verifyTestDatabase,
} from '../helpers/test-database';

const url = 'postgresql://ifts2:clave@localhost:5433/ifts2_test';

describe('requireTestDatabaseUrl', () => {
  it.each([
    url,
    url.replace('postgresql:', 'postgres:'),
    url.replace('localhost', '127.0.0.1'),
    url.replace('localhost', '[::1]'),
    `${url}?schema=public`,
  ])('acepta el destino local explícito: %s', (value) => {
    expect(requireTestDatabaseUrl({ TEST_DATABASE_URL: value })).toBe(value);
  });

  it.each([undefined, ''])('rechaza configuración ausente sin recurrir a DATABASE_URL', (value) => {
    expect(() => requireTestDatabaseUrl({ TEST_DATABASE_URL: value, DATABASE_URL: url })).toThrow(
      /Falta TEST_DATABASE_URL/,
    );
  });

  it.each([
    'incorrecta',
    url.replace('postgresql:', 'https:'),
    url.replace('localhost', 'produccion.example'),
    url.replace(':5433', ''),
    url.replace(':5433', ':5432'),
    url.replace('ifts2_test', 'ifts2'),
    url.replace('ifts2_test', 'ifts2_test_copia'),
    url.replace('ifts2_test', '%69fts2_test'),
    url.replace('ifts2:clave@', ''),
    `${url}?host=produccion.example`,
    `${url}?dbname=ifts2`,
    `${url}?schema=privado`,
    `${url}?options=-csearch_path=privado`,
    `${url}?schema=public&schema=public`,
    `${url}#fragmento`,
    ` ${url}`,
  ])('rechaza una URL insegura sin incluir credenciales en el error: %s', (value) => {
    expect(() => requireTestDatabaseUrl({ TEST_DATABASE_URL: value })).toThrow();
    try {
      requireTestDatabaseUrl({ TEST_DATABASE_URL: value });
    } catch (error) {
      expect(String(error)).not.toContain('clave');
    }
  });
});

describe('verifyTestDatabase', () => {
  it('autoriza únicamente la identidad y la marca esperadas con una consulta de lectura', async () => {
    const db = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ database: 'ifts2_test', marker: TEST_DATABASE_MARKER }]),
    };
    await expect(verifyTestDatabase(db)).resolves.toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.$queryRaw.mock.calls[0]![0].join('')).toMatch(/SELECT current_database\(\)/);
  });

  it.each(
    [
      [],
      [{ database: 'ifts2', marker: TEST_DATABASE_MARKER }],
      [{ database: 'ifts2_test', marker: null }],
      [{ database: 'ifts2_test', marker: 'otra-marca' }],
      [
        { database: 'ifts2_test', marker: TEST_DATABASE_MARKER },
        { database: 'ifts2_test', marker: TEST_DATABASE_MARKER },
      ],
    ].map((rows) => ({ rows })),
  )('bloquea destinos sin autorización verificable: $rows', async ({ rows }) => {
    await expect(
      verifyTestDatabase({ $queryRaw: vi.fn().mockResolvedValue(rows) }),
    ).rejects.toThrow(/no corresponde/);
  });

  it('bloquea errores de conexión sin exponer el error del proveedor', async () => {
    const db = { $queryRaw: vi.fn().mockRejectedValue(new Error(url)) };
    await expect(verifyTestDatabase(db)).rejects.toThrow(
      'No se pudo verificar la base de pruebas; se bloquean las operaciones.',
    );
  });
});
