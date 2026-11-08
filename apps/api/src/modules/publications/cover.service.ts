/**
 * Portada de una publicación: cambios sin perder ni romper imágenes (auditoría A10, subida manual).
 *
 * Garantía principal: una operación fallida o simultánea NUNCA deja una publicación apuntando a una
 * portada borrada. Para eso:
 * 1. Concurrencia optimista: la portada se cambia con un UPDATE condicional "solo si la portada guardada
 *    sigue siendo la esperada". PostgreSQL bloquea la fila durante el UPDATE: si dos pedidos compiten,
 *    el segundo reevalúa la condición con el valor ya confirmado por el primero y no actualiza nada
 *    (409). Así nadie pisa una portada con un dato viejo.
 * 2. Se distingue "no existe" (404) de "cambió en el medio" (409) consultando la fila cuando el UPDATE
 *    condicional no afecta ninguna.
 * 3. Si la transacción falla, la imagen recién subida se borra solo si ninguna publicación la usa. Ante
 *    la duda (confirmación ambigua o la base no responde) se conserva: mejor un archivo huérfano que una
 *    portada rota.
 * 4. La portada anterior se borra DESPUÉS de confirmar y solo si ya nadie la usa. Un error posterior a
 *    la confirmación nunca borra archivos.
 *
 * Los archivos huérfanos históricos no se limpian acá (trabajo posterior, ver docs/avance.md).
 */
import type { Prisma } from '@prisma/client';
import type { AppContext } from '../../context';
import { errors } from '../../infra/errors';
import { isStorageKey } from '../../lib/cover';

export const COVER_CONFLICT =
  'La portada cambió mientras la editabas (alguien más la modificó). Volvé a abrir la publicación e intentá de nuevo.';

/**
 * Dentro de una transacción: aplica `data` a la publicación. Si `expectedCover` no es `undefined`, solo
 * lo aplica si la portada guardada sigue siendo esa (`null` = sin portada). 404 si la publicación no
 * existe; 409 si la portada cambió.
 */
export async function guardedPublicationUpdate(
  tx: Prisma.TransactionClient,
  id: string,
  expectedCover: string | null | undefined,
  data: Prisma.PublicationUncheckedUpdateManyInput,
) {
  const where: Prisma.PublicationWhereInput =
    expectedCover === undefined ? { id } : { id, coverUrl: expectedCover };
  const res = await tx.publication.updateMany({ where, data });
  if (res.count === 1) return;
  // count 0: o no existe, o la portada ya no es la esperada. Se averigua cuál para responder bien.
  const exists = await tx.publication.count({ where: { id } });
  if (exists === 0) throw errors.notFound('No encontramos la publicación.');
  throw errors.conflict(COVER_CONFLICT);
}

/**
 * Borra una imagen propia del almacenamiento solo si ninguna publicación la usa. Si no se puede
 * verificar (la base no responde) o el borrado falla, la conserva: nunca falla el pedido por esto.
 */
export async function removeCoverIfUnused(ctx: AppContext, key: string | null | undefined) {
  if (!isStorageKey(key)) return;
  const inUse = await ctx.prisma.publication.count({ where: { coverUrl: key } }).catch(() => 1);
  if (inUse > 0) return;
  await ctx.storage.remove(key).catch(() => undefined);
}
