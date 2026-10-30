/**
 * Sincronización de publicaciones de Instagram (RF04, ADR-09, US-07).
 *
 * Reglas de negocio que implementa:
 *  - Solo se importan las publicaciones cuya leyenda contiene el hashtag configurado
 *    (`SiteSetting.instagram_hashtag`). Sin hashtag no se sincroniza: error de negocio claro (422).
 *  - Idempotente por `externalId`: sincronizar dos veces NO duplica. Las ya existentes no cambian de
 *    estado (una descartada sigue descartada; una vinculada sigue vinculada). Solo a las todavía
 *    `DETECTED` se les refresca la URL de la imagen porque las de Instagram expiran.
 *  - Todo queda `DETECTED`: NADA llega al sitio sin aprobación humana (AGENTS.md, regla 4).
 *  - Si Instagram falla, se responde 502 con un mensaje claro, se registra el motivo para el Resumen
 *    y no se rompe nada más: el panel y el sitio siguen funcionando y existe la carga manual.
 */
import type { AppContext } from '../../context';
import { errors } from '../../infra/errors';
import {
  captionHasHashtag,
  InstagramApiError,
  InstagramNotConfiguredError,
  type InstagramMedia,
} from '../../infra/instagram';
import { audit } from '../audit/audit.service';
import { renewInstagramTokenIfNeeded, saveTokenState, type TokenRenewal } from './token.service';

/** Cuántas publicaciones (que cumplan el hashtag) se traen como máximo por sincronización. */
export const SYNC_LIMIT = 50;

export interface SyncResult {
  /** Cuántas publicaciones nuevas quedaron pendientes de moderar. */
  created: number;
  /** Cuántas publicaciones con el hashtag trajo Instagram (nuevas + ya conocidas). */
  matched: number;
  /** Ya conocidas (no se duplican). */
  alreadyKnown: number;
  /** `true` si se usó el cliente de demostración (sin cuenta real conectada). */
  demo: boolean;
  lastSyncAt: string;
  /** Resultado de la renovación del token hecha antes de sincronizar (para el cron). */
  token: TokenRenewal;
}

/** Hashtag configurado (con `#`) o `null` si falta. */
export async function getConfiguredHashtag(ctx: AppContext): Promise<string | null> {
  const row = await ctx.prisma.siteSetting.findUnique({ where: { key: 'instagram_hashtag' } });
  const v = row?.value?.trim();
  return v ? v : null;
}

/** Registra el resultado en el estado que lee el Resumen (InstagramToken + último error). */
async function recordOutcome(ctx: AppContext, ok: boolean, error?: string) {
  const stored = await ctx.integrations.get('instagram');
  if (stored && stored.mode === 'real') {
    await ctx.integrations.patch('instagram', {
      lastError: ok ? null : (error ?? 'Error desconocido'),
    });
  }
  await saveTokenState(ctx, { lastSyncAt: new Date(), lastSyncOk: ok });
}

/**
 * Trae las publicaciones recientes con el hashtag y las guarda como DETECTED. Lanza `AppError`
 * (422 sin hashtag/sin configurar, 502 si falla Instagram); el router las traduce a Problem Details.
 */
export async function syncInstagram(
  ctx: AppContext,
  opts: { userId?: string | null; trigger: 'manual' | 'cron' | 'scheduler' },
): Promise<SyncResult> {
  const hashtag = await getConfiguredHashtag(ctx);
  if (!hashtag) {
    throw errors.unprocessable(
      'Todavía no hay un hashtag configurado para importar publicaciones. Cargalo en Configuración y volvé a sincronizar.',
      { hashtag: ['Falta definir el hashtag de Instagram.'] },
    );
  }

  // 1) Renovar el token si hace falta (best effort: si falla, igual se intenta leer con el actual).
  const token = await renewInstagramTokenIfNeeded(ctx);
  // 2) Resolver el cliente DESPUÉS de renovar para usar el token nuevo.
  const client = await ctx.getInstagramClient();

  let media: InstagramMedia[];
  try {
    media = await client.fetchRecentMedia({ limit: SYNC_LIMIT, hashtag });
  } catch (e) {
    if (e instanceof InstagramNotConfiguredError) {
      // No es una caída de Instagram: falta configurar. No se marca como error de sincronización.
      throw errors.unprocessable(e.message);
    }
    const message =
      e instanceof InstagramApiError
        ? e.message
        : 'No pudimos sincronizar con Instagram. Intentá de nuevo en unos minutos.';
    ctx.logger.warn({ message, trigger: opts.trigger }, 'falló la sincronización con Instagram');
    await recordOutcome(ctx, false, message);
    await audit.log(ctx.prisma, {
      userId: opts.userId ?? null,
      action: 'social.sync.failed',
      entity: 'SocialPost',
      detail: { trigger: opts.trigger, error: message },
    });
    throw errors.badGateway(
      `${message} Podés seguir usando el panel y cargar publicaciones a mano.`,
    );
  }

  // Defensa en profundidad: el cliente ya filtra, pero el servicio no confía en que lo haga.
  const matching = media.filter((m) => captionHasHashtag(m.caption, hashtag));
  const ids = matching.map((m) => m.id);
  const existing = await ctx.prisma.socialPost.findMany({
    where: { externalId: { in: ids } },
    select: { externalId: true, status: true, mediaUrl: true },
  });
  const known = new Map(existing.map((p) => [p.externalId, p]));

  const fresh = matching.filter((m) => !known.has(m.id));
  // skipDuplicates: si otra sincronización en paralelo insertó la misma, no falla ni duplica.
  const inserted = fresh.length
    ? await ctx.prisma.socialPost.createMany({
        data: fresh.map((m) => ({
          platform: 'INSTAGRAM',
          externalId: m.id,
          permalink: m.permalink,
          caption: m.caption,
          mediaUrl: m.mediaUrl,
          postedAt: new Date(m.timestamp),
        })),
        skipDuplicates: true,
      })
    : { count: 0 };

  // Refresca la imagen de las que siguen pendientes (la URL anterior pudo haber expirado).
  for (const m of matching) {
    const prev = known.get(m.id);
    if (prev && prev.status === 'DETECTED' && m.mediaUrl && prev.mediaUrl !== m.mediaUrl) {
      await ctx.prisma.socialPost.updateMany({
        where: { externalId: m.id, status: 'DETECTED' },
        data: { mediaUrl: m.mediaUrl },
      });
    }
  }

  await recordOutcome(ctx, true);
  await audit.log(ctx.prisma, {
    userId: opts.userId ?? null,
    action: 'social.sync',
    entity: 'SocialPost',
    detail: {
      trigger: opts.trigger,
      matched: matching.length,
      created: inserted.count,
      demo: client.kind === 'fake',
    },
  });

  return {
    created: inserted.count,
    matched: matching.length,
    alreadyKnown: matching.length - fresh.length,
    demo: client.kind === 'fake',
    lastSyncAt: new Date().toISOString(),
    token,
  };
}
