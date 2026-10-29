import { DAY_MS } from './time';
import { EXPIRING_SOON_DAYS } from './enums';
import type { NoticeStatus, PublicationStatus } from './enums';

/**
 * Reglas de vigencia (docs/specs/01-requerimientos.md, "Reglas de negocio").
 * Se calculan al consultar; ninguna tarea programada oculta ni elimina contenido (ADR-07).
 *
 * Convención de bordes: `visibleFrom` es INCLUSIVO y `visibleUntil` es EXCLUSIVO.
 * Las fechas de fin ingresadas como día se guardan como 23:59:59.999 hora de Buenos Aires
 * (ver schemas), de modo que "vigente hasta el 25/11" incluye todo el 25/11.
 */
type MaybeDate = Date | null | undefined;

export function isWithinWindow(now: Date, from: MaybeDate, until: MaybeDate): boolean {
  const t = now.getTime();
  if (from && t < from.getTime()) return false;
  if (until && t >= until.getTime()) return false;
  return true;
}

export interface PublicationLike {
  status: PublicationStatus;
  visibleFrom?: MaybeDate;
  visibleUntil?: MaybeDate;
}

/** PUBLISHED dentro de la ventana, o SCHEDULED cuya `visibleFrom` ya llegó (y no venció). */
export function isPublicationVisible(p: PublicationLike, now: Date = new Date()): boolean {
  if (p.status === 'PUBLISHED') return isWithinWindow(now, p.visibleFrom, p.visibleUntil);
  if (p.status === 'SCHEDULED') {
    if (!p.visibleFrom) return false; // programada sin fecha: nunca se activa sola
    return isWithinWindow(now, p.visibleFrom, p.visibleUntil);
  }
  return false;
}

export interface NoticeLike {
  status: NoticeStatus;
  visibleFrom?: MaybeDate;
  visibleUntil?: MaybeDate;
}

export function isNoticeVisible(n: NoticeLike, now: Date = new Date()): boolean {
  return n.status === 'ACTIVE' && isWithinWindow(now, n.visibleFrom, n.visibleUntil);
}

/** Vigente y que vence dentro de los próximos `days` días (por defecto 7). */
export function isNoticeExpiringSoon(
  n: NoticeLike,
  now: Date = new Date(),
  days: number = EXPIRING_SOON_DAYS,
): boolean {
  if (!isNoticeVisible(n, now) || !n.visibleUntil) return false;
  return n.visibleUntil.getTime() - now.getTime() <= days * DAY_MS;
}

/** Aviso cuya vigencia terminó (se muestra "Vencido" en el panel, aunque siga ACTIVE). */
export function isNoticeExpired(n: NoticeLike, now: Date = new Date()): boolean {
  return !!n.visibleUntil && now.getTime() >= n.visibleUntil.getTime();
}

export interface TermLike {
  publicCurrent: boolean;
}

export interface PublishableLike {
  published: boolean;
}

/** Visible solo si está publicado y su ciclo es el público actual. */
export function isScheduleVisible(s: PublishableLike, term: TermLike): boolean {
  return s.published && term.publicCurrent;
}

export function isExamCallVisible(c: PublishableLike, term: TermLike): boolean {
  return c.published && term.publicCurrent;
}

/** Verifica la regla "exactamente un ciclo público". */
export function hasSinglePublicTerm(terms: TermLike[]): boolean {
  return terms.filter((t) => t.publicCurrent).length === 1;
}
