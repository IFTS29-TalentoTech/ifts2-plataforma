/**
 * Enlaces a publicaciones de Instagram (ADR-045).
 *
 * Instagram NO deja copiar la dirección de la imagen: solo el enlace de la publicación
 * (`https://www.instagram.com/p/<código>/`, `/reel/<código>/`, `/tv/<código>/`, a veces con `?igsh=…`). Para
 * reconocer la misma publicación aunque la peguen con otra forma (con o sin `www`, con parámetros de
 * seguimiento, `/p/` en vez de `/reel/`, sin la barra final) se compara por el CÓDIGO corto, que es lo único
 * estable del enlace.
 */

const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am']);
const KINDS = new Set(['p', 'reel', 'reels', 'tv']);

/** Código corto de la publicación (`CxYz_123-ab`) o `null` si no es un enlace de publicación de Instagram. */
export function instagramShortcode(link: string | null | undefined): string | null {
  if (!link) return null;
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (!IG_HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  // Puede venir con el usuario por delante: /usuario/p/<código>/ o /usuario/reel/<código>/.
  const at = parts.findIndex((p) => KINDS.has(p.toLowerCase()));
  const code = at >= 0 ? parts[at + 1] : undefined;
  return code && /^[A-Za-z0-9_-]{5,}$/.test(code) ? code : null;
}

/**
 * Forma canónica del enlace (`https://www.instagram.com/p/<código>/`), sin parámetros de seguimiento ni
 * fragmento. Si no es un enlace de publicación de Instagram devuelve el texto tal cual (sin espacios).
 */
export function normalizeInstagramPermalink(link: string): string {
  const code = instagramShortcode(link);
  return code ? `https://www.instagram.com/p/${code}/` : link.trim();
}

/** ¿Los dos enlaces apuntan a la misma publicación? (por código corto; si no hay, por texto exacto). */
export function samePermalink(a: string, b: string): boolean {
  const ca = instagramShortcode(a);
  const cb = instagramShortcode(b);
  return ca && cb ? ca === cb : a.trim() === b.trim();
}
