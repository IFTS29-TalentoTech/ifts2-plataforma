import { APP_TIMEZONE } from '@ifts2/shared';

/** Formato es-AR en la zona America/Argentina/Buenos_Aires (ADR-17). Fechas guardadas en UTC. */
export {
  formatDateAR,
  formatDateTimeAR,
  toDateStrBA,
  startOfDayBA,
  endOfDayBA,
} from '@ifts2/shared';

/** "29 de octubre de 2026". */
export function formatLongDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** "hoy 11:00 hs", "ayer", "hace 3 días": para listas del panel. */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

/** Días que faltan hasta `date` (entero, redondeado hacia arriba). */
export function daysUntil(date: Date | string, now: Date = new Date()): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}
