/**
 * Representación de una publicación para el panel (RF03).
 *
 * La visibilidad pública SIEMPRE se calcula con `isPublicationVisible` de @ifts2/shared al consultar:
 * ninguna tarea programada oculta ni borra contenido (ADR-07). Acá solo se expone el resultado
 * (`visible`, `expired`) para que el panel muestre etiquetas como "En línea" o "Vencida".
 */
import type { Category, Publication, SocialPost } from '@prisma/client';
import { isPublicationVisible } from '@ifts2/shared';
import type { StorageProvider } from '../../infra/storage';
import { resolveCoverSrc } from '../../lib/cover';

export type PublicationRow = Publication & {
  category?: Pick<Category, 'id' | 'name'> | null;
  socialPost?: Pick<SocialPost, 'id' | 'permalink' | 'status'> | null;
};

/** ¿Pasó su fecha de fin? (Aplica a cualquier estado: una pausada con fecha vencida también "venció".) */
export function isExpired(p: Pick<Publication, 'visibleUntil'>, now: Date = new Date()): boolean {
  return !!p.visibleUntil && now.getTime() >= p.visibleUntil.getTime();
}

export async function toPublicationView(
  storage: StorageProvider,
  p: PublicationRow,
  now: Date = new Date(),
) {
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    summary: p.summary,
    body: p.body,
    /** Valor guardado: dirección absoluta o clave del almacenamiento (ver lib/cover.ts). */
    coverUrl: p.coverUrl,
    /** Dirección lista para un `<img>` (URL firmada si es una clave). */
    coverSrc: await resolveCoverSrc(storage, p.coverUrl),
    categoryId: p.categoryId,
    category: p.category ? { id: p.category.id, name: p.category.name } : null,
    section: p.section,
    status: p.status,
    origin: p.origin,
    socialPostId: p.socialPostId,
    socialPermalink: p.socialPost?.permalink ?? null,
    visibleFrom: p.visibleFrom,
    visibleUntil: p.visibleUntil,
    eventStart: p.eventStart,
    eventEnd: p.eventEnd,
    location: p.location,
    authorId: p.authorId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    /** ¿La ve hoy un visitante del sitio? (cálculo de vigencia, RF03) */
    visible: isPublicationVisible(p, now),
    /** ¿Ya pasó su fecha de fin? El panel la muestra como "Vencida" y puede reactivarse con nueva vigencia. */
    expired: isExpired(p, now),
  };
}

export const publicationInclude = {
  category: { select: { id: true, name: true } },
  socialPost: { select: { id: true, permalink: true, status: true } },
} as const;
