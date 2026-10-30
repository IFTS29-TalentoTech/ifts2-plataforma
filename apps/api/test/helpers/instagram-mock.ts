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
  /** Si se define, `/refresh_access_token` responde este error. */
  refreshError: { status: number; body: unknown } | null = null;
  /** Segundos de vida del token que entrega el refresh / canje. */
  expiresIn = 5_184_000;
  /** Formato de la respuesta del token corto: plano o dentro de `data[]`. */
  shortTokenShape: 'flat' | 'data' = 'flat';
  /** Rutas de imagen que responden 404 (simulan URL vencida). */
  goneImages = new Set<string>();
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
    this.refreshError = null;
    this.expiresIn = 5_184_000;
    this.shortTokenShape = 'flat';
    this.goneImages.clear();
    this.calls = [];
  }

  /** `fetch` que manda todo al servidor simulado (conserva método, cuerpo, ruta y parámetros). */
  fetch: typeof fetch = (input, init) => {
    const u = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    return fetch(`http://127.0.0.1:${this.port}${u.pathname}${u.search}`, init);
  };

  /** Llamadas hechas a una ruta. */
  callsTo(path: string) {
    return this.calls.filter((c) => c.path === path);
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    this.calls.push({
      method: req.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
      body: Buffer.concat(chunks).toString('utf8'),
    });

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
              next: `https://graph.instagram.com/me/media?fields=x&limit=${this.pageSize}&after=${after + this.pageSize}&access_token=${url.searchParams.get('access_token')}`,
            }
          : {},
      });
    }
    if (url.pathname === '/me') {
      if (this.mediaError) return this.json(res, this.mediaError.status, this.mediaError.body);
      return this.json(res, 200, { username: 'cuenta_simulada', id: '1' });
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
