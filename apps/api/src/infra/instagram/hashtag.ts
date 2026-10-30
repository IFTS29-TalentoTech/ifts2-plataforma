/**
 * Filtro por hashtag de las publicaciones de Instagram (RF04, ADR-09).
 *
 * Solo se importan las publicaciones cuya leyenda contiene el hashtag configurado en
 * `SiteSetting.instagram_hashtag`. Reglas:
 *  - Sin distinguir mayúsculas ni acentos (los editores escriben `#IFTS2Web` o `#ifts2web` indistintamente).
 *  - Coincidencia de hashtag COMPLETO: `#ifts2web` NO coincide con `#ifts2web2024` ni con `#nuevo_ifts2web`
 *    (un hashtag termina donde termina la secuencia de letras, números y guiones bajos).
 *  - Debe estar precedido por inicio de texto o un carácter que no sea parte de una palabra
 *    (así `mail@ifts2web` o `ab#ifts2web` no cuentan).
 */

/** Quita acentos y pasa a minúsculas para comparar. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().normalize('NFC');
}

/** Devuelve el hashtag sin `#` y plegado, o `null` si queda vacío. */
export function normalizeHashtag(tag: string | null | undefined): string | null {
  const bare = fold((tag ?? '').trim()).replace(/^[#＃]+/, '');
  return bare.length > 0 ? bare : null;
}

/** ¿La leyenda contiene el hashtag (completo) indicado? */
export function captionHasHashtag(caption: string | null | undefined, hashtag: string): boolean {
  const wanted = normalizeHashtag(hashtag);
  if (!wanted || !caption) return false;
  const text = fold(caption);
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // (inicio | carácter que no es de palabra) + # + etiqueta + (que no siga otro carácter de palabra)
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}_])[#＃]${escaped}(?![\\p{L}\\p{N}_])`, 'u');
  return re.test(text);
}
