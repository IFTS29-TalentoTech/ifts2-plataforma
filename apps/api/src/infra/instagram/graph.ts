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
import { samePermalink } from './permalink';
import {
  InstagramApiError,
  InstagramNotConfiguredError,
  type ConnectionDiagnosis,
  type ConnectionTest,
  type DiagnosticStep,
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
  /** Id de la cuenta de Instagram a usar con un token de Facebook que ve varias (por defecto, la primera). */
  igUserId?: string;
  /** Tope de páginas a recorrer por sincronización (evita bucles y consumo excesivo). */
  maxPages?: number;
}

export const GRAPH_BASE = 'https://graph.instagram.com';
/** Facebook Login (tokens EAA…): host y versión de la Graph API (ADR-045). */
export const FB_BASE = 'https://graph.facebook.com/v23.0';
const OAUTH_BASE = 'https://api.instagram.com';
const GRAPH_HOSTS = new Set([new URL(GRAPH_BASE).hostname, new URL(FB_BASE).hostname]);
const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 6;
/** Páginas (de 50) que se revisan buscando una publicación por su enlace: unas 500 publicaciones. */
const FIND_MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 15_000;
const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
/** `recent_media` de un hashtag no admite `thumbnail_url`. */
const HASHTAG_MEDIA_FIELDS = 'id,caption,media_type,media_url,permalink,timestamp';

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

/** `/me` puede responder el objeto plano o dentro de `data` (según la versión de la API). */
type MeRecord = { id?: string; user_id?: string; username?: string; account_type?: string };
type MeResponse = MeRecord & { data?: MeRecord[] };
const meRecord = (r: MeResponse): MeRecord => r.data?.[0] ?? r;

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

/** Qué API habla el token (ADR-045): `instagram` = inicio de sesión de Instagram; `facebook` = Facebook Login. */
export type GraphFlavor = 'instagram' | 'facebook';

/**
 * Tipo de token por su prefijo. `EAA…` es de Facebook Login (graph.facebook.com); `IG…` (IGAA, IGQ…) es de
 * «Instagram con inicio de sesión de Instagram» (graph.instagram.com). Otro prefijo no es concluyente: se
 * prueba primero el host de Instagram y, si Meta no entiende el token, el de Facebook.
 */
export function detectTokenFlavor(token: string): GraphFlavor | null {
  if (token.startsWith('EAA')) return 'facebook';
  if (/^IG/.test(token)) return 'instagram';
  return null;
}

const baseOf = (f: GraphFlavor) => (f === 'facebook' ? FB_BASE : GRAPH_BASE);

interface PageNode {
  id?: string;
  name?: string;
  instagram_business_account?: { id?: string; username?: string };
}

/** Cuenta de Instagram resuelta para un token de Facebook (ver `igUser`). */
interface IgUser {
  id: string;
  username?: string;
  pageName?: string;
  /** Otras cuentas de Instagram que también ve el token (se usa la primera). */
  others: string[];
}

export class GraphInstagramClient implements InstagramClient {
  readonly kind = 'graph' as const;
  private readonly fetchFn: typeof fetch;
  /** API elegida; se confirma con el primer pedido exitoso. */
  private flavor: GraphFlavor | null = null;
  private flavorConfirmed = false;
  private igCache: IgUser | null = null;

  constructor(private readonly opts: GraphOptions) {
    this.fetchFn = opts.fetchFn ?? defaultFetch;
  }

  /** GET a Graph. Los errores ya vienen traducidos (sin token) por `callGraph`. */
  private get<T>(url: string): Promise<T> {
    return callGraph<T>(this.fetchFn, url);
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
   * Ejecuta `fn` contra la API que corresponde al token. Si el prefijo no es concluyente y Meta no entiende
   * el token en el host elegido (190 «Cannot parse access token» o 400), se reintenta UNA vez contra el otro
   * host antes de fallar; el primero que responde bien queda como el de este cliente.
   */
  private async run<T>(fn: (flavor: GraphFlavor, token: string) => Promise<T>): Promise<T> {
    const token = this.requireToken();
    const first = this.flavor ?? detectTokenFlavor(token) ?? 'instagram';
    try {
      const out = await fn(first, token);
      this.flavor = first;
      this.flavorConfirmed = true;
      return out;
    } catch (e) {
      const unsure = !this.flavorConfirmed && detectTokenFlavor(token) === null;
      const retriable =
        e instanceof InstagramApiError && (e.opts.code === 190 || e.opts.status === 400);
      if (!unsure || !retriable) throw e;
      const other: GraphFlavor = first === 'instagram' ? 'facebook' : 'instagram';
      try {
        const out = await fn(other, token);
        this.flavor = other;
        this.flavorConfirmed = true;
        return out;
      } catch {
        throw e; // se informa el error del host esperado
      }
    }
  }

  /**
   * Cuenta de Instagram profesional que ve un token de Facebook. Con token de usuario se lee `/me/accounts`
   * (Páginas con su cuenta de Instagram vinculada); con token de Página, `/me` ya es la Página. Si hay
   * varias cuentas se usa la primera (o la indicada en `igUserId`) y las demás se informan.
   */
  private async igUser(token: string): Promise<IgUser> {
    if (this.igCache) return this.igCache;
    const t = encodeURIComponent(token);
    const fields = 'id,name,instagram_business_account{id,username}';
    if (this.opts.igUserId) {
      return (this.igCache = { id: this.opts.igUserId, others: [] });
    }
    let pages: PageNode[] = [];
    try {
      const j = await this.get<{ data?: PageNode[] }>(
        `${FB_BASE}/me/accounts?fields=${fields}&limit=100&access_token=${t}`,
      );
      pages = j.data ?? [];
    } catch (e) {
      if (!(e instanceof InstagramApiError) || e.tokenInvalid) throw e;
    }
    let linked = pages.filter((p) => p.instagram_business_account?.id);
    if (linked.length === 0) {
      // Token de Página: `/me` es la Página.
      try {
        const page = await this.get<PageNode>(`${FB_BASE}/me?fields=${fields}&access_token=${t}`);
        if (page.instagram_business_account?.id) linked = [page];
      } catch (e) {
        if (e instanceof InstagramApiError && e.tokenInvalid) throw e;
      }
    }
    const first = linked[0];
    if (!first?.instagram_business_account?.id) {
      throw new InstagramApiError(
        'Este token no ve ninguna cuenta de Instagram profesional vinculada a una Página de Facebook. Vinculá la cuenta a una Página y generá el token con los permisos instagram_basic y pages_show_list.',
        { status: 400 },
      );
    }
    return (this.igCache = {
      id: first.instagram_business_account.id,
      username: first.instagram_business_account.username,
      pageName: first.name,
      others: linked
        .slice(1)
        .map(
          (p) => `@${p.instagram_business_account?.username ?? p.instagram_business_account?.id}`,
        ),
    });
  }

  /** Dirección de la primera página de publicaciones propias (según el tipo de token). */
  private async mediaUrl(f: GraphFlavor, token: string, limit: number): Promise<string> {
    const t = encodeURIComponent(token);
    const path = f === 'facebook' ? `/${(await this.igUser(token)).id}/media` : '/me/media';
    return `${baseOf(f)}${path}?fields=${MEDIA_FIELDS}&limit=${limit}&access_token=${t}`;
  }

  /**
   * Recorre las publicaciones propias (más nuevas primero) hasta juntar `limit` que cumplan el filtro,
   * agotar las páginas / el tope `maxPages` o, en modo incremental (`since`), llegar a una más vieja que `since`.
   *
   * Por qué se corta del lado nuestro y no con el parámetro `since` de la Graph API: no pudimos verificar
   * que todas las variantes lo respeten y no hay cuenta de Meta para probarlo. Cortar al ver una publicación
   * vieja funciona igual en ambos casos y se prueba con el servidor simulado.
   *
   * Con token de Facebook y hashtag se suma, como mejora opcional, la búsqueda pública de hashtags
   * (`ig_hashtag_search`): si falla (por ejemplo falta «Instagram Public Content Access») se avisa por
   * `onWarning` y la sincronización de la cuenta sigue igual.
   */
  async fetchRecentMedia(opts?: FetchMediaOptions): Promise<InstagramMedia[]> {
    const limit = opts?.limit ?? 50;
    const maxPages = this.opts.maxPages ?? DEFAULT_MAX_PAGES;
    const sinceMs = opts?.since ? new Date(opts.since).getTime() : null;
    const out: InstagramMedia[] = [];
    let oldestMs: number | null = null;
    let reachedCutoff = false;
    let stoppedByLimit = false;

    type Page = { data?: RawMedia[]; paging?: { next?: string } };
    let json: Page = await this.run((f, token) =>
      this.mediaUrl(f, token, PAGE_SIZE).then((u) => this.get<Page>(u)),
    );
    let url: string | null = null;
    for (let page = 0; page < maxPages && !stoppedByLimit && !reachedCutoff; page++) {
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
      if (!url || stoppedByLimit || reachedCutoff || page + 1 >= maxPages) break;
      json = await this.get<Page>(url);
    }
    opts?.onCoverage?.({
      // Completo = se llegó al final del listado o al corte; no si frenó el límite o el tope de páginas.
      complete: !stoppedByLimit && (reachedCutoff || url === null),
      oldestScanned: oldestMs === null ? null : new Date(oldestMs).toISOString(),
    });

    if (opts?.hashtag && this.flavor === 'facebook' && out.length < limit) {
      await this.addHashtagMedia(out, opts, limit, sinceMs);
    }
    return out;
  }

  /** Publicaciones públicas con el hashtag (Facebook Login). Nunca lanza: informa por `onWarning`. */
  private async addHashtagMedia(
    out: InstagramMedia[],
    opts: FetchMediaOptions,
    limit: number,
    sinceMs: number | null,
  ) {
    try {
      const token = this.requireToken();
      const t = encodeURIComponent(token);
      const ig = await this.igUser(token);
      const bare = (opts.hashtag ?? '').replace(/^[#＃]+/, '').trim();
      if (!bare) return;
      const found = await this.get<{ data?: Array<{ id?: string }> }>(
        `${FB_BASE}/ig_hashtag_search?user_id=${ig.id}&q=${encodeURIComponent(bare)}&access_token=${t}`,
      );
      const hashtagId = found.data?.[0]?.id;
      if (!hashtagId) return;
      const recent = await this.get<{ data?: RawMedia[] }>(
        `${FB_BASE}/${hashtagId}/recent_media?user_id=${ig.id}&fields=${HASHTAG_MEDIA_FIELDS}&limit=${PAGE_SIZE}&access_token=${t}`,
      );
      const seen = new Set(out.map((m) => m.id));
      for (const raw of recent.data ?? []) {
        const media = toMedia(raw);
        if (!media || seen.has(media.id)) continue;
        if (sinceMs !== null && Date.parse(media.timestamp) < sinceMs) continue;
        out.push(media);
        seen.add(media.id);
        if (out.length >= limit) break;
      }
    } catch (e) {
      const permission =
        e instanceof InstagramApiError &&
        e.opts.code !== undefined &&
        (e.opts.code === 10 || (e.opts.code >= 200 && e.opts.code <= 299));
      opts.onWarning?.(
        permission
          ? 'La búsqueda pública del hashtag no está disponible: falta el permiso «Instagram Public Content Access» en la app de Meta. Se sincronizaron solo las publicaciones de la cuenta.'
          : `No se pudo buscar el hashtag público (${e instanceof InstagramApiError ? (e.detail ?? e.message) : 'error desconocido'}). Se sincronizaron solo las publicaciones de la cuenta.`,
      );
    }
  }

  /** Id de la cuenta de Instagram conectada (sirve para detectar un cambio de cuenta, ADR-038). */
  async getAccountId(): Promise<string> {
    const id = await this.run(async (f, token) => {
      if (f === 'facebook') return (await this.igUser(token)).id;
      const json = await this.get<MeResponse>(
        `${GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(token)}`,
      );
      return meRecord(json).id;
    });
    if (!id) throw new InstagramApiError('Instagram no informó la cuenta conectada.');
    return String(id);
  }

  /**
   * Busca una publicación por su enlace entre las más recientes de la cuenta (hasta ~500). Se compara por el
   * código corto del enlace, así que da igual si pegaron `/p/` o `/reel/`, con `?igsh=` o sin barra final.
   * Si la publicación es un carrusel o un video sin `media_url`, se completa con el primer hijo con imagen.
   * No se raspa instagram.com (muro de inicio de sesión y términos de uso): solo la API oficial.
   */
  async findMediaByPermalink(permalink: string): Promise<InstagramMedia | null> {
    type Page = { data?: RawMedia[]; paging?: { next?: string } };
    let json: Page = await this.run((f, token) =>
      this.mediaUrl(f, token, PAGE_SIZE).then((u) => this.get<Page>(u)),
    );
    const token = this.requireToken();
    for (let page = 0; page < FIND_MAX_PAGES; page++) {
      for (const raw of json.data ?? []) {
        if (!raw.permalink || !samePermalink(raw.permalink, permalink)) continue;
        const media = toMedia(raw);
        if (!media) return null;
        if (!media.mediaUrl) media.mediaUrl = await this.firstChildImage(raw.id, token);
        return media;
      }
      const next = safeNext(json.paging?.next);
      if (!next) return null;
      json = await this.get<Page>(next);
    }
    return null;
  }

  /** Imagen del primer hijo de un carrusel (o `''` si no hay): la portada del álbum puede venir sin `media_url`. */
  private async firstChildImage(mediaId: string, token: string): Promise<string> {
    try {
      const base = baseOf(this.flavor ?? detectTokenFlavor(token) ?? 'instagram');
      const json = await this.get<{ data?: Array<{ media_type?: string; media_url?: string }> }>(
        `${base}/${encodeURIComponent(mediaId)}/children?fields=media_type,media_url&access_token=${encodeURIComponent(token)}`,
      );
      return json.data?.find((c) => c.media_url && c.media_type !== 'VIDEO')?.media_url ?? '';
    } catch {
      return ''; // sin hijos legibles: la imagen se sube a mano o se publica sin imagen
    }
  }

  /**
   * "Probar conexión", paso a paso (ADR-045). Cada paso dice qué falló y con qué respuesta de Meta, sin el
   * token. Se corta en el primer fallo (los pasos siguientes quedan "sin probar"). El hashtag es informativo:
   * se cuenta en las publicaciones propias y, con token de Facebook, se prueba además la búsqueda pública.
   */
  async diagnose(hashtag?: string | null): Promise<ConnectionDiagnosis> {
    const steps: DiagnosticStep[] = [];
    const fail = (id: DiagnosticStep['id'], label: string, e: unknown) => {
      const base = e instanceof Error ? e.message : 'Error desconocido.';
      const detail = e instanceof InstagramApiError && e.detail ? `${base} (${e.detail})` : base;
      steps.push({ id, label, status: 'fail', detail });
    };
    const finish = (username?: string): ConnectionDiagnosis => {
      const all: Array<[DiagnosticStep['id'], string]> = [
        ['token', 'Token de acceso'],
        ['identity', 'Cuenta conectada'],
        ['media', 'Lectura de publicaciones'],
      ];
      if (hashtag) all.push(['hashtag', 'Hashtag en las publicaciones']);
      for (const [id, label] of all) {
        if (!steps.some((x) => x.id === id)) steps.push({ id, label, status: 'skipped' });
      }
      return { ok: !steps.some((x) => x.status === 'fail'), username, steps };
    };

    // 1) Token cargado y bien pegado.
    let token: string;
    try {
      token = this.requireToken();
    } catch (e) {
      fail('token', 'Token de acceso', e);
      return finish();
    }
    if (/\s/.test(token)) {
      steps.push({
        id: 'token',
        label: 'Token de acceso',
        status: 'fail',
        detail: 'El token tiene espacios o saltos de línea: pegalo de nuevo sin ellos.',
      });
      return finish();
    }

    // 2) Identidad (y confirmación del tipo de token / host).
    let username: string | undefined;
    try {
      const who = await this.run(async (f, tk) => {
        if (f === 'facebook') {
          const ig = await this.igUser(tk);
          return { f, username: ig.username, note: ig };
        }
        // Se pide también el tipo de cuenta; si ese campo no existiera en la versión de la API se reintenta
        // sin él (un campo inválido tira abajo toda la consulta con el código 100).
        let me: MeResponse;
        try {
          me = await this.get<MeResponse>(
            `${GRAPH_BASE}/me?fields=id,username,account_type&access_token=${encodeURIComponent(tk)}`,
          );
        } catch (e) {
          if (e instanceof InstagramApiError && !e.tokenInvalid && e.status === 400) {
            me = await this.get<MeResponse>(
              `${GRAPH_BASE}/me?fields=id,username&access_token=${encodeURIComponent(tk)}`,
            );
          } else throw e;
        }
        return { f, username: meRecord(me).username, type: meRecord(me).account_type };
      });
      username = who.username;
      steps.push({
        id: 'token',
        label: 'Token de acceso',
        status: 'ok',
        detail:
          who.f === 'facebook'
            ? 'Token de Facebook (empieza con EAA): se consulta graph.facebook.com.'
            : 'Token de Instagram (inicio de sesión de Instagram): se consulta graph.instagram.com.',
      });
      if (who.f === 'facebook') {
        const ig = who.note as IgUser;
        steps.push({
          id: 'identity',
          label: 'Cuenta conectada',
          status: ig.others.length ? 'warn' : 'ok',
          detail:
            `@${ig.username ?? ig.id}${ig.pageName ? ` (vinculada a la Página «${ig.pageName}»)` : ''}` +
            (ig.others.length
              ? `. El token ve más cuentas (${ig.others.join(', ')}); se usa la primera.`
              : ''),
        });
      } else {
        const type = (who as { type?: string }).type;
        const personal = type !== undefined && !['BUSINESS', 'MEDIA_CREATOR'].includes(type);
        steps.push({
          id: 'identity',
          label: 'Cuenta conectada',
          status: personal ? 'warn' : 'ok',
          detail: personal
            ? `@${username ?? '?'} es una cuenta personal (${type}): la API solo funciona con cuentas profesionales (empresa o creador). Cambiá el tipo de cuenta en Instagram.`
            : `@${username ?? 'cuenta'}${type ? ` (${type})` : ''}`,
        });
      }
    } catch (e) {
      fail('token', 'Token de acceso', e);
      return finish();
    }

    // 3) Lectura de publicaciones propias, con los mismos campos que la sincronización.
    let recent: RawMedia[];
    try {
      const json = await this.run((f, tk) =>
        this.mediaUrl(f, tk, PAGE_SIZE).then((u) => this.get<{ data?: RawMedia[] }>(u)),
      );
      recent = json.data ?? [];
      steps.push({
        id: 'media',
        label: 'Lectura de publicaciones',
        status: 'ok',
        detail: recent.length
          ? `Se leyeron ${recent.length} publicaciones recientes.`
          : 'La cuenta no tiene publicaciones todavía.',
      });
    } catch (e) {
      fail('media', 'Lectura de publicaciones', e);
      return finish(username);
    }

    // 4) Hashtag (informativo, nunca falla la conexión).
    if (hashtag) {
      const n = recent.filter((m) => captionHasHashtag(m.caption, hashtag)).length;
      let extra = '';
      let status: DiagnosticStep['status'] = n > 0 ? 'ok' : 'warn';
      if (this.flavor === 'facebook') {
        const warnings: string[] = [];
        await this.addHashtagMedia([], { hashtag, onWarning: (w) => warnings.push(w) }, 1, null);
        extra = warnings.length
          ? ` Búsqueda pública: ${warnings[0]}`
          : ' La búsqueda pública del hashtag está disponible.';
        if (warnings.length && n > 0) status = 'warn';
      }
      steps.push({
        id: 'hashtag',
        label: 'Hashtag en las publicaciones',
        status,
        detail:
          (n > 0
            ? `${n} de las últimas ${recent.length} llevan ${hashtag}.`
            : `Ninguna de las últimas ${recent.length} lleva ${hashtag} en la leyenda.`) + extra,
      });
    }
    return finish(username);
  }

  async testConnection(): Promise<ConnectionTest> {
    try {
      const username = await this.run(async (f, token) => {
        if (f === 'facebook') return (await this.igUser(token)).username;
        const json = await this.get<MeResponse>(
          `${GRAPH_BASE}/me?fields=username&access_token=${encodeURIComponent(token)}`,
        );
        return meRecord(json).username;
      });
      return { ok: true, username };
    } catch (e) {
      const detail = e instanceof InstagramApiError && e.detail ? ` (${e.detail})` : '';
      return {
        ok: false,
        error: (e instanceof Error ? e.message : 'Error desconocido.') + detail,
      };
    }
  }
}

/** Solo seguimos `paging.next` si apunta a graph.instagram.com o graph.facebook.com por https (no se filtra el token). */
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  try {
    const u = new URL(next);
    return u.protocol === 'https:' && GRAPH_HOSTS.has(u.hostname) ? next : null;
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

/**
 * Renueva un token de USUARIO de Facebook de larga duración (`fb_exchange_token`, ~60 días): hace falta el
 * App ID y el App Secret de la app. Los tokens de Página derivados de un token de larga duración no vencen.
 */
export async function refreshFacebookToken(
  p: { appId: string; appSecret: string; accessToken: string },
  fetchFn: typeof fetch = defaultFetch,
  now: () => number = Date.now,
): Promise<TokenGrant> {
  const json = await callGraph<LongLived>(
    fetchFn,
    `${FB_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(p.appId)}` +
      `&client_secret=${encodeURIComponent(p.appSecret)}&fb_exchange_token=${encodeURIComponent(p.accessToken)}`,
  );
  return toGrant(json, now());
}
