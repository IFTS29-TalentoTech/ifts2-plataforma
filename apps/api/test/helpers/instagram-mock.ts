/**
 * Servidor HTTP simulado de la API de Instagram (y de la CDN de imágenes) para las pruebas.
 *
 * No hay credenciales reales, así que las pruebas levantan este servidor local y redirigen hacia él TODAS
 * las llamadas salientes mediante un `fetch` inyectable (`mock.fetch`): graph.instagram.com,
 * api.instagram.com y cualquier host de imágenes terminan en el servidor local, conservando ruta y
 * parámetros. Así se ejercita HTTP de verdad (paginación, errores, cuerpos) sin salir a internet.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';

export interface MockMedia {
  id: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

export interface MockCall {
  /** Host al que iba el pedido original (graph.instagram.com o graph.facebook.com). */
  host: string;
  method: string;
  path: string;
  query: URLSearchParams;
  body: string;
}

export class InstagramMock {
  server!: Server;
  port = 0;
  /** Todas las publicaciones de la cuenta simulada (la más nueva primero). */
  media: MockMedia[] = [];
  pageSize = 2;
  /** Si se define, `/me/media` y `/me` responden este error. */
  mediaError: { status: number; body: unknown } | null = null;
  /** Si se define, SOLO `/me/media` (la lectura de publicaciones) responde este error; `/me` sigue andando. */
  listError: { status: number; body: unknown } | null = null;
  /** Si se define, SOLO `/me` responde este error (la lectura de publicaciones sigue andando). */
  accountError: { status: number; body: unknown } | null = null;
  /** Si se define, `/refresh_access_token` responde este error. */
  refreshError: { status: number; body: unknown } | null = null;
  /** Segundos de vida del token que entrega el refresh / canje. */
  expiresIn = 5_184_000;
  /** Formato de la respuesta del token corto: plano o dentro de `data[]`. */
  shortTokenShape: 'flat' | 'data' = 'flat';
  /** Rutas de imagen que responden 404 (simulan URL vencida). */
  goneImages = new Set<string>();
  /** Id de usuario que devuelve /me (cambiarlo simula conectar otra cuenta). */
  accountId = '1';
  /**
   * Qué host acepta un token cuyo prefijo no es concluyente (ni EAA ni IG…). Los EAA solo los entiende
   * graph.facebook.com y los IG… solo graph.instagram.com; en el host equivocado Meta responde 190
   * «Cannot parse access token» (ADR-045).
   */
  unknownTokenHost: 'graph.instagram.com' | 'graph.facebook.com' = 'graph.instagram.com';
  /** Páginas de Facebook que ve un token de USUARIO (`/me/accounts`), con su cuenta de Instagram vinculada. */
  pages: Array<{ id: string; name: string; ig?: { id: string; username: string } }> = [
    { id: 'p1', name: 'Página del instituto', ig: { id: 'ig1', username: 'cuenta_fb' } },
  ];
  /** Si es `true`, el token es de PÁGINA: `/me/accounts` falla y `/me` es la Página. */
  pageToken = false;
  /** Publicaciones públicas del hashtag (`recent_media`). */
  hashtagMedia: MockMedia[] = [];
  /** Si se define, `ig_hashtag_search` responde este error (p. ej. falta el permiso de contenido público). */
  hashtagError: { status: number; body: unknown } | null = null;
  calls: MockCall[] = [];
  private jpeg!: Buffer;

  async start() {
    this.jpeg = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 120, g: 80, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.port = (this.server.address() as AddressInfo).port;
  }

  async stop() {
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  reset() {
    this.media = [];
    this.pageSize = 2;
    this.mediaError = null;
    this.accountError = null;
    this.listError = null;
    this.refreshError = null;
    this.expiresIn = 5_184_000;
    this.shortTokenShape = 'flat';
    this.goneImages.clear();
    this.accountId = '1';
    this.unknownTokenHost = 'graph.instagram.com';
    this.pages = [
      { id: 'p1', name: 'Página del instituto', ig: { id: 'ig1', username: 'cuenta_fb' } },
    ];
    this.pageToken = false;
    this.hashtagMedia = [];
    this.hashtagError = null;
    this.calls = [];
  }

  /** `fetch` que manda todo al servidor simulado (conserva método, cuerpo, ruta y parámetros). */
  fetch: typeof fetch = (input, init) => {
    const u = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = new Headers(init?.headers);
    headers.set('x-mock-host', u.hostname);
    return fetch(`http://127.0.0.1:${this.port}${u.pathname}${u.search}`, { ...init, headers });
  };

  /** Llamadas hechas a una ruta. */
  callsTo(path: string) {
    return this.calls.filter((c) => c.path === path);
  }

  /** Rutas propias de Facebook Login. Devuelve `true` si respondió. */
  private handleFacebook(url: URL, res: ServerResponse): boolean {
    const page = (p: (typeof this.pages)[number]) => ({
      id: p.id,
      name: p.name,
      ...(p.ig ? { instagram_business_account: { id: p.ig.id, username: p.ig.username } } : {}),
    });
    if (url.pathname === '/me/accounts') {
      if (this.pageToken) {
        this.json(res, 400, {
          error: { message: 'Unsupported get request', type: 'GraphMethodException', code: 100 },
        });
        return true;
      }
      this.json(res, 200, { data: this.pages.map(page) });
      return true;
    }
    if (url.pathname === '/me') {
      this.json(
        res,
        200,
        this.pageToken && this.pages[0] ? page(this.pages[0]) : { id: 'u1', name: 'Persona' },
      );
      return true;
    }
    const mediaOf = /^\/(ig[^/]*)\/media$/.exec(url.pathname);
    if (mediaOf) {
      url.pathname = '/me/media'; // misma lista de publicaciones que la otra API
      return false;
    }
    if (url.pathname === '/ig_hashtag_search') {
      if (this.hashtagError) {
        this.json(res, this.hashtagError.status, this.hashtagError.body);
        return true;
      }
      this.json(res, 200, { data: [{ id: 'h1' }] });
      return true;
    }
    if (url.pathname === '/h1/recent_media') {
      this.json(res, 200, {
        data: this.hashtagMedia.map((m) => ({
          media_type: 'IMAGE',
          permalink: `https://www.instagram.com/p/${m.id}/`,
          timestamp: new Date(Date.UTC(2026, 9, 20)).toISOString(),
          media_url: `https://scontent.cdninstagram.com/img/${m.id}.jpg`,
          ...m,
        })),
      });
      return true;
    }
    return false;
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const host = String(req.headers['x-mock-host'] ?? 'graph.instagram.com');
    // Graph versiona la ruta en Facebook (/v23.0/...): el resto de la lógica no depende de la versión.
    const versioned = /^\/v\d+\.\d+(\/.*)$/.exec(url.pathname);
    if (versioned) url.pathname = versioned[1]!;
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    this.calls.push({
      host,
      method: req.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
      body: Buffer.concat(chunks).toString('utf8'),
    });

    const token = url.searchParams.get('access_token') ?? '';
    const apiHost = host === 'graph.instagram.com' || host === 'graph.facebook.com';
    if (apiHost && token && !url.pathname.startsWith('/oauth')) {
      const accepts = token.startsWith('EAA')
        ? 'graph.facebook.com'
        : token.startsWith('IG')
          ? 'graph.instagram.com'
          : this.unknownTokenHost;
      if (host !== accepts) {
        return this.json(res, 400, {
          error: {
            message: 'Invalid OAuth access token - Cannot parse access token',
            type: 'OAuthException',
            code: 190,
          },
        });
      }
    }
    if (host === 'graph.facebook.com') {
      const fb = this.handleFacebook(url, res);
      if (fb) return;
    }
    if (url.pathname.startsWith('/img/')) {
      if (this.goneImages.has(url.pathname)) return this.json(res, 404, { error: 'gone' });
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      return res.end(this.jpeg);
    }
    if (url.pathname === '/bad/not-image') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('esto no es una imagen');
    }
    if (url.pathname === '/me/media') {
      if (this.mediaError) return this.json(res, this.mediaError.status, this.mediaError.body);
      if (this.listError) return this.json(res, this.listError.status, this.listError.body);
      const after = Number(url.searchParams.get('after') ?? 0);
      const slice = this.media.slice(after, after + this.pageSize);
      const hasMore = after + this.pageSize < this.media.length;
      return this.json(res, 200, {
        data: slice.map((m, i) => ({
          media_type: 'IMAGE',
          permalink: `https://www.instagram.com/p/${m.id}/`,
          timestamp: new Date(Date.UTC(2026, 9, 28 - after - i)).toISOString(),
          media_url: `https://scontent.cdninstagram.com/img/${m.id}.jpg`,
          ...m,
        })),
        paging: hasMore
          ? {
              next: `https://${host}/me/media?fields=x&limit=${this.pageSize}&after=${after + this.pageSize}&access_token=${url.searchParams.get('access_token')}`,
            }
          : {},
      });
    }
    if (url.pathname === '/me') {
      if (this.accountError)
        return this.json(res, this.accountError.status, this.accountError.body);
      if (this.mediaError) return this.json(res, this.mediaError.status, this.mediaError.body);
      return this.json(res, 200, { username: 'cuenta_simulada', id: this.accountId });
    }
    if (url.pathname === '/refresh_access_token') {
      if (this.refreshError)
        return this.json(res, this.refreshError.status, this.refreshError.body);
      return this.json(res, 200, {
        access_token: `${url.searchParams.get('access_token')}-renovado`,
        token_type: 'bearer',
        expires_in: this.expiresIn,
      });
    }
    if (url.pathname === '/access_token') {
      return this.json(res, 200, {
        access_token: 'IGAA-larga-duracion',
        token_type: 'bearer',
        expires_in: this.expiresIn,
      });
    }
    if (
      url.pathname === '/oauth/access_token' &&
      url.searchParams.get('grant_type') === 'fb_exchange_token'
    ) {
      return this.json(res, 200, {
        access_token: 'EAA-larga-duracion',
        token_type: 'bearer',
        expires_in: this.expiresIn,
      });
    }
    if (url.pathname === '/oauth/access_token') {
      const token = { access_token: 'IGAA-corta', user_id: 1 };
      return this.json(res, 200, this.shortTokenShape === 'flat' ? token : { data: [token] });
    }
    return this.json(res, 404, { error: { message: 'ruta desconocida en el mock', code: 1 } });
  }
}

/** Respuesta de error de la Graph API por token inválido (OAuthException, código 190). */
export const TOKEN_ERROR_BODY = {
  error: { message: 'Error validating access token', type: 'OAuthException', code: 190 },
};
