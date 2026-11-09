/**
 * Galerías con nombre (RF09, ADR-036, ADR-041): lectura y mapeo compartidos por el panel (`/gallery`) y
 * por el contenido público de cada página (`/public/content/:page`).
 *
 * `GalleryItem.image` guarda una RUTA propia (`/img/...`, la deja la semilla) o una CLAVE del
 * almacenamiento (`gallery/<uuid>.webp`, la deja la subida). Las URL firmadas vencen, así que no se
 * guardan: se resuelven acá al responder (igual que las portadas, ver `lib/cover.ts`).
 * RNF03: si el almacenamiento falla, la foto queda sin `src`; el panel la sigue mostrando y el
 * sitio público directamente la omite (el resto de la página no se rompe).
 */
import type { ContentSection, Gallery, GalleryItem } from '@prisma/client';
import type {
  ContentPage,
  GalleryDto,
  GalleryItemDto,
  PublicGalleryItemDto,
  PublicGallerySectionDto,
} from '@ifts2/shared';
import type { AppContext } from '../../context';
import { isStorageKey, resolveCoverSrc } from '../../lib/cover';

type GalleryRow = Gallery & {
  items: GalleryItem[];
  sections: Pick<ContentSection, 'page'>[];
};

/** Todas las galerías con sus fotos (en orden) y las páginas donde se muestran. */
export function listGalleries(ctx: AppContext): Promise<GalleryRow[]> {
  return ctx.prisma.gallery.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: {
      items: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      sections: { select: { page: true } },
    },
  });
}

/** Elimina del almacenamiento la imagen de una foto, solo si es una clave nuestra. */
export async function removeStoredImage(ctx: AppContext, image: string): Promise<void> {
  if (!isStorageKey(image)) return; // ruta propia del sitio o dirección externa: no es nuestra
  await ctx.storage.remove(image).catch((e) => {
    // Un archivo huérfano no justifica fallar la operación (ya confirmada); queda registrado.
    ctx.logger.warn({ err: String(e), key: image }, 'no se pudo borrar la imagen de la galería');
  });
}

export async function toGalleryItemDto(ctx: AppContext, row: GalleryItem): Promise<GalleryItemDto> {
  return {
    id: row.id,
    galleryId: row.galleryId,
    order: row.order,
    title: row.title,
    caption: row.caption,
    alt: row.alt,
    category: row.category,
    image: row.image,
    src: await resolveCoverSrc(ctx.storage, row.image),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function toGalleryDto(ctx: AppContext, row: GalleryRow): Promise<GalleryDto> {
  return {
    id: row.id,
    name: row.name,
    order: row.order,
    items: await Promise.all(row.items.map((i) => toGalleryItemDto(ctx, i))),
    pages: [...new Set(row.sections.map((s) => s.page as ContentPage))],
  };
}

/** Fotos públicas de una galería: solo las que tienen una imagen utilizable. */
async function publicItems(ctx: AppContext, items: GalleryItem[]): Promise<PublicGalleryItemDto[]> {
  const out: PublicGalleryItemDto[] = [];
  for (const row of items) {
    const src = await resolveCoverSrc(ctx.storage, row.image);
    if (!src) continue;
    out.push({
      id: row.id,
      src,
      title: row.title,
      caption: row.caption,
      alt: row.alt,
      category: row.category,
    });
  }
  return out;
}

/**
 * Secciones de galería VISIBLES de una página, con sus fotos. Una galería sin fotos utilizables no se
 * muestra (no queda un título vacío en el sitio).
 */
export async function listPublicGallerySections(
  ctx: AppContext,
  page: string,
): Promise<PublicGallerySectionDto[]> {
  const rows = await ctx.prisma.contentSection.findMany({
    where: { page, visible: true, kind: 'GALLERY', galleryId: { not: null } },
    orderBy: [{ order: 'asc' }, { slug: 'asc' }],
    include: {
      gallery: { include: { items: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } },
    },
  });
  const out: PublicGallerySectionDto[] = [];
  for (const s of rows) {
    const items = await publicItems(ctx, s.gallery?.items ?? []);
    if (items.length === 0) continue;
    out.push({ slug: s.slug, title: s.title, body: s.body, order: s.order, items });
  }
  return out;
}
