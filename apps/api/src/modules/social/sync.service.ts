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
 *  - Incremental (ADR-038): cada fetch exitoso guarda una marca y la siguiente sincronización pide solo lo
 *    posterior (con margen de solapamiento). Es completa la primera vez, al forzarla (`force`) y cuando
 *    cambia la cuenta (id de Graph), el hashtag o el método de conexión. Un fetch fallido NO avanza la marca.
 *    Las reglas puras están en `sync-window.ts`.
 *  - Si Instagram falla, se responde 502 con un mensaje claro, se registra el motivo para el Resumen
 *    y no se rompe nada más: el panel y el sitio siguen funcionando y existe la carga manual.
 */
import type { AppContext } from '../../context';
import { errors } from '../../infra/errors';
import {
  captionHasHashtag,
  InstagramApiError,
  InstagramNotConfiguredError,
  normalizeHashtag,
  type FetchCoverage,
  type InstagramMedia,
} from '../../infra/instagram';
import { audit } from '../audit/audit.service';
import { nextCoveredUntil, planSync, type FullReason, type SyncIdentity } from './sync-window';
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
  /** Tipo de esta sincronización: `incremental` (solo lo posterior al último fetch exitoso) o `full`. */
  mode: 'incremental' | 'full';
  /** Por qué fue completa (primera vez, forzada, cambió la cuenta/hashtag/método); `null` si fue incremental. */
  fullReason: FullReason | null;
  /** Cota inferior pedida a Instagram (ISO); `null` en la carga completa. */
  since: string | null;
  /** Momento (ISO) en que terminó este fetch exitoso. */
  lastFetchAt: string;
  /** Resultado de la renovación del token hecha antes de sincronizar (para el cron). */
  token: TokenRenewal;
  /** Partes opcionales que fallaron sin impedir la sincronización (p. ej. la búsqueda pública del hashtag). */
  warnings: string[];
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
  opts: {
    userId?: string | null;
    trigger: 'manual' | 'cron' | 'scheduler';
    /** Fuerza la carga completa aunque haya una marca de fetch anterior. */
    force?: boolean;
  },
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

  const previous = await ctx.integrations.get('instagram_sync');
  const stored = await ctx.integrations.get('instagram');
  // Las pendientes recientes se vuelven a traer para refrescar su imagen (las URLs de Instagram vencen).
  const oldestPending = await ctx.prisma.socialPost.findFirst({
    where: { platform: 'INSTAGRAM', status: 'DETECTED' },
    orderBy: { postedAt: 'asc' },
    select: { postedAt: true },
  });

  let media: InstagramMedia[];
  let plan: ReturnType<typeof planSync>;
  let coverage = null as FetchCoverage | null;
  const warnings: string[] = [];
  let identity: SyncIdentity;
  const startedAt = new Date(); // la marca nueva es el inicio del fetch: lo publicado durante él se verá después
  try {
    // Llamada liviana (`/me?fields=id`): si cambió la cuenta, lo guardado no sirve y se carga todo.
    // Es una comprobación auxiliar: si falla por algo que NO es el token (permiso, parámetro, límite, caída
    // temporal) no debe impedir la sincronización; se hace completa y el motivo queda en el registro. El token
    // inválido y la falta de configuración sí cortan (la lectura de publicaciones fallaría igual).
    let accountId = '';
    try {
      accountId = await client.getAccountId();
    } catch (e) {
      if (!(e instanceof InstagramApiError) || e.tokenInvalid) throw e;
      ctx.logger.warn(
        { detail: e.detail ?? e.message },
        'no se pudo consultar la cuenta de Instagram; la sincronización será completa',
      );
    }
    identity = {
      accountId,
      hashtag: normalizeHashtag(hashtag) ?? hashtag.toLowerCase(),
      connection: client.kind === 'fake' ? 'demo' : (stored?.connectionMethod ?? 'oauth'),
    };
    plan = planSync({
      state: previous,
      identity,
      force: opts.force,
      oldestPending: oldestPending?.postedAt ?? null,
      now: startedAt,
    });
    media = await client.fetchRecentMedia({
      limit: SYNC_LIMIT,
      hashtag,
      ...(plan.since ? { since: plan.since.toISOString() } : {}),
      onCoverage: (c) => {
        coverage = c;
      },
      onWarning: (w) => warnings.push(w),
    });
  } catch (e) {
    if (e instanceof InstagramNotConfiguredError) {
      // No es una caída de Instagram: falta configurar. No se marca como error de sincronización.
      throw errors.unprocessable(e.message);
    }
    const message =
      e instanceof InstagramApiError
        ? e.message
        : 'No pudimos sincronizar con Instagram. Intentá de nuevo en unos minutos.';
    // Motivo técnico de Meta (código y mensaje, sin el token) para que el equipo pueda diagnosticar desde el panel.
    const detail = e instanceof InstagramApiError ? e.detail : undefined;
    const full = detail ? `${message} Detalle para el equipo: ${detail}.` : message;
    ctx.logger.warn(
      {
        message,
        detail,
        tokenInvalid: e instanceof InstagramApiError && e.tokenInvalid,
        trigger: opts.trigger,
      },
      'falló la sincronización con Instagram',
    );
    await recordOutcome(ctx, false, full);
    await audit.log(ctx.prisma, {
      userId: opts.userId ?? null,
      action: 'social.sync.failed',
      entity: 'SocialPost',
      detail: { trigger: opts.trigger, error: message, ...(detail ? { meta: detail } : {}) },
    });
    throw errors.badGateway(`${full} Podés seguir usando el panel y cargar publicaciones a mano.`);
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
  // Recién ahora, con las publicaciones ya guardadas, se avanza la marca (un fallo antes no la mueve).
  const lastFetchAt = new Date();
  try {
    await ctx.integrations.set('instagram_sync', {
      lastFetchAt: lastFetchAt.toISOString(),
      coveredUntil: nextCoveredUntil({
        mode: plan.mode,
        startedAt,
        coverage,
        previous: previous ? new Date(previous.coveredUntil) : null,
      }).toISOString(),
      mode: plan.mode,
      count: matching.length,
      ...identity,
    });
  } catch (e) {
    // Sin marca la próxima será completa: más pesada pero correcta. No se hace fallar la sincronización.
    ctx.logger.warn({ err: (e as Error).message }, 'no se pudo guardar la marca de sincronización');
  }
  await audit.log(ctx.prisma, {
    userId: opts.userId ?? null,
    action: 'social.sync',
    entity: 'SocialPost',
    detail: {
      trigger: opts.trigger,
      matched: matching.length,
      created: inserted.count,
      demo: client.kind === 'fake',
      mode: plan.mode,
      ...(plan.fullReason ? { fullReason: plan.fullReason } : {}),
      ...(warnings.length ? { warnings } : {}),
    },
  });

  return {
    created: inserted.count,
    matched: matching.length,
    alreadyKnown: matching.length - fresh.length,
    demo: client.kind === 'fake',
    lastSyncAt: lastFetchAt.toISOString(),
    mode: plan.mode,
    fullReason: plan.fullReason,
    since: plan.since ? plan.since.toISOString() : null,
    lastFetchAt: lastFetchAt.toISOString(),
    token,
    warnings,
  };
}
