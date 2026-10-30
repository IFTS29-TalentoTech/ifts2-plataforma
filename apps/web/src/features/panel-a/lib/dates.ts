import { toDateStrBA } from '@ifts2/shared';

/** Valor `yyyy-mm-dd` (día en Buenos Aires) para un <input type="date"> a partir de un ISO. */
export function toInputDate(iso: string | null | undefined): string {
  return iso ? toDateStrBA(new Date(iso)) : '';
}

/** Vacío -> null (la API interpreta `yyyy-mm-dd` como inicio/fin de día en Buenos Aires). */
export function orNull(v: string): string | null {
  return v.trim() === '' ? null : v;
}

/** Hoy como `yyyy-mm-dd` en Buenos Aires. */
export function todayBA(): string {
  return toDateStrBA(new Date());
}

/** "hoy 11:00 hs" / "ayer" / "hace 3 días" para la lista de publicaciones detectadas. */
export function detectedLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}
