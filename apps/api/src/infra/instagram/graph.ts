/**
 * Cliente de la API de Instagram (inicio de sesión de Instagram, cuenta PROFESIONAL) — ADR-09.
 *
 * Qué hace:
 *  - `GraphInstagramClient.fetchRecentMedia`: lee `/me/media` con paginación y filtra por hashtag en la leyenda.
 *  - `GraphInstagramClient.testConnection`: valida el token y devuelve el usuario.
 *  - `exchangeCodeForToken`: canjea el `code` OAuth por un token de corta duración y luego de LARGA duración (~60 días).
 *  - `refreshLongLivedToken`: renueva un token de larga duración (Instagram exige que tenga >24 h y no haya vencido).
 *
 * Decisiones:
 *  - Todo recibe un `fetch` inyectable: las pruebas usan respuestas simuladas (no hay credenciales reales).
 *  - Los mensajes de error están en español y NUNCA contienen el token ni la URL con `access_token`.
 *  - Las URLs `paging.next` solo se siguen si apuntan a graph.instagram.com (no se filtra el token a terceros).
 *  - Para VIDEO la API no entrega imagen en `media_url`: se usa `thumbnail_url`, así toda publicación
 *    detectada tiene una imagen copiable al aprobar (las URLs de Instagram expiran).
 *
 * Referencia: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 * Estado de verificación: probado con servidores/respuestas simuladas; la prueba de concepto contra la API
 * real queda a cargo del equipo cuando el cliente cree su app de Meta (ver docs/avance.md).
 */
import { INSTAGRAM_REQUIRED_SCOPES } from '@ifts2/shared';
import { captionHasHashtag } from './hashtag';
import {
  InstagramApiError,
  InstagramNotConfiguredError,
  type ConnectionTest,
  type FetchMediaOptions,
  type InstagramClient,
  type InstagramMedia,
} from './types';

export interface GraphOptions {
  /** `token`: alcanza con el token de acceso (sin App ID ni Secret). Por defecto `oauth`. */
  method?: 'oauth' | 'token';
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  fetchFn?: typeof fetch;
  /** Tope de páginas a recorrer por sincronización (evita bucles y consumo excesivo). */
  maxPages?: number;
}

export const GRAPH_BASE = 'https://graph.instagram.com';
const OAUTH_BASE = 'https://api.instagram.com';
const GRAPH_HOST = new URL(GRAPH_BASE).hostname;
const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 6;
const REQUEST_TIMEOUT_MS = 15_000;
const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

/** El token pegado parece de Facebook (EAA...), no de «Instagram con inicio de sesión de Instagram». */
export const FACEBOOK_TOKEN_MESSAGE =
  'Ese token parece de Facebook (empieza con EAA) y esta conexión necesita el token de Instagram con inicio de sesión de Instagram. Generalo de nuevo desde el panel de la app de Meta (Instagram > Configuración de la API con inicio de sesión de Instagram).';

/** Texto que ve el cliente cuando el token ya no sirve (vencido, revocado, contraseña cambiada). */
export const TOKEN_INVALID_MESSAGE =
  'El acceso a Instagram venció o fue revocado. Volvé a conectar la cuenta desde Configuración.';

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/** Qué clase de problema es una respuesta de error de Graph (decide el mensaje y si el token está vencido). */
export type GraphErrorKind = 'token' | 'permission' | 'rate-limit' | 'bad-request' | 'server';

/**
 * Clasifica un error de Graph. IMPORTANTE: `type: "OAuthException"` NO significa "token vencido": Meta lo usa
 * también para el código 100 (parámetro o endpoint inválido) y para los de permisos (10, 200-299). Solo se
 * considera token inválido el 401 o los códigos 190 (token vencido/revocado/ilegible) y 102 (sesión inválida).
 * Tratar todo OAuthException como "venció" hacía que cualquier error de consulta pidiera reconectar la cuenta.
 */
export function classifyGraphError(status: number, code?: number): GraphErrorKind {
  if (status === 401 || code === 190 || code === 102) return 'token';
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) return 'permission';
  if (
    status === 429 ||
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    code === 80002
  ) {
    return 'rate-limit';
  }
  if (status >= 500 || code === 1 || code === 2) return 'server';
  return 'bad-request';
}

/**
 * Motivo técnico para el equipo (lo que respondió Meta), recortado y SIN el token: se muestra en el panel y
 * se guarda en `lastError`/auditoría para poder diagnosticar sin acceso a los logs.
 */
export function describeGraphError(
  status: number,
  err: GraphErrorBody['error'] | undefined,
): string {
  const parts = [`Meta respondió HTTP ${status}`];
  if (err?.code !== undefined) {
    parts.push(
      `código ${err.code}${err.error_subcode !== undefined ? `/${err.error_subcode}` : ''}`,
    );
  }
  let text = [parts.join(', '), err?.message].filter(Boolean).join(': ');
  // Nunca debería venir un token en el mensaje de Meta, pero se redacta cualquier `access_token=...` por las dudas.
  text = text.replace(/access_token=[^&s"']+/gi, 'access_token=***');
  if (err?.fbtrace_id) text += ` (rastreo Meta: ${err.fbtrace_id})`;
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

const defaultFetch: typeof fetch = (input, init) => fetch(input, init);

/** Hace la llamada y traduce fallas de red / HTTP a `InstagramApiError` con mensaje claro. */
async function callGraph<T>(fetchFn: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    // Sin detalles de la excepción: podrían incluir la URL con el token.
    throw new InstagramApiError(
      'No pudimos comunicarnos con Instagram. Intentá de nuevo en unos minutos.',
    );
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as GraphErrorBody | null)?.error;
    const detail = describeGraphError(res.status, err);
    const base = { status: res.status, code: err?.code, detail };
    switch (classifyGraphError(res.status, err?.code)) {
      case 'token':
        throw new InstagramApiError(TOKEN_INVALID_MESSAGE, { ...base, tokenInvalid: true });
      case 'permission':
        throw new InstagramApiError(
          'Instagram no dio permiso para leer las publicaciones. Revisá que la cuenta sea profesional y que el acceso incluya el permiso de lectura de contenido.',
          base,
        );
      case 'rate-limit':
        throw new InstagramApiError(
          'Instagram limitó temporalmente las consultas. Probá de nuevo en unos minutos.',
          base,
        );
      case 'server':
        throw new InstagramApiError(
          `Instagram tuvo un problema temporal (${res.status}). Intentá de nuevo más tarde.`,
          base,
        );
      default:
        throw new InstagramApiError(
          'Instagram rechazó la consulta. El acceso no está vencido; avisale al equipo técnico con el detalle de abajo.',
          base,
        );
    }
  }
  if (body === null || typeof body !== 'object') {
    throw new InstagramApiError('Instagram devolvió una respuesta que no pudimos interpretar.', {
      status: res.status,
    });
  }
  return body as T;
}

interface RawMedia {
  id: string;
  caption?: string;
  media_type: InstagramMedia['mediaType'];
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

function toMedia(m: RawMedia): InstagramMedia | null {
  const ts = new Date(m.timestamp);
  if (!m.id || !m.permalink || Number.isNaN(ts.getTime())) return null; // dato corrupto: se ignora
  return {
    id: String(m.id),
    caption: m.caption ?? '',
    mediaType: m.media_type,
    mediaUrl: (m.media_type === 'VIDEO' ? (m.thumbnail_url ?? m.media_url) : m.media_url) ?? '',
    permalink: m.permalink,
    timestamp: ts.toISOString(),
  };
}

export class GraphInstagramClient implements InstagramClient {
  readonly kind = 'graph' as const;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: GraphOptions) {
    this.fetchFn = opts.fetchFn ?? defaultFetch;
  }

  /**
   * GET a Graph con el token. Si el token es inválido y tiene la forma de un token de Facebook (`EAA...`),
   * se agrega la pista: este cliente habla con graph.instagram.com (inicio de sesión de Instagram) y ahí
   * un token de Facebook/Páginas se rechaza con el mismo error 190 que un token vencido.
   */
  private async get<T>(url: string): Promise<T> {
    try {
      return await callGraph<T>(this.fetchFn, url);
    } catch (e) {
      if (
        e instanceof InstagramApiError &&
        e.tokenInvalid &&
        this.opts.accessToken?.startsWith('EAA')
      ) {
        throw new InstagramApiError(FACEBOOK_TOKEN_MESSAGE, e.opts);
      }
      throw e;
    }
  }

  private requireToken(): string {
    if (this.opts.method !== 'token' && (!this.opts.appId || !this.opts.appSecret)) {
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

  /**
   * Recorre `/me/media` (más nuevas primero) hasta juntar `limit` publicaciones que cumplan el filtro,
   * agotar las páginas / el tope `maxPages` o, en modo incremental (`since`), llegar a una publicación
   * más vieja que `since`.
   *
   * Por qué se corta del lado nuestro y no con el parámetro `since` de la Graph API: ese parámetro
   * (paginación por tiempo) está documentado para el borde de medios de Instagram, pero no pudimos
   * verificar que `graph.instagram.com` (inicio de sesión de Instagram) lo respete y no hay cuenta de
   * Meta para probarlo. Cortar al ver una publicación vieja funciona igual en ambos casos y se prueba
   * con el servidor simulado.
   */
  async fetchRecentMedia(opts?: FetchMediaOptions): Promise<InstagramMedia[]> {
    const token = this.requireToken();
    const limit = opts?.limit ?? 50;
    const maxPages = this.opts.maxPages ?? DEFAULT_MAX_PAGES;
    const sinceMs = opts?.since ? new Date(opts.since).getTime() : null;
    const out: InstagramMedia[] = [];
    let oldestMs: number | null = null;
    let reachedCutoff = false;
    let stoppedByLimit = false;

    let url: string | null =
      `${GRAPH_BASE}/me/media?fields=${MEDIA_FIELDS}&limit=${PAGE_SIZE}` +
      `&access_token=${encodeURIComponent(token)}`;
    for (let page = 0; url && page < maxPages && !stoppedByLimit && !reachedCutoff; page++) {
      const json: { data?: RawMedia[]; paging?: { next?: string } } = await this.get(url);
      for (const raw of json.data ?? []) {
        const media = toMedia(raw);
        if (!media) continue;
        const ms = Date.parse(media.timestamp);
        if (oldestMs === null || ms < oldestMs) oldestMs = ms;
        if (sinceMs !== null && ms < sinceMs) {
          // Ya es de lo que se trajo antes: no entra y no hace falta pedir más páginas.
          reachedCutoff = true;
          continue;
        }
        if (opts?.hashtag && !captionHasHashtag(media.caption, opts.hashtag)) continue;
        out.push(media);
        if (out.length >= limit) {
          stoppedByLimit = true;
          break;
        }
      }
      url = safeNext(json.paging?.next);
    }
    opts?.onCoverage?.({
      // Completo = se llegó al final del listado o al corte; no si frenó el límite o el tope de páginas.
      complete: !stoppedByLimit && (reachedCutoff || url === null),
      oldestScanned: oldestMs === null ? null : new Date(oldestMs).toISOString(),
    });
    return out;
  }

  async getAccountId(): Promise<string> {
    const token = this.requireToken();
    const json = await this.get<{ id?: string }>(
      `${GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(token)}`,
    );
    if (!json.id) throw new InstagramApiError('Instagram no informó la cuenta conectada.');
    return String(json.id);
  }

  async testConnection(): Promise<ConnectionTest> {
    try {
      const token = this.requireToken();
      const json = await this.get<{ username?: string }>(
        `${GRAPH_BASE}/me?fields=username&access_token=${encodeURIComponent(token)}`,
      );
      return { ok: true, username: json.username };
    } catch (e) {
      const detail = e instanceof InstagramApiError && e.detail ? ` (${e.detail})` : '';
      return {
        ok: false,
        error: (e instanceof Error ? e.message : 'Error desconocido.') + detail,
      };
    }
  }
}

/** Solo seguimos `paging.next` si apunta a graph.instagram.com por https (no se filtra el token). */
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  try {
    const u = new URL(next);
    return u.protocol === 'https:' && u.hostname === GRAPH_HOST ? next : null;
  } catch {
    return null;
  }
}

/** URL de autorización OAuth que abre el botón "Conectar con Instagram". */
export function buildAuthorizationUrl(p: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
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

interface LongLived {
  access_token: string;
  expires_in: number;
}

function toGrant(json: LongLived, now: number): TokenGrant {
  if (!json.access_token || !Number.isFinite(json.expires_in)) {
    throw new InstagramApiError('Instagram no devolvió un token válido.');
  }
  return { accessToken: json.access_token, expiresAt: new Date(now + json.expires_in * 1000) };
}

/**
 * Canjea el `code` del callback por un token de larga duración (~60 días): primero el token de corta
 * duración (POST a api.instagram.com) y luego el intercambio por uno de larga duración.
 */
export async function exchangeCodeForToken(
  p: { appId: string; appSecret: string; redirectUri: string; code: string },
  fetchFn: typeof fetch = defaultFetch,
  now: () => number = Date.now,
): Promise<TokenGrant> {
  // Meta agrega "#_" al final del código en la redirección; no forma parte del código.
  const code = p.code.replace(/#_$/, '');
  const shortJson = await callGraph<{
    access_token?: string;
    data?: Array<{ access_token?: string }>;
  }>(fetchFn, `${OAUTH_BASE}/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: p.appId,
      client_secret: p.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: p.redirectUri,
      code,
    }),
  });
  // Según la versión de la API, el token viene plano o dentro de `data[0]`.
  const shortToken = shortJson.access_token ?? shortJson.data?.[0]?.access_token;
  if (!shortToken) throw new InstagramApiError('Instagram no devolvió el token de acceso.');

  const long = await callGraph<LongLived>(
    fetchFn,
    `${GRAPH_BASE}/access_token?grant_type=ig_exchange_token` +
      `&client_secret=${encodeURIComponent(p.appSecret)}&access_token=${encodeURIComponent(shortToken)}`,
  );
  return toGrant(long, now());
}

/**
 * Renueva un token de larga duración (`ig_refresh_token`): devuelve uno nuevo con ~60 días más.
 * Instagram solo lo permite si el token tiene más de 24 h y todavía no venció; si venció hay que
 * reconectar la cuenta (error con `tokenInvalid`).
 */
export async function refreshLongLivedToken(
  accessToken: string,
  fetchFn: typeof fetch = defaultFetch,
  now: () => number = Date.now,
): Promise<TokenGrant> {
  const json = await callGraph<LongLived>(
    fetchFn,
    `${GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`,
  );
  return toGrant(json, now());
}
