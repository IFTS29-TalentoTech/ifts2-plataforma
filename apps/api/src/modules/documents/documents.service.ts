/**
 * Servicio del archivo documental (RF03, US-16..18).
 *
 * Reglas:
 * - Archivar NO borra: marca ARCHIVED + `archivedAt`; restaurar vuelve a ACTIVE + `restoredAt`.
 * - Un documento adjunto a algo que hoy se ve en el sitio (aviso vigente, horario o llamado
 *   publicado de un ciclo público) no se archiva sin confirmación explícita (`force`).
 * - Eliminar es manual y solo para documentos ARCHIVADOS que ningún aviso, horario o llamado
 *   referencie (la clave foránea es SET NULL: sin esta regla se perderían adjuntos en silencio).
 */
import type { Document, Prisma } from '@prisma/client';
import {
  isExamCallVisible,
  isNoticeVisible,
  isScheduleVisible,
  type DocumentDetailDto,
  type DocumentDto,
  type DocumentReferenceDto,
} from '@ifts2/shared';
import type { Db } from '../../infra/prisma';

type DbLike = Db | Prisma.TransactionClient;

export type DocumentWithUsage = Document & {
  _count: { notices: number; schedules: number; examCalls: number };
};

export const usageCount = {
  _count: { select: { notices: true, schedules: true, examCalls: true } },
} as const;

/** Nunca incluye `storageKey`. */
export function toDocumentDto(d: DocumentWithUsage): DocumentDto {
  return {
    id: d.id,
    title: d.title,
    filename: d.filename,
    kind: d.kind,
    category: d.category,
    cycleYear: d.cycleYear,
    termLabel: d.termLabel,
    resolutionCode: d.resolutionCode,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    archivedAt: d.archivedAt ? d.archivedAt.toISOString() : null,
    restoredAt: d.restoredAt ? d.restoredAt.toISOString() : null,
    uploadedBy: d.uploadedBy,
    createdAt: d.createdAt.toISOString(),
    usage: d._count,
  };
}

/** Todo lo que referencia al documento, con una marca de si hoy se ve en el sitio público. */
export async function findReferences(
  db: DbLike,
  documentId: string,
  now: Date = new Date(),
): Promise<DocumentReferenceDto[]> {
  const [notices, schedules, examCalls] = await Promise.all([
    db.notice.findMany({
      where: { attachmentId: documentId },
      select: { id: true, title: true, status: true, visibleFrom: true, visibleUntil: true },
    }),
    db.schedule.findMany({
      where: { documentId },
      select: {
        id: true,
        commissionName: true,
        published: true,
        term: { select: { publicCurrent: true } },
      },
    }),
    db.examCall.findMany({
      where: { documentId },
      select: { id: true, name: true, published: true, term: { select: { publicCurrent: true } } },
    }),
  ]);
  return [
    ...notices.map((n) => ({
      type: 'notice' as const,
      id: n.id,
      label: n.title,
      visible: isNoticeVisible(n, now),
    })),
    ...schedules.map((s) => ({
      type: 'schedule' as const,
      id: s.id,
      label: s.commissionName,
      visible: isScheduleVisible(s, s.term),
    })),
    ...examCalls.map((c) => ({
      type: 'examCall' as const,
      id: c.id,
      label: c.name,
      visible: isExamCallVisible(c, c.term),
    })),
  ];
}

export function toDocumentDetailDto(
  d: DocumentWithUsage,
  references: DocumentReferenceDto[],
): DocumentDetailDto {
  return {
    ...toDocumentDto(d),
    references,
    visibleReferences: references.filter((r) => r.visible).length,
  };
}

/** Condición de búsqueda `q`: título, nombre de archivo, código de resolución o año (si son 4 dígitos). */
export function searchWhere(q: string): Prisma.DocumentWhereInput {
  const or: Prisma.DocumentWhereInput[] = [
    { title: { contains: q, mode: 'insensitive' } },
    { resolutionCode: { contains: q, mode: 'insensitive' } },
    { filename: { contains: q, mode: 'insensitive' } },
    { category: { contains: q, mode: 'insensitive' } },
  ];
  if (/^\d{4}$/.test(q)) or.push({ cycleYear: Number(q) });
  return { OR: or };
}
