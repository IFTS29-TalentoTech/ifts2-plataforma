/**
 * Módulo `social` — moderación de publicaciones de Instagram (RF04, ADR-09, US-07 a US-10).
 * Rutas bajo /api/v1/social. Permisos: `social:moderate` (EDITOR y ADMIN) y `social:delete`.
 * Ver README.md de esta carpeta para el detalle de reglas y cómo probar.
 */
import { Router } from 'express';
import {
  idParam,
  socialApproveInput,
  socialListQuery,
  socialManualInput,
  socialSyncQuery,
  type SocialApproveInput,
  type SocialManualInput,
  type SocialStatus,
} from '@ifts2/shared';
import { safeEqual } from '../../infra/crypto';
import { errors } from '../../infra/errors';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { runSocialJob } from './jobs';
import {
  approvePost,
  createManualPost,
  deletePost,
  discardPost,
  listPosts,
  restorePost,
} from './social.service';
import { syncInstagram } from './sync.service';

export const mountPath = '/social';
export const router = Router();

/**
 * POST /social/cron — para un cron EXTERNO. Sin sesión: se autentica con el secreto `CRON_SECRET`
 * (encabezado `X-Cron-Secret` o `Authorization: Bearer <secreto>`). Si no hay secreto configurado el
 * endpoint está deshabilitado. Responde 200 con el detalle aunque Instagram falle (`ok: false`).
 */
router.post(
  '/cron',
  (req, res, next) => req.ctx.limiters.sync(req, res, next),
  async (req, res) => {
    const secret = req.ctx.config.social.cronSecret;
    if (!secret) {
      throw errors.forbidden(
        'La tarea programada está deshabilitada: falta configurar CRON_SECRET.',
      );
    }
    const header =
      req.get('x-cron-secret') ?? req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!header || !safeEqual(header, secret)) {
      throw errors.unauthorized('El secreto de la tarea programada no es válido.');
    }
    res.json(await runSocialJob(req.ctx, 'cron'));
  },
);

/**
 * POST /social/sync — botón "sincronizar" del Resumen. Devuelve cuántas publicaciones nuevas quedaron
 * pendientes. Es incremental (solo lo posterior al último fetch exitoso) salvo la primera vez, si cambió
 * la cuenta/hashtag/método de conexión o si se pide `?full=true` (carga completa, mismo permiso y rate limit).
 * La respuesta informa `mode` y `lastFetchAt`. 422 sin hashtag configurado; 502 (mensaje claro) si Instagram falla, sin afectar al resto.
 */
router.post(
  '/sync',
  requirePermission('social:moderate'),
  (req, res, next) => req.ctx.limiters.sync(req, res, next),
  validate({ query: socialSyncQuery }),
  async (req, res) => {
    const { full } = valid<{ full: boolean }>(req, 'query');
    res.json(
      await syncInstagram(req.ctx, { userId: req.auth!.user.id, trigger: 'manual', force: full }),
    );
  },
);

router.get(
  '/posts',
  requirePermission('social:moderate'),
  validate({ query: socialListQuery }),
  async (req, res) => {
    const q = valid<{
      status?: SocialStatus;
      source?: 'instagram' | 'manual';
      page: number;
      pageSize: number;
    }>(req, 'query');
    res.json(await listPosts(req.ctx, q));
  },
);

router.post(
  '/posts/:id/approve',
  requirePermission('social:moderate'),
  validate({ params: idParam, body: socialApproveInput }),
  async (req, res) => {
    const body = valid<SocialApproveInput>(req, 'body');
    const out = await approvePost(req.ctx, req.auth!.user.id, req.valid.params.id, body);
    res.status(201).json(out);
  },
);

router.post(
  '/posts/:id/discard',
  requirePermission('social:moderate'),
  validate({ params: idParam }),
  async (req, res) => {
    res.json(await discardPost(req.ctx, req.auth!.user.id, req.valid.params.id));
  },
);

router.post(
  '/posts/:id/restore',
  requirePermission('social:moderate'),
  validate({ params: idParam }),
  async (req, res) => {
    res.json(await restorePost(req.ctx, req.auth!.user.id, req.valid.params.id));
  },
);

router.post(
  '/manual',
  requirePermission('social:moderate'),
  validate({ body: socialManualInput }),
  async (req, res) => {
    const body = valid<SocialManualInput>(req, 'body');
    res.status(201).json(await createManualPost(req.ctx, req.auth!.user.id, body));
  },
);

router.delete(
  '/posts/:id',
  requirePermission('social:delete'),
  validate({ params: idParam }),
  async (req, res) => {
    await deletePost(req.ctx, req.auth!.user.id, req.valid.params.id);
    res.status(204).end();
  },
);
