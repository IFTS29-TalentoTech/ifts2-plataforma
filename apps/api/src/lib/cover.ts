/**
 * Portadas de publicaciones.
 *
 * `Publication.coverUrl` guarda UNA de dos cosas:
 *  - una dirección absoluta http(s) (publicación manual con imagen externa), o
 *  - una CLAVE de nuestro almacenamiento (p. ej. `social/<uuid>.webp`), que es lo que se guarda al
 *    aprobar una publicación de Instagram (las URLs de Instagram expiran, por eso se copia la imagen).
 * Las URL firmadas del almacenamiento vencen, así que NO se guardan: se generan al responder.
 * El módulo público (`/public/*`) debe resolverlas igual con `resolveCoverSrc`.
 */
import type { StorageProvider } from '../infra/storage';

export function isStorageKey(coverUrl: string | null | undefined): coverUrl is string {
  return !!coverUrl && !/^https?:\/\//i.test(coverUrl);
}

/** URL lista para usar en un `<img>`: la misma si es absoluta, o una URL firmada si es una clave. */
export async function resolveCoverSrc(
  storage: StorageProvider,
  coverUrl: string | null | undefined,
): Promise<string | null> {
  if (!coverUrl) return null;
  if (!isStorageKey(coverUrl)) return coverUrl;
  try {
    return await storage.getSignedUrl(coverUrl);
  } catch {
    return null; // el almacenamiento no responde: el panel sigue funcionando sin la imagen
  }
}
