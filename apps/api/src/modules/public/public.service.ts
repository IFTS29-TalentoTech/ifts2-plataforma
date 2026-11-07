/**
 * Servicio del sitio público (`/public/*`): filtros de vigencia y armado de las respuestas.
 *
 * REGLA DE ORO (RF03/RF06, AGENTS.md #3): la vigencia SIEMPRE se calcula al consultar, nunca con
 * tareas programadas. Acá hay dos capas a propósito:
 *  1. Un filtro SQL (`visible*Where`) para que la base pagine y cuente solo lo visible.
 *  2. Una verificación en memoria con las funciones de @ifts2/shared (`isNoticeVisible`,
 *     `isPublicationVisible`, `isScheduleVisible`, `isExamCallVisible`), que son la definición
 *     oficial de "visible". Si el filtro SQL y la función alguna vez discreparan, gana la función.
 *     Las pruebas (test/api/public.test.ts) cubren los bordes: `visibleFrom` inclusivo y
 *     `visibleUntil` exclusivo.
 */
import type { Prisma } from '@prisma/client';
import {
  isExamCallVisible,
  isNoticeVisible,
  isPublicationVisible,
  isScheduleVisible,
  startOfDayBA,
  termLabel,
  toDateStrBA,
  type PublicExamCallDto,
  type PublicNoticeDto,
  type PublicPublicationCardDto,
  type PublicQuickLinkDto,
  type PublicScheduleDto,
} from '@ifts2/shared';
import { documentRefSelect, safeSignedUrl, toPublicFile } from '../../lib/documents';
import type { StorageProvider } from '../../infra/storage';

// ---------------------------------------------------------------------------
// Filtros SQL de vigencia (bordes: desde INCLUSIVO, hasta EXCLUSIVO)
// ---------------------------------------------------------------------------

const untilOk = (now: Date): Prisma.PublicationWhereInput => ({
  OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }],
});

/** Equivale a `isNoticeVisible`. */
export function visibleNoticeWhere(now: Date): Prisma.NoticeWhereInput {
  return {
    status: 'ACTIVE',
    visibleFrom: { lte: now },
    OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }],
  };
}

/** Equivale a `isPublicationVisible`: PUBLISHED en ventana, o SCHEDULED cuya `visibleFrom` ya llegó. */
export function visiblePublicationWhere(now: Date): Prisma.PublicationWhereInput {
  return {
    AND: [
      {
        OR: [
          { status: 'PUBLISHED', OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] },
          { status: 'SCHEDULED', visibleFrom: { lte: now } },
        ],
      },
      untilOk(now),
    ],
  };
}

/** Histórico: conserva las programadas con una ventana no vacía que ya terminó (RF03/ADR-07). */
export function expiredPublicationWhere(
  now: Date,
  fields: Prisma.PublicationFieldRefs,
): Prisma.PublicationWhereInput {
  return {
    visibleUntil: { lte: now },
    OR: [
      { status: 'PUBLISHED' },
      // El inicio anterior al fin vencido garantiza que llegó a ser elegible según shared.
      { status: 'SCHEDULED', visibleFrom: { lt: fields.visibleUntil } },
    ],
  };
}

/** Año en Buenos Aires -> rango [desde, hasta) en UTC. */
export function yearRangeBA(year: number): { gte: Date; lt: Date } {
  return { gte: startOfDayBA(`${year}-01-01`), lt: startOfDayBA(`${year + 1}-01-01`) };
}

export const currentYearBA = (now: Date) => Number(toDateStrBA(now).slice(0, 4));

/** La "fecha de publicación" de una tarjeta es visibleFrom, o createdAt si no tiene. */
export function publicationYearWhere(year: number): Prisma.PublicationWhereInput {
  const range = yearRangeBA(year);
  return {
    OR: [{ visibleFrom: range }, { visibleFrom: null, createdAt: range }],
  };
}

// ---------------------------------------------------------------------------
// Includes y mapeos
// ---------------------------------------------------------------------------

export const publicDocSelect = {
  ...documentRefSelect,
  storageKey: true,
} satisfies Prisma.DocumentSelect;

export const noticeInclude = {
  category: { select: { id: true, name: true } },
  attachment: { select: publicDocSelect },
} satisfies Prisma.NoticeInclude;

export type PublicNoticeRow = Prisma.NoticeGetPayload<{ include: typeof noticeInclude }>;

/**
 * Portada: las que ya son URL absoluta o ruta se devuelven tal cual; una clave de almacenamiento
 * se firma. Si el almacenamiento falla devuelve null (RNF03: la página igual carga).
 */
async function resolveCover(storage: StorageProvider, v: string | null): Promise<string | null> {
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
  return safeSignedUrl(storage, v);
}

export const publicationInclude = {
  category: { select: { id: true, name: true } },
  socialPost: { select: { permalink: true } },
} satisfies Prisma.PublicationInclude;
export type PublicationRow = Prisma.PublicationGetPayload<{ include: typeof publicationInclude }>;

export async function toPublicationCard(
  storage: StorageProvider,
  p: PublicationRow,
): Promise<PublicPublicationCardDto> {
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    summary: p.summary,
    coverUrl: await resolveCover(storage, p.coverUrl),
    category: p.category,
    section: p.section,
    origin: p.origin,
    date: (p.visibleFrom ?? p.createdAt).toISOString(),
    visibleUntil: p.visibleUntil ? p.visibleUntil.toISOString() : null,
    eventStart: p.eventStart ? p.eventStart.toISOString() : null,
    eventEnd: p.eventEnd ? p.eventEnd.toISOString() : null,
    location: p.location,
  };
}

export function stillVisible(rows: PublicationRow[], now: Date): PublicationRow[] {
  return rows.filter((p) => isPublicationVisible(p, now));
}

export async function toPublicNotice(
  storage: StorageProvider,
  n: PublicNoticeRow,
): Promise<PublicNoticeDto> {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    urgent: n.urgent,
    highlighted: n.highlighted, // sigue vigente por definición: está en la lista de visibles
    audience: n.audience,
    category: n.category,
    visibleFrom: n.visibleFrom.toISOString(),
    visibleUntil: n.visibleUntil ? n.visibleUntil.toISOString() : null,
    attachment: await toPublicFile(storage, n.attachment),
  };
}

export function stillVisibleNotices(rows: PublicNoticeRow[], now: Date): PublicNoticeRow[] {
  return rows.filter((n) => isNoticeVisible(n, now));
}

export const scheduleInclude = {
  document: { select: publicDocSelect },
} satisfies Prisma.ScheduleInclude;
export const examCallInclude = {
  document: { select: publicDocSelect },
} satisfies Prisma.ExamCallInclude;

export async function toPublicSchedule(
  storage: StorageProvider,
  s: Prisma.ScheduleGetPayload<{ include: typeof scheduleInclude }>,
): Promise<PublicScheduleDto> {
  return {
    id: s.id,
    commissionName: s.commissionName,
    notes: s.notes,
    updatedAt: s.updatedAt.toISOString(),
    file: await toPublicFile(storage, s.document),
  };
}

export async function toPublicExamCall(
  storage: StorageProvider,
  c: Prisma.ExamCallGetPayload<{ include: typeof examCallInclude }>,
  now: Date,
): Promise<PublicExamCallDto> {
  return {
    id: c.id,
    name: c.name,
    startsOn: c.startsOn.toISOString(),
    endsOn: c.endsOn.toISOString(),
    enrollmentOpen: c.enrollmentOpen,
    // "Destacar hasta su fecha" (reunión del 06/10): deja de resaltarse cuando el llamado terminó.
    highlighted: c.highlighted && now.getTime() < c.endsOn.getTime(),
    notes: c.notes,
    updatedAt: c.updatedAt.toISOString(),
    file: await toPublicFile(storage, c.document),
  };
}

export const toQuickLink = (l: {
  id: string;
  title: string;
  url: string;
  description: string | null;
  group: string;
}): PublicQuickLinkDto => ({
  id: l.id,
  title: l.title,
  url: l.url,
  description: l.description,
  group: l.group,
});

/** Horarios/llamados visibles del ciclo público (verificación en memoria con las funciones de shared). */
export function onlyVisibleSchedules<T extends { published: boolean }>(
  rows: T[],
  term: { publicCurrent: boolean },
): T[] {
  return rows.filter((s) => isScheduleVisible(s, term));
}
export function onlyVisibleExamCalls<T extends { published: boolean }>(
  rows: T[],
  term: { publicCurrent: boolean },
): T[] {
  return rows.filter((c) => isExamCallVisible(c, term));
}

export { termLabel };
