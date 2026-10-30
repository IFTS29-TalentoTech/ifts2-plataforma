/**
 * Descarga segura de imágenes remotas (para copiar las de Instagram a nuestro almacenamiento, ADR-09).
 *
 * Por qué tantas precauciones: la dirección de la imagen puede venir de una carga MANUAL hecha por un
 * usuario del panel (`POST /social/manual`), así que la API no puede ser usada para pedir direcciones
 * internas (SSRF). Se exige http(s), se rechazan hosts locales/privados, se siguen pocas redirecciones
 * revalidando cada salto, y se corta la descarga al superar el tamaño máximo de imagen (ADR-08).
 * Limitación conocida: no se resuelve DNS (un dominio público que apunte a una IP privada pasaría);
 * mitigación recomendada en producción: salida de red restringida desde el hosting.
 */
import { FILE_LIMITS } from '@ifts2/shared';

export class MediaDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaDownloadError';
  }
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Lanza si la dirección no es http(s) público. Devuelve la URL parseada. */
export function assertPublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new MediaDownloadError('La dirección de la imagen no es válida.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new MediaDownloadError('La dirección de la imagen debe empezar con http:// o https://.');
  }
  const host = u.hostname.toLowerCase();
  const isIPv6 = host.startsWith('[');
  const blocked =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (!host.includes('.') && !isIPv6) ||
    isPrivateIPv4(host) ||
    (isIPv6 && /^\[(::1?|f[cd][0-9a-f]{2}:|fe80:|::ffff:)/.test(host));
  if (blocked) {
    throw new MediaDownloadError('La dirección de la imagen apunta a una red no permitida.');
  }
  return u;
}

/** Descarga el cuerpo con tope de bytes. */
async function readLimited(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new MediaDownloadError('La imagen pesa demasiado (máximo 5 MB).');
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new MediaDownloadError('La imagen pesa demasiado (máximo 5 MB).');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Descarga una imagen (sin interpretarla: el tipo real se verifica por firma al guardarla). */
export async function downloadImage(
  url: string,
  fetchFn: typeof fetch,
  maxBytes: number = FILE_LIMITS.imageMaxBytes,
): Promise<Buffer> {
  let current = assertPublicHttpUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetchFn(current.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new MediaDownloadError('No pudimos descargar la imagen (sin respuesta del servidor).');
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new MediaDownloadError('No pudimos descargar la imagen.');
      current = assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    if (!res.ok) {
      throw new MediaDownloadError(
        `No pudimos descargar la imagen (el servidor respondió ${res.status}). Si es de Instagram, la dirección pudo haber vencido.`,
      );
    }
    return readLimited(res, maxBytes);
  }
  throw new MediaDownloadError('La imagen redirige demasiadas veces.');
}
