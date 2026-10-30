/**
 * Utilidades compartidas por los módulos que trabajan con archivos adjuntos (notices, schedules,
 * exam-calls, documents y public). Un `Document` es el registro de un archivo subido; avisos,
 * horarios y llamados solo lo REFERENCIAN (RF03/RF06).
 *
 * Regla de seguridad: la clave de almacenamiento (`storageKey`) NUNCA sale en una respuesta;
 * quien descarga recibe una URL firmada de corta duración.
 */
import type { Document, Prisma } from '@prisma/client';
import type { DocumentRefDto, PublicFileDto } from '@ifts2/shared';
import { errors } from '../infra/errors';
import type { Db } from '../infra/prisma';
import type { StorageProvider } from '../infra/storage';

type DbLike = Db | Prisma.TransactionClient;

/** Campos mínimos de un documento adjunto para armar las respuestas. */
export const documentRefSelect = {
  id: true,
  title: true,
  filename: true,
  mimeType: true,
  sizeBytes: true,
  kind: true,
  status: true,
} satisfies Prisma.DocumentSelect;

export type DocumentRefRow = Pick<Document, keyof typeof documentRefSelect>;

export function toDocumentRef(d: DocumentRefRow | null | undefined): DocumentRefDto | null {
  if (!d) return null;
  return {
    id: d.id,
    title: d.title,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    kind: d.kind,
    status: d.status,
  };
}

/**
 * Valida que `documentId` exista y esté ACTIVO antes de adjuntarlo. Un documento archivado salió
 * de circulación (RF03): para usarlo hay que restaurarlo primero.
 * @param field nombre del campo para el error de validación (por ejemplo "attachmentId").
 */
export async function assertAttachableDocument(
  db: DbLike,
  documentId: string | null | undefined,
  field: string,
): Promise<void> {
  if (!documentId) return;
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { status: true },
  });
  if (!doc) {
    throw errors.unprocessable('El archivo elegido no existe.', {
      [field]: ['El archivo elegido no existe. Subilo primero en el Archivo.'],
    });
  }
  if (doc.status === 'ARCHIVED') {
    throw errors.unprocessable('El archivo elegido está archivado.', {
      [field]: ['El archivo elegido está archivado. Restauralo antes de adjuntarlo.'],
    });
  }
}

/**
 * Los enlaces públicos viven más que la caché de la respuesta (s-maxage + stale-while-revalidate),
 * por eso se firman con una vida de 30 minutos y no con el TTL corto por defecto.
 */
export const PUBLIC_LINK_TTL_SECONDS = 30 * 60;

/**
 * URL firmada de descarga o `null` si el almacenamiento falla: el sitio público tiene que seguir
 * funcionando aunque el almacenamiento esté caído (RNF03); el archivo simplemente no se ofrece.
 */
export async function safeSignedUrl(
  storage: StorageProvider,
  key: string,
  ttlSeconds = PUBLIC_LINK_TTL_SECONDS,
): Promise<string | null> {
  try {
    return await storage.getSignedUrl(key, ttlSeconds);
  } catch {
    return null;
  }
}

/** Archivo para el sitio público (con enlace de descarga firmado). */
export async function toPublicFile(
  storage: StorageProvider,
  d: Pick<Document, 'title' | 'filename' | 'mimeType' | 'sizeBytes' | 'storageKey'> | null,
): Promise<PublicFileDto | null> {
  if (!d) return null;
  return {
    title: d.title,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    downloadUrl: await safeSignedUrl(storage, d.storageKey),
  };
}
