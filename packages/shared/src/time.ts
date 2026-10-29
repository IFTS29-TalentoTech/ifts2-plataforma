import { APP_TIMEZONE } from './enums';

/** Buenos Aires está en UTC-3 todo el año (sin horario de verano desde 2009). */
const BA_OFFSET_MS = 3 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Instante UTC de las 00:00:00.000 hora de Buenos Aires del día `yyyy-mm-dd`. */
export function startOfDayBA(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + BA_OFFSET_MS);
}

/** Instante UTC de las 23:59:59.999 hora de Buenos Aires del día `yyyy-mm-dd`. */
export function endOfDayBA(dateStr: string): Date {
  return new Date(startOfDayBA(dateStr).getTime() + DAY_MS - 1);
}

/** Fecha `yyyy-mm-dd` en Buenos Aires para un instante. */
export function toDateStrBA(date: Date): string {
  return new Date(date.getTime() - BA_OFFSET_MS).toISOString().slice(0, 10);
}

/** `dd/mm/aaaa` en Buenos Aires. */
export function formatDateAR(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/** `dd/mm/aaaa HH:mm` en Buenos Aires. */
export function formatDateTimeAR(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
