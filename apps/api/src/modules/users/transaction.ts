import { Prisma, type PrismaClient } from '@prisma/client';
import { errors } from '../../infra/errors';

export async function userTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // Serializable evita que dos administradores se eliminen mutuamente por escritura sesgada.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 2000,
        timeout: 5000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034') {
          if (attempt < 2) continue;
          throw errors.conflict(
            'Otro cambio de usuarios impidió completar la operación. Intentá de nuevo.',
          );
        }
        if (error.code === 'P2028') {
          throw errors.conflict(
            'No se pudo completar el cambio de usuario a tiempo. Intentá de nuevo.',
          );
        }
      }
      throw error;
    }
  }
  throw new Error('Se agotaron los intentos de la transacción de usuarios.');
}
