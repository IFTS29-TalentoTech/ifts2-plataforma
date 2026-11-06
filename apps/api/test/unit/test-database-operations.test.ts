import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_DATABASE_MARKER } from '../helpers/test-database';

const mocks = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  };
  const db = {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    $transaction: vi.fn(),
  };
  return {
    transaction,
    db,
    PrismaClient: vi.fn(function () {
      return db;
    }),
    execSync: vi.fn(),
  };
});

vi.mock('@prisma/client', () => ({ PrismaClient: mocks.PrismaClient }));
vi.mock('node:child_process', () => ({ execSync: mocks.execSync }));
vi.mock('dotenv', () => ({ config: vi.fn() }));

const url = 'postgresql://ifts2:clave@localhost:5433/ifts2_test';
const identity = [{ database: 'ifts2_test', marker: TEST_DATABASE_MARKER }];

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('TEST_DATABASE_URL', url);
  vi.stubEnv('DATABASE_URL', 'postgresql://ifts2:clave@localhost:5433/ifts2');
  mocks.db.$queryRaw.mockResolvedValue(identity);
  mocks.db.$transaction.mockImplementation((callback) => callback(mocks.transaction));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('migraciones de integración', () => {
  it.each([undefined, '', url.replace('ifts2_test', 'ifts2')])(
    'no crea clientes ni migra si TEST_DATABASE_URL es inválida: %s',
    async (value) => {
      vi.stubEnv('TEST_DATABASE_URL', value);
      const { default: setup } = await import('../helpers/global-setup');
      await expect(setup()).rejects.toThrow(/TEST_DATABASE_URL/);
      expect(mocks.PrismaClient).not.toHaveBeenCalled();
      expect(mocks.execSync).not.toHaveBeenCalled();
    },
  );

  it.each(['ifts2', 'ifts2_test'])('no migra una base sin marca: %s', async (database) => {
    mocks.db.$queryRaw.mockResolvedValue([{ database, marker: null }]);
    const { default: setup } = await import('../helpers/global-setup');
    await expect(setup()).rejects.toThrow(/no corresponde/);
    expect(mocks.execSync).not.toHaveBeenCalled();
    expect(mocks.db.$disconnect).toHaveBeenCalledOnce();
  });

  it('no migra si falla la verificación de conexión', async () => {
    mocks.db.$queryRaw.mockRejectedValue(new Error('sin conexión'));
    const { default: setup } = await import('../helpers/global-setup');
    await expect(setup()).rejects.toThrow(/No se pudo verificar/);
    expect(mocks.execSync).not.toHaveBeenCalled();
    expect(mocks.db.$disconnect).toHaveBeenCalledOnce();
  });

  it('migra solo después de verificar y usa exactamente la URL autorizada', async () => {
    const { default: setup } = await import('../helpers/global-setup');
    await setup();
    expect(mocks.PrismaClient).toHaveBeenCalledWith({ datasources: { db: { url } } });
    expect(mocks.execSync).toHaveBeenCalledWith(
      'pnpm exec prisma migrate deploy',
      expect.objectContaining({ env: expect.objectContaining({ DATABASE_URL: url }) }),
    );
    expect(mocks.db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.execSync.mock.invocationCallOrder[0]!,
    );
  });
});

describe('cliente compartido y resetDb', () => {
  it('ignora DATABASE_URL y verifica el cliente antes de publicarlo', async () => {
    await import('../helpers/db');
    expect(mocks.PrismaClient).toHaveBeenCalledWith({ datasources: { db: { url } } });
    expect(mocks.db.$queryRaw).toHaveBeenCalledOnce();
  });

  it('no publica el cliente si falta TEST_DATABASE_URL', async () => {
    vi.stubEnv('TEST_DATABASE_URL', undefined);
    await expect(import('../helpers/db')).rejects.toThrow(/Falta TEST_DATABASE_URL/);
    expect(mocks.PrismaClient).not.toHaveBeenCalled();
  });

  it('no publica el cliente si no puede verificar el destino', async () => {
    mocks.db.$queryRaw.mockRejectedValue(new Error('sin conexión'));
    await expect(import('../helpers/db')).rejects.toThrow(/No se pudo verificar/);
    expect(mocks.db.$disconnect).toHaveBeenCalledOnce();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it.each([null, 'otra-marca'])('no publica un cliente sin autorización: %s', async (marker) => {
    mocks.db.$queryRaw.mockResolvedValue([{ database: 'ifts2_test', marker }]);
    await expect(import('../helpers/db')).rejects.toThrow(/no corresponde/);
    expect(mocks.db.$disconnect).toHaveBeenCalledOnce();
  });

  it('vuelve a verificar dentro de la transacción antes de truncar y escapa identificadores', async () => {
    const { resetDb } = await import('../helpers/db');
    mocks.transaction.$queryRaw
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce([{ tablename: 'User' }, { tablename: 'nombre"especial' }]);
    await resetDb();
    expect(mocks.transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.$executeRawUnsafe).toHaveBeenCalledWith(
      'TRUNCATE TABLE "public"."User", "public"."nombre""especial" RESTART IDENTITY CASCADE',
    );
    expect(mocks.transaction.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.transaction.$executeRawUnsafe.mock.invocationCallOrder[0]!,
    );
  });

  it('no trunca si se retiró la autorización después de crear el cliente', async () => {
    const { resetDb } = await import('../helpers/db');
    mocks.transaction.$queryRaw.mockResolvedValue([{ database: 'ifts2_test', marker: null }]);
    await expect(resetDb()).rejects.toThrow(/no corresponde/);
    expect(mocks.transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.transaction.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('no trunca si no puede verificar la conexión de la transacción', async () => {
    const { resetDb } = await import('../helpers/db');
    mocks.transaction.$queryRaw.mockRejectedValue(new Error('sin conexión'));
    await expect(resetDb()).rejects.toThrow(/No se pudo verificar/);
    expect(mocks.transaction.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('no trunca una base autorizada sin tablas', async () => {
    const { resetDb } = await import('../helpers/db');
    mocks.transaction.$queryRaw.mockResolvedValueOnce(identity).mockResolvedValueOnce([]);
    await resetDb();
    expect(mocks.transaction.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
