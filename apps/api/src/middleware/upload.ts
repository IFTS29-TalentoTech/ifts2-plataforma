import multer from 'multer';
import { FILE_LIMITS } from '@ifts2/shared';

/**
 * Carga de un archivo en memoria (campo multipart `file` por defecto). El tamaño por tipo y la
 * firma del archivo se validan en `storeUpload` (infra/storage). Uso:
 *   router.post('/', requirePermission(...), uploadSingle(), handler)   // req.file
 */
export function uploadSingle(field = 'file') {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: FILE_LIMITS.pdfMaxBytes + 1024, files: 1 },
  }).single(field);
}
