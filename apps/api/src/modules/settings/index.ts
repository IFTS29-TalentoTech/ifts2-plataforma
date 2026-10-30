/**
 * Módulo `settings` — Configuración del sitio (RF01, ADR-022 "producto genérico").
 * Nombre, sigla, pie, contactos, redes, hashtag y "inscripciones a mesas habilitadas" viven en
 * `SiteSetting` (clave/valor) y se editan acá; la web pública los lee de `GET /public/settings`.
 *
 * - GET: cualquier rol del panel (la cabecera y varias pantallas necesitan los datos básicos).
 * - PUT: solo ADMIN (`settings:manage`). Es una actualización PARCIAL: solo cambian las claves enviadas.
 */
import { Router } from 'express';
import { settingsUpdateInput, type SettingsUpdateInput } from '@ifts2/shared';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { readRawSettings, serializeSetting, toSettingsDto } from '../../lib/settings';
import { audit } from '../audit/audit.service';

export const mountPath = '/settings';
export const router = Router();

/** GET /settings -> objeto plano con TODAS las claves (`null` si no tienen valor). */
router.get('/', requireAuth(), async (req, res) => {
  res.json(toSettingsDto(await readRawSettings(req.ctx.prisma)));
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
    res.json(toSettingsDto(raw));
  },
);
