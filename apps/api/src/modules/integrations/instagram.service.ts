import { INSTAGRAM_REQUIRED_SCOPES, INSTAGRAM_SETUP_GUIDE } from '@ifts2/shared';
import type { AppContext } from '../../context';
import { hmac, maskSecret, randomToken, safeEqual } from '../../infra/crypto';

/** Estados de la integración de Instagram que distingue la pantalla de Configuración. */
export type InstagramStatus = 'demo' | 'credentials_saved' | 'connected' | 'expiring' | 'error';

export const STATUS_LABELS: Record<InstagramStatus, string> = {
  demo: 'Sin configurar (modo demostración)',
  credentials_saved: 'Credenciales guardadas, falta conectar la cuenta',
  connected: 'Conectada',
  expiring: 'El token está por vencer: reconectá la cuenta',
  error: 'Error de conexión',
};

const EXPIRING_DAYS = 10;

export async function instagramView(ctx: AppContext) {
  const { config, integrations, prisma } = ctx;
  const stored = await integrations.get('instagram');
  const tokenRow = await prisma.instagramToken.findUnique({ where: { id: 1 } });
  const hashtagRow = await prisma.siteSetting.findUnique({ where: { key: 'instagram_hashtag' } });

  const env = config.instagram;
  const envReal = env.provider === 'graph' && !!env.appId && !!env.appSecret;
  const mode = stored ? stored.mode : envReal ? 'real' : 'demo';
  /** `token`: se conectó pegando un token (sin App ID ni Secret). Las configuraciones viejas son `oauth`. */
  const method = stored?.connectionMethod ?? 'oauth';
  const appId = stored?.appId ?? (stored ? undefined : env.appId);
  const hasSecret = !!(stored?.appSecret ?? (stored ? undefined : env.appSecret));
  const hasToken = !!stored?.accessToken;
  const expiresAt = stored?.tokenExpiresAt ? new Date(stored.tokenExpiresAt) : null;
  const now = Date.now();

  let status: InstagramStatus;
  const incomplete = method === 'token' ? !hasToken : !appId || !hasSecret;
  if (mode === 'demo' || incomplete) status = 'demo';
  else if (stored?.lastError || (hasToken && expiresAt && expiresAt.getTime() <= now))
    status = 'error';
  else if (!hasToken) status = 'credentials_saved';
  else if (expiresAt && expiresAt.getTime() - now < EXPIRING_DAYS * 86_400_000) status = 'expiring';
  else status = 'connected';

  const lastError =
    stored?.lastError ??
    (expiresAt && expiresAt.getTime() <= now
      ? 'El token de acceso venció. Volvé a conectar la cuenta.'
      : null);

  return {
    status,
    statusLabel: STATUS_LABELS[status],
    /** true => el panel muestra el aviso "modo demostración". */
    demoMode: status === 'demo',
    mode,
    connectionMethod: method,
    source: stored ? 'panel' : envReal ? 'env' : 'none',
    appIdMasked: maskSecret(appId),
    appSecretMasked: hasSecret ? '••••••••' : null,
    hasAccessToken: hasToken,
    accessTokenMasked: maskSecret(stored?.accessToken),
    username: stored?.username ?? null,
    connectedAt: stored?.connectedAt ?? null,
    tokenExpiresAt: expiresAt,
    lastSyncAt: tokenRow?.lastSyncAt ?? null,
    lastSyncOk: tokenRow?.lastSyncOk ?? null,
    lastError,
    hashtag: hashtagRow?.value ?? null,
    /** Dirección exacta que el cliente debe registrar en su app de Meta (copiable). */
    redirectUri: env.redirectUri,
    scopes: INSTAGRAM_REQUIRED_SCOPES,
    setupSteps: INSTAGRAM_SETUP_GUIDE,
  };
}

// ---- parámetro `state` firmado del flujo OAuth ----

const STATE_TTL_MS = 10 * 60_000;

export function signState(ctx: AppContext, userId: string): string {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}.${randomToken(8)}`;
  return `${payload}.${hmac(ctx.config.encryptionKey, payload)}`;
}

export function verifyState(ctx: AppContext, state: string, userId: string): boolean {
  const idx = state.lastIndexOf('.');
  if (idx < 0) return false;
  const payload = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  if (!safeEqual(sig, hmac(ctx.config.encryptionKey, payload))) return false;
  const [uid, exp] = payload.split('.');
  return uid === userId && Number(exp) > Date.now();
}
