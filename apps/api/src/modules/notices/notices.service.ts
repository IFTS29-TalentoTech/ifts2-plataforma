/**
 * Servicio de avisos académicos (RF03 / RF06, US-11, US-36).
 *
 * Reglas de negocio que vive acá:
 * - El estado EXPIRED NO se guarda: se calcula comparando `visibleUntil` con la hora actual
 *   (`isNoticeExpired` de @ifts2/shared). Solo se guarda ACTIVE | PAUSED.
 * - Nada se elimina solo: `DELETE` es manual y solo para avisos pausados o vencidos.
 * - Reactivar un aviso vencido exige una nueva fecha de fin (RF03, "reactivarlo con una nueva vigencia").
 */
import type { Notice, Prisma } from '@prisma/client';
import {
  isNoticeExpired,
  isNoticeVisible,
  type NoticeDto,
  type NoticeViewStatus,
  type NoticeViewStatusDto,
} from '@ifts2/shared';
import { errors } from '../../infra/errors';
import type { Db } from '../../infra/prisma';
import { documentRefSelect, toDocumentRef } from '../../lib/documents';

export const noticeInclude = {
  category: { select: { id: true, name: true } },
  attachment: { select: documentRefSelect },
} satisfies Prisma.NoticeInclude;

export type NoticeRow = Prisma.NoticeGetPayload<{ include: typeof noticeInclude }>;

/** Estado para los filtros del panel. PAUSED gana sobre EXPIRED (alguien lo pausó a propósito). */
export function viewStatusOf(
  n: Pick<Notice, 'status' | 'visibleUntil' | 'visibleFrom'>,
  now: Date,
) {
  if (n.status === 'PAUSED') return 'PAUSED' as const;
  if (isNoticeExpired(n, now)) return 'EXPIRED' as const;
  return 'ACTIVE' as const;
}

export function toNoticeDto(n: NoticeRow, now: Date = new Date()): NoticeDto {
  const view: NoticeViewStatusDto = viewStatusOf(n, now);
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    categoryId: n.categoryId,
    category: n.category,
    audience: n.audience,
    urgent: n.urgent,
    highlighted: n.highlighted,
    status: n.status,
    viewStatus: view,
    visibleNow: isNoticeVisible(n, now),
    visibleFrom: n.visibleFrom.toISOString(),
    visibleUntil: n.visibleUntil ? n.visibleUntil.toISOString() : null,
    attachmentId: n.attachmentId,
    attachment: toDocumentRef(n.attachment),
    authorId: n.authorId,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

/**
 * Filtro SQL equivalente a `viewStatusOf` (el mismo criterio que `isNoticeExpired`: vence cuando
 * `now >= visibleUntil`, el fin es EXCLUSIVO).
 */
export function viewStatusWhere(view: NoticeViewStatus, now: Date): Prisma.NoticeWhereInput {
  const notExpired: Prisma.NoticeWhereInput = {
    OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }],
  };
  switch (view) {
    case 'ACTIVE':
      return { status: 'ACTIVE', ...notExpired };
    case 'PAUSED':
      return { status: 'PAUSED' };
    case 'EXPIRED':
      return { status: 'ACTIVE', visibleUntil: { lte: now } };
    default:
      return {};
  }
}

/** ¿Se puede eliminar? Solo pausado o vencido (regla 8: nunca contenido vigente). */
export function canDeleteNotice(
  n: Pick<Notice, 'status' | 'visibleUntil' | 'visibleFrom'>,
  now: Date,
) {
  const v = viewStatusOf(n, now);
  return v === 'PAUSED' || v === 'EXPIRED';
}

/** La categoría, si viene, debe existir y ser de tipo NOTICE. */
export async function assertNoticeCategory(db: Db | Prisma.TransactionClient, id?: string | null) {
  if (!id) return;
  const c = await db.category.findUnique({ where: { id }, select: { kind: true } });
  if (!c || c.kind !== 'NOTICE') {
    throw errors.unprocessable('La categoría elegida no es válida para avisos.', {
      categoryId: ['La categoría elegida no es válida para avisos.'],
    });
  }
}

export function assertWindow(from: Date, until: Date | null | undefined) {
  if (until && until.getTime() <= from.getTime()) {
    throw errors.unprocessable('La fecha de fin debe ser posterior a la fecha de inicio.', {
      visibleUntil: ['La fecha de fin debe ser posterior a la fecha de inicio.'],
    });
  }
}
