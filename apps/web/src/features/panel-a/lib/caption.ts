/**
 * Título y resumen sugeridos a partir de la leyenda de una publicación de Instagram, para precargar el
 * modal "Moderar y aprobar" (US-08: "título y resumen editables, derivados de la leyenda").
 *
 * Es la misma regla que `apps/api/src/modules/social/caption.ts` (que además es el valor por defecto si
 * el editor deja los campos vacíos). Se repite acá, en pocas líneas, porque la API no la expone.
 */

/** Quita hashtags y menciones (ruido para un titular) y normaliza espacios. */
function stripHashtags(caption: string): string {
  return caption
    .replace(/(^|\s)[#＃@][\p{L}\p{N}_.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const FALLBACK = 'Publicación de Instagram';

/** Título (máx. 160): primera oración o primera línea de la leyenda, sin hashtags. */
export function deriveTitle(caption: string): string {
  const firstLine = caption.split(/\r?\n/).find((l) => stripHashtags(l)) ?? '';
  const clean = stripHashtags(firstLine);
  if (!clean) return FALLBACK;
  const firstSentence = clean.match(/^.{8,}?[.!?](?=\s|$)/u)?.[0] ?? clean;
  return truncate(firstSentence.replace(/[.]$/, ''), 160);
}

/** Resumen (máx. 400): la leyenda completa sin hashtags, acortada. */
export function deriveSummary(caption: string): string {
  const clean = stripHashtags(caption);
  return clean ? truncate(clean, 400) : FALLBACK;
}
