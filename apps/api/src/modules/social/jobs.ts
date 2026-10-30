/**
 * Tarea diaria de redes (ADR-09: "sincronización manual y diaria"): renovar el token y sincronizar.
 *
 * Se puede disparar de dos maneras, ambas OPCIONALES e independientes del sitio público (la vigencia
 * se calcula al consultar, así que si esta tarea no corre NO se rompe nada):
 *  1. Un cron EXTERNO (GitHub Actions, cron-job.org, el programador del hosting) que llame a
 *     `POST /api/v1/social/cron` con el secreto `CRON_SECRET`. Recomendado en hosting gratuito, donde
 *     el proceso puede "dormirse" y un temporizador interno no correría.
 *  2. Un planificador INTERNO (`SOCIAL_SCHEDULER_ENABLED=true`), útil con un servidor siempre encendido.
 * Nada de esto elimina contenido: solo trae publicaciones nuevas como pendientes y renueva el acceso.
 */
import type { AppContext } from '../../context';
import { AppError } from '../../infra/errors';
import { audit } from '../audit/audit.service';
import { getConfiguredHashtag, syncInstagram, type SyncResult } from './sync.service';
import { renewInstagramTokenIfNeeded, type TokenRenewal } from './token.service';

export interface JobResult {
  ranAt: string;
  /** `false` si algo falló (renovación o sincronización). El cron devuelve 200 igual: el detalle va acá. */
  ok: boolean;
  token: TokenRenewal;
  sync:
    | ({ status: 'done' } & Omit<SyncResult, 'token'>)
    | { status: 'skipped'; reason: 'demo' | 'no-hashtag' }
    | { status: 'failed'; code: string; error: string };
}

/** Renueva el token si corresponde y sincroniza. Nunca lanza por fallas de Instagram. */
export async function runSocialJob(
  ctx: AppContext,
  trigger: 'cron' | 'scheduler',
): Promise<JobResult> {
  const ranAt = new Date().toISOString();
  const token = await renewInstagramTokenIfNeeded(ctx);
  const tokenOk = token.status !== 'failed' && token.status !== 'expired';

  const client = await ctx.getInstagramClient();
  let result: JobResult['sync'];
  if (client.kind === 'fake') {
    result = { status: 'skipped', reason: 'demo' }; // en demostración no hay nada real que traer
  } else if (!(await getConfiguredHashtag(ctx))) {
    result = { status: 'skipped', reason: 'no-hashtag' };
  } else {
    try {
      const { token: _ignored, ...rest } = await syncInstagram(ctx, { trigger });
      void _ignored;
      result = { status: 'done', ...rest };
    } catch (e) {
      const err = e instanceof AppError ? e : null;
      result = {
        status: 'failed',
        code: err?.code ?? 'internal',
        error: err?.detail ?? 'Falló la sincronización.',
      };
      if (!err) ctx.logger.error({ err: (e as Error).message }, 'falló la tarea diaria de redes');
    }
  }
  await audit.log(ctx.prisma, {
    action: 'social.job',
    entity: 'SocialPost',
    detail: { trigger, token: token.status, sync: result.status },
  });
  return { ranAt, ok: tokenOk && result.status !== 'failed', token, sync: result };
}

/**
 * Planificador interno opcional. Devuelve una función para detenerlo. Corre una vez poco después de
 * arrancar y luego cada `SOCIAL_SYNC_INTERVAL_HOURS`; no se superpone consigo mismo y sus errores solo se registran.
 */
export function startSocialScheduler(ctx: AppContext): () => void {
  const everyMs = ctx.config.social.syncIntervalHours * 3_600_000;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSocialJob(ctx, 'scheduler');
    } catch (e) {
      ctx.logger.error({ err: (e as Error).message }, 'falló el planificador de redes');
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void tick(), 2 * 60_000);
  const timer = setInterval(() => void tick(), everyMs);
  first.unref();
  timer.unref();
  ctx.logger.info(
    { everyHours: ctx.config.social.syncIntervalHours },
    'planificador de redes activo',
  );
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
