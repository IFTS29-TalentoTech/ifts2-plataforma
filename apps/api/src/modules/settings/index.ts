/**
 * Módulo `settings` — Configuración del sitio (RF01, ADR-022 "producto genérico").
 * Nombre, sigla, pie, contactos, redes, hashtag y "inscripciones a mesas habilitadas" viven en
 * `SiteSetting` (clave/valor) y se editan acá; la web pública los lee de `GET /public/settings`.
 *
 * - GET: cualquier rol del panel (la cabecera y varias pantallas necesitan los datos básicos).
 * - PUT: solo ADMIN (`settings:manage`). Es una actualización PARCIAL: solo cambian las claves enviadas.
 */
import { Router, type Request } from 'express';
import {
  SETTING_IMAGE_KEYS,
  settingsUpdateInput,
  type SettingImageKey,
  type SettingsUpdateInput,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { storeUpload } from '../../infra/storage';
import { isStorageKey } from '../../lib/cover';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { valid, validate } from '../../middleware/validate';
import {
  readRawSettings,
  resolveSettingImages,
  serializeSetting,
  toSettingsDto,
} from '../../lib/settings';
import { audit } from '../audit/audit.service';

export const mountPath = '/settings';
export const router = Router();

/** GET /settings -> objeto plano con TODAS las claves (`null` si no tienen valor). */
router.get('/', requireAuth(), async (req, res) => {
  const raw = await readRawSettings(req.ctx.prisma);
  res.json(toSettingsDto(await resolveSettingImages(req.ctx.storage, raw)));
});

/** PUT /settings — `{ phone?, address?, instagram_hashtag?, exam_enrollment_open?, ... }` -> ajustes completos. */
router.put(
  '/',
  requirePermission('settings:manage'),
  validate({ body: settingsUpdateInput }),
  async (req, res) => {
    const body = valid<SettingsUpdateInput>(req, 'body');
    const { prisma } = req.ctx;
    const entries = Object.entries(body).filter(([, v]) => v !== undefined) as [
      string,
      string | boolean,
    ][];
    const raw = await prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        const v = serializeSetting(value);
        await tx.siteSetting.upsert({
          where: { key },
          create: { key, value: v },
          update: { value: v },
        });
      }
      // Detalle: solo los NOMBRES de las claves cambiadas (los valores son datos institucionales
      // públicos, pero no hace falta duplicarlos en la auditoría).
      await audit.fromReq(
        req,
        {
          action: 'settings.update',
          entity: 'SiteSetting',
          detail: { keys: entries.map(([k]) => k) },
        },
        tx,
      );
      return readRawSettings(tx);
    });
    res.json(toSettingsDto(await resolveSettingImages(req.ctx.storage, raw)));
  },
);

const imageKeyParam = z.object({ key: z.enum(SETTING_IMAGE_KEYS) });

/**
 * Guarda el valor de una imagen y, si el anterior era un archivo nuestro, lo borra del almacenamiento
 * recién después de confirmar el cambio. Las rutas propias (/img/...) y las https no se tocan.
 */
async function setImage(
  req: Request,
  key: SettingImageKey,
  value: string,
  action: 'settings.image' | 'settings.image.remove',
) {
  const { prisma, storage } = req.ctx;
  const previous = await prisma.$transaction(async (tx) => {
    const current = await tx.siteSetting.findUnique({ where: { key } });
    await tx.siteSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await audit.fromReq(req, { action, entity: 'SiteSetting', detail: { key } }, tx);
    return current?.value;
  });
  if (isStorageKey(previous) && previous !== value) {
    await storage.remove(previous).catch((e) => {
      // Un archivo huérfano no justifica fallar la operación (ya confirmada); queda registrado.
      req.ctx.logger.warn(
        { err: String(e), key: previous },
        'no se pudo borrar la imagen anterior',
      );
    });
  }
}

/** POST /settings/image/:key (multipart `file`) — sube y reemplaza una imagen del sitio. */
router.post(
  '/image/:key',
  requirePermission('settings:manage'),
  validate({ params: imageKeyParam }),
  uploadSingle(),
  async (req, res) => {
    const { key } = valid<z.infer<typeof imageKeyParam>>(req, 'params');
    if (!req.file) {
      throw errors.validation('Elegí una imagen para subir.', { file: ['Falta la imagen.'] });
    }
    const stored = await storeUpload(
      req.ctx.storage,
      { buffer: req.file.buffer, originalName: req.file.originalname },
      'site',
    );
    if (stored.mimeType === 'application/pdf') {
      await req.ctx.storage.remove(stored.key).catch(() => undefined);
      throw errors.unsupported('Subí una imagen (JPG, PNG o WebP).');
    }
    try {
      await setImage(req, key, stored.key, 'settings.image');
    } catch (e) {
      await req.ctx.storage.remove(stored.key).catch(() => undefined); // no quedó referenciada
      throw e;
    }
    res.json(
      toSettingsDto(
        await resolveSettingImages(req.ctx.storage, await readRawSettings(req.ctx.prisma)),
      ),
    );
  },
);

/** DELETE /settings/image/:key — quita la imagen (el sitio vuelve a su respaldo). Manual y auditado. */
router.delete(
  '/image/:key',
  requirePermission('settings:manage'),
  validate({ params: imageKeyParam }),
  async (req, res) => {
    const { key } = valid<z.infer<typeof imageKeyParam>>(req, 'params');
    await setImage(req, key, '', 'settings.image.remove');
    res.json(
      toSettingsDto(
        await resolveSettingImages(req.ctx.storage, await readRawSettings(req.ctx.prisma)),
      ),
    );
  },
);
