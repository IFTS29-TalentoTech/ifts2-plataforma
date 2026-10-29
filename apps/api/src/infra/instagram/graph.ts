import { INSTAGRAM_REQUIRED_SCOPES } from '@ifts2/shared';
import {
  InstagramNotConfiguredError,
  type ConnectionTest,
  type InstagramClient,
  type InstagramMedia,
} from './types';

/**
 * ESQUELETO de la integración real con la API de Instagram (inicio de sesión de Instagram).
 * Lo completa y verifica contra la API real otro agente (backlog US-06/US-07): la fundación solo
 * garantiza la interfaz, la selección por configuración y errores claros cuando falta configurar.
 * Los endpoints de abajo siguen la documentación pública de Meta pero NO se probaron contra la red.
 */
export interface GraphOptions {
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  fetchFn?: typeof fetch;
}

const GRAPH = 'https://graph.instagram.com';

export class GraphInstagramClient implements InstagramClient {
  readonly kind = 'graph' as const;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: GraphOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private requireToken(): string {
    if (!this.opts.appId || !this.opts.appSecret) {
      throw new InstagramNotConfiguredError(
        'Instagram no está configurado: cargá el App ID y el App Secret en Configuración.',
      );
    }
    if (!this.opts.accessToken) {
      throw new InstagramNotConfiguredError(
        'Hay credenciales guardadas pero falta conectar la cuenta de Instagram.',
      );
    }
    return this.opts.accessToken;
  }

  async fetchRecentMedia(opts?: { limit?: number }): Promise<InstagramMedia[]> {
    const token = this.requireToken();
    const fields = 'id,caption,media_type,media_url,permalink,timestamp';
    const url = `${GRAPH}/me/media?fields=${fields}&limit=${opts?.limit ?? 25}&access_token=${encodeURIComponent(token)}`;
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`La API de Instagram respondió ${res.status}.`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        caption?: string;
        media_type: InstagramMedia['mediaType'];
        media_url?: string;
        permalink: string;
        timestamp: string;
      }>;
    };
    return (json.data ?? []).map((m) => ({
      id: m.id,
      caption: m.caption ?? '',
      mediaType: m.media_type,
      mediaUrl: m.media_url ?? '',
      permalink: m.permalink,
      timestamp: new Date(m.timestamp).toISOString(),
    }));
  }

  async testConnection(): Promise<ConnectionTest> {
    try {
      const token = this.requireToken();
      const res = await this.fetchFn(`${GRAPH}/me?fields=username&access_token=${encodeURIComponent(token)}`);
      if (!res.ok) return { ok: false, error: `La API de Instagram respondió ${res.status}.` };
      const json = (await res.json()) as { username?: string };
      return { ok: true, username: json.username };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido.' };
    }
  }
}

/** URL de autorización OAuth que abre el botón "Conectar con Instagram". */
export function buildAuthorizationUrl(p: { appId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.appId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_REQUIRED_SCOPES.join(','),
    state: p.state,
  });
  return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
}

export interface TokenGrant {
  accessToken: string;
  expiresAt: Date;
  username?: string;
}

/**
 * Canjea el `code` del callback por un token de larga duración (~60 días).
 * TODO(agente Instagram): verificar contra la API real y manejar la renovación (ADR-09).
 */
export async function exchangeCodeForToken(
  p: { appId: string; appSecret: string; redirectUri: string; code: string },
  fetchFn: typeof fetch = fetch,
): Promise<TokenGrant> {
  const short = await fetchFn('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: p.appId,
      client_secret: p.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: p.redirectUri,
      code: p.code,
    }),
  });
  if (!short.ok) throw new Error(`Instagram rechazó el código de autorización (${short.status}).`);
  const shortJson = (await short.json()) as { access_token: string };
  const long = await fetchFn(
    `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(p.appSecret)}&access_token=${encodeURIComponent(shortJson.access_token)}`,
  );
  if (!long.ok) throw new Error(`No pudimos obtener el token de larga duración (${long.status}).`);
  const longJson = (await long.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: longJson.access_token,
    expiresAt: new Date(Date.now() + longJson.expires_in * 1000),
  };
}
