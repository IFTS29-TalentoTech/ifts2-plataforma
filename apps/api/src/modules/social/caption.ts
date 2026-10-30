/**
 * Textos derivados de la leyenda de Instagram para precargar el modal "Aprobar y publicar".
 * El editor puede reemplazar título y resumen; esto solo evita obligarlo a escribirlos de cero.
 */

/** Quita los hashtags y menciones (ruido para un titular) y normaliza espacios. */
export function stripHashtags(caption: string): string {
  return caption
    .replace(/(^|\s)[#＃@][\p{L}\p{N}_.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Corta en el último espacio antes de `max` y agrega puntos suspensivos si se acortó. */
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

/** Cuerpo de la publicación: la leyenda sin hashtags pero conservando los párrafos. */
export function deriveBody(caption: string): string {
  return caption
    .split(/\r?\n/)
    .map((line) => stripHashtags(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
