import { Prisma, PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errors } from '../../src/infra/errors';
import { userTransaction } from '../../src/modules/users/transaction';

const prisma = new PrismaClient();
const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('serialization failure', {
    code: 'P2034',
    clientVersion: Prisma.prismaVersion.client,
  });

afterEach(() => vi.restoreAllMocks());

describe('transacciones de usuarios', () => {
  it('reintenta P2034 y devuelve el resultado de la transacción confirmada', async () => {
    const transaction = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce('confirmado');
    const operation = vi.fn();

    await expect(userTransaction(prisma, operation)).resolves.toBe('confirmado');
    expect(transaction).toHaveBeenCalledTimes(3);
    for (const call of transaction.mock.calls) {
      expect(call).toEqual([
        operation,
        { isolationLevel: 'Serializable', maxWait: 2000, timeout: 5000 },
      ]);
    }
  });

  it('agota tres intentos y responde con un conflicto comprensible', async () => {
    const transaction = vi.spyOn(prisma, '$transaction').mockRejectedValue(conflict());
    await expect(userTransaction(prisma, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
      detail: expect.stringContaining('Intentá de nuevo'),
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('controla el vencimiento de la transacción sin reintentarlo', async () => {
    const transaction = vi.spyOn(prisma, '$transaction').mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('transaction timeout', {
        code: 'P2028',
        clientVersion: Prisma.prismaVersion.client,
      }),
    );
    await expect(userTransaction(prisma, vi.fn())).rejects.toMatchObject({
      status: 409,
      detail: expect.stringContaining('a tiempo'),
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  for (const error of [errors.unprocessable('Último administrador.'), new Error('fallo')]) {
    it(`no reintenta ni reemplaza otros errores: ${error.message}`, async () => {
      const transaction = vi.spyOn(prisma, '$transaction').mockRejectedValue(error);
      await expect(userTransaction(prisma, vi.fn())).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(1);
    });
  }
});
