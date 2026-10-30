import { z } from 'zod';
import { CATEGORY_KINDS } from './enums';
import { paginationQuery, text } from './schemas';

/**
 * Esquemas de los módulos `categories`, `publications` (extras) y `social` (agente de redes).
 * Viven en un archivo aparte para no pisar `schemas.ts` cuando trabajan varios agentes en paralelo.
 * Los mensajes de error van en español claro (forman parte de la consigna de la cátedra).
 */

const categoryKind = z.enum(CATEGORY_KINDS, {
  errorMap: () => ({
    message: `El tipo de categoría no es válido (${CATEGORY_KINDS.join(', ')}).`,
  }),
});

/** Renombrar una categoría. El tipo no se cambia: las publicaciones/avisos ya la usan según su tipo. */
export const categoryUpdateInput = z.object({
  name: text('El nombre de la categoría', 80),
});
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInput>;

/** Listado de categorías: pocas y sin paginar en la práctica (los selectores las necesitan todas). */
export const categoryListQuery = paginationQuery.extend({
  kind: categoryKind.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
});
