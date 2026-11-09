import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { FILE_LIMITS } from '@ifts2/shared';
import { errors } from '../errors';
import type { StorageProvider } from './types';

export type AllowedMime = (typeof FILE_LIMITS.allowedMime)[number];

/** Detecta el tipo real por la firma del archivo (magic bytes); ignora lo que declare el cliente. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/**
 * Formatos de imagen que sharp puede leer aunque `sniffMime` no los reconozca por firma (GIF, TIFF,
 * AVIF/HEIC; los dos últimos dependen del build de sharp). Se aceptan porque siempre se reconvierten a
 * WebP. NO se acepta SVG (puede referenciar recursos externos) ni PDF.
 */
const SHARP_EXTRA_FORMATS: ReadonlySet<string> = new Set(['gif', 'tiff', 'heif', 'jp2']);

/** true si sharp abre el archivo y es uno de los formatos de imagen extra tolerados. */
export async function sharpCanReadImage(buf: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buf, { failOn: 'error' }).metadata();
    return !!meta.format && SHARP_EXTRA_FORMATS.has(meta.format);
  } catch {
    return false;
  }
}

/** ¿Parece una página web (HTML) en vez de una imagen? Pasa cuando se pega el enlace de la publicación. */
export function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head');
}

/** Nombre mostrable saneado (nunca se usa como clave de almacenamiento). */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo';
  const clean = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return clean || 'archivo';
}

export interface StoredFile {
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Valida (tipo por firma, tamaño), procesa (imágenes: máx. 1600 px, WebP) y guarda con clave aleatoria.
 * Errores: 415 tipo no permitido, 413 excede el límite.
 */
export async function storeUpload(
  storage: StorageProvider,
  file: { buffer: Buffer; originalName: string },
  prefix = 'files',
): Promise<StoredFile> {
  let mime: string | null = sniffMime(file.buffer);
  // Sin firma conocida: si es un formato de imagen que sharp lee (GIF, TIFF, AVIF, HEIC), se acepta y
  // se reconvierte a WebP como cualquier otra imagen.
  if (!mime && (await sharpCanReadImage(file.buffer))) mime = 'image/webp';
  if (!mime) {
    throw errors.unsupported('El archivo no es válido. Subí un PDF, JPG, PNG o WebP.');
  }
  const isPdf = mime === 'application/pdf';
  const limit = isPdf ? FILE_LIMITS.pdfMaxBytes : FILE_LIMITS.imageMaxBytes;
  if (file.buffer.length > limit) {
    throw errors.tooLarge(
      `El archivo pesa demasiado. El máximo para ${isPdf ? 'PDF es 10 MB' : 'imágenes es 5 MB'}.`,
    );
  }

  let body = file.buffer;
  let contentType: string = mime;
  let filename = sanitizeFilename(file.originalName);
  let ext = 'pdf';
  if (!isPdf) {
    try {
      body = await sharp(file.buffer)
        .rotate()
        .resize({
          width: FILE_LIMITS.imageMaxSidePx,
          height: FILE_LIMITS.imageMaxSidePx,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw errors.unsupported('No pudimos procesar la imagen. Probá con otro archivo.');
    }
    contentType = 'image/webp';
    ext = 'webp';
    filename = filename.replace(/\.[A-Za-z0-9]+$/, '') + '.webp';
  }

  const key = `${prefix}/${randomUUID()}.${ext}`;
  await storage.put({ key, body, contentType });
  return { key, filename, mimeType: contentType, sizeBytes: body.length };
}
