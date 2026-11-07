/**
 * Galerías editables (RF09, ADR-036): lectura y mapeo compartidos por el panel (`/gallery`) y por la
 * API pública (`/public/gallery`).
 *
 * `GalleryItem.image` guarda una RUTA propia (`/img/...`, la deja la semilla) o una CLAVE del
 * almacenamiento (`gallery/<uuid>.webp`, la deja la subida). Las URL firmadas vencen, así que no se
 * guardan: se resuelven acá al responder (igual que las portadas, ver `lib/cover.ts`).
 * RNF03: si el almacenamiento falla, la diapositiva queda sin `src`; el panel la sigue mostrando y el
 * sitio público directamente la omite (el resto de la página no se rompe).
 */
import type { GalleryArea, GalleryItem } from '@prisma/client';
import type { GalleryItemDto, PublicGalleryItemDto } from '@ifts2/shared';
import type { AppContext } from '../../context';
import { isStorageKey, resolveCoverSrc } from '../../lib/cover';

/** Diapositivas de un área (o de las dos), en el orden en que se muestran. */
export function listGallery(ctx: AppContext, area?: GalleryArea): Promise<GalleryItem[]> {
  return ctx.prisma.galleryItem.findMany({
    where: area ? { area } : {},
    orderBy: [{ area: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
  });
}

/** Elimina del almacenamiento la imagen de una diapositiva, solo si es una clave nuestra. */
export async function removeStoredImage(ctx: AppContext, image: string): Promise<void> {
  if (!isStorageKey(image)) return; // ruta propia del sitio o dirección externa: no es nuestra
  await ctx.storage.remove(image).catch((e) => {
    // Un archivo huérfano no justifica fallar la operación (ya confirmada); queda registrado.
    ctx.logger.warn({ err: String(e), key: image }, 'no se pudo borrar la imagen de la galería');
  });
}

export async function toGalleryDto(ctx: AppContext, row: GalleryItem): Promise<GalleryItemDto> {
  return {
    id: row.id,
    area: row.area,
    order: row.order,
    title: row.title,
    caption: row.caption,
    alt: row.alt,
    image: row.image,
    src: await resolveCoverSrc(ctx.storage, row.image),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Diapositivas públicas de un área: solo las que tienen una imagen utilizable. */
export async function listPublicGallery(
  ctx: AppContext,
  area: GalleryArea,
): Promise<PublicGalleryItemDto[]> {
  const rows = await listGallery(ctx, area);
  const items: PublicGalleryItemDto[] = [];
  for (const row of rows) {
    const src = await resolveCoverSrc(ctx.storage, row.image);
    if (!src) continue;
    items.push({ id: row.id, src, title: row.title, caption: row.caption, alt: row.alt });
  }
  return items;
}
