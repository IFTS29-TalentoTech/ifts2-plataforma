import { Router } from 'express';
import { errors } from '../../infra/errors';
import { LocalDiskStorage } from '../../infra/storage';

export const mountPath = '/files';
export const router = Router();

/**
 * GET /files/<clave>?exp=&sig=  Sirve archivos del almacenamiento LOCAL con URL firmada de corta
 * duración. Con STORAGE_PROVIDER=s3 las URLs firmadas las emite el propio proveedor y esta ruta responde 404.
 */
router.get('/*key', async (req, res) => {
  const storage = req.ctx.storage;
  if (!(storage instanceof LocalDiskStorage)) throw errors.notFound();
  const parts = req.params.key as unknown as string[];
  const key = Array.isArray(parts) ? parts.join('/') : String(parts);
  const exp = Number(req.query.exp);
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
  if (!storage.verify(key, exp, sig)) throw errors.forbidden('El enlace al archivo venció o no es válido.');
  const file = await storage.get(key);
  if (!file) throw errors.notFound('No encontramos el archivo.');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.type(file.contentType).send(file.body);
});
