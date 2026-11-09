/**
 * Renovación automática del token de larga duración de Instagram (ADR-09, RF04).
 *
 * Los tokens de larga duración duran ~60 días y solo se pueden renovar mientras NO hayan vencido (y
 * tengan más de 24 h). Por eso se renuevan a los ~50 días de vida, es decir cuando faltan
 * `REFRESH_WHEN_DAYS_LEFT` días. Quién lo dispara:
 *  - cada sincronización (manual o diaria), antes de leer las publicaciones;
 *  - el cron externo / planificador interno (`POST /social/cron`).
 * Si la renovación falla NO se rompe nada más: se guarda el motivo (`lastError`) para que el Resumen lo
 * muestre y el cliente pueda reconectar la cuenta desde Configuración.
 *
 * El token vive cifrado en `IntegrationConfig` (ADR-20). La fila única de `InstagramToken` guarda solo el
 * estado de sincronización y el vencimiento (el token en claro nunca se duplica ahí).
 */
import { DAY_MS } from '@ifts2/shared';
import type { AppContext } from '../../context';
import {
  detectTokenFlavor,
  InstagramApiError,
  refreshFacebookToken,
  refreshLongLivedToken,
  TOKEN_INVALID_MESSAGE,
} from '../../infra/instagram';
import { audit } from '../audit/audit.service';

/** Se renueva cuando faltan 10 días o menos para el vencimiento (token de 60 días => ~50 días de vida). */
export const REFRESH_WHEN_DAYS_LEFT = 10;

export type TokenRenewal =
  | {
      status: 'skipped';
      reason: 'not-real-mode' | 'no-token' | 'not-needed' | 'needs-app-credentials';
    }
  | { status: 'renewed'; expiresAt: Date }
  | { status: 'expired'; error: string }
  | { status: 'failed'; error: string };

/** ¿Corresponde renovar? Función pura, probada por separado. */
export function shouldRefresh(
  expiresAt: Date | null,
  now: Date,
  daysLeft = REFRESH_WHEN_DAYS_LEFT,
) {
  if (!expiresAt) return true; // vencimiento desconocido (token pegado a mano): intentar y registrar el nuevo
  return expiresAt.getTime() - now.getTime() <= daysLeft * DAY_MS;
}

/** Guarda en la fila única `InstagramToken` el vencimiento y/o el resultado de la última sincronización. */
export async function saveTokenState(
  ctx: AppContext,
  patch: { expiresAt?: Date; refreshed?: boolean; lastSyncAt?: Date; lastSyncOk?: boolean },
) {
  const data = {
    ...(patch.expiresAt ? { expiresAt: patch.expiresAt } : {}),
    ...(patch.refreshed ? { refreshedAt: new Date() } : {}),
    ...(patch.lastSyncAt ? { lastSyncAt: patch.lastSyncAt } : {}),
    ...(patch.lastSyncOk !== undefined ? { lastSyncOk: patch.lastSyncOk } : {}),
  };
  await ctx.prisma.instagramToken.upsert({
    where: { id: 1 },
    // `tokenEnc` y `expiresAt` son obligatorios en el esquema: tokenEnc queda vacío a propósito (ver cabecera).
    create: { id: 1, tokenEnc: '', expiresAt: patch.expiresAt ?? new Date(), ...data },
    update: data,
  });
}

/**
 * Renueva el token si hace falta (o si `force`). Nunca lanza por fallas de Instagram: devuelve el resultado.
 */
export async function renewInstagramTokenIfNeeded(
  ctx: AppContext,
  opts: { now?: Date; force?: boolean } = {},
): Promise<TokenRenewal> {
  const now = opts.now ?? new Date();
  const stored = await ctx.integrations.get('instagram');
  if (!stored || stored.mode !== 'real') return { status: 'skipped', reason: 'not-real-mode' };
  if (!stored.accessToken) return { status: 'skipped', reason: 'no-token' };

  const expiresAt = stored.tokenExpiresAt ? new Date(stored.tokenExpiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    // Ya venció: Instagram no permite renovar, hay que reconectar la cuenta.
    await ctx.integrations.patch('instagram', { lastError: TOKEN_INVALID_MESSAGE });
    return { status: 'expired', error: TOKEN_INVALID_MESSAGE };
  }
  if (!opts.force && !shouldRefresh(expiresAt, now)) {
    return { status: 'skipped', reason: 'not-needed' };
  }

  // Token de Facebook Login (EAA…, ADR-045): se renueva con `fb_exchange_token`, que exige el App ID y el App
  // Secret. Sin ellos (token pegado a mano) no se puede renovar solo: hay que generar otro antes de que venza.
  const facebook = detectTokenFlavor(stored.accessToken) === 'facebook';
  if (facebook && (!stored.appId || !stored.appSecret)) {
    return { status: 'skipped', reason: 'needs-app-credentials' };
  }
  try {
    const grant = facebook
      ? await refreshFacebookToken(
          { appId: stored.appId!, appSecret: stored.appSecret!, accessToken: stored.accessToken },
          ctx.fetch,
          () => now.getTime(),
        )
      : await refreshLongLivedToken(stored.accessToken, ctx.fetch, () => now.getTime());
    await ctx.integrations.patch('instagram', {
      accessToken: grant.accessToken,
      tokenExpiresAt: grant.expiresAt.toISOString(),
      lastError: null,
    });
    await saveTokenState(ctx, { expiresAt: grant.expiresAt, refreshed: true });
    // Auditoría del sistema (sin usuario). Sin el token: solo el nuevo vencimiento.
    await audit.log(ctx.prisma, {
      action: 'integration.instagram.token-refresh',
      entity: 'IntegrationConfig',
      entityId: 'instagram',
      detail: { expiresAt: grant.expiresAt.toISOString() },
    });
    return { status: 'renewed', expiresAt: grant.expiresAt };
  } catch (e) {
    const message =
      e instanceof InstagramApiError ? e.message : 'No pudimos renovar el acceso a Instagram.';
    ctx.logger.warn({ message }, 'falló la renovación del token de Instagram');
    // Con vencimiento desconocido el token puede seguir sirviendo (p. ej. tiene menos de 24 h): no se
    // marca error; la sincronización lo dirá si realmente no funciona.
    if (expiresAt) await ctx.integrations.patch('instagram', { lastError: message });
    return { status: 'failed', error: message };
  }
}
