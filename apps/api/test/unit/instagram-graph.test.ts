/**
 * GraphInstagramClient contra un servidor HTTP simulado (no hay credenciales reales):
 * paginación, filtro por hashtag, errores en español sin filtrar el token, canje de código y renovación.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  exchangeCodeForToken,
  GraphInstagramClient,
  InstagramApiError,
  InstagramNotConfiguredError,
  refreshLongLivedToken,
} from '../../src/infra/instagram';
import { InstagramMock, TOKEN_ERROR_BODY } from '../helpers/instagram-mock';

const mock = new InstagramMock();
const TOKEN = 'IGAA-token-super-secreto-1234567890';
beforeAll(() => mock.start());
afterAll(() => mock.stop());
beforeEach(() => mock.reset());

const client = (over: Partial<ConstructorParameters<typeof GraphInstagramClient>[0]> = {}) =>
  new GraphInstagramClient({
    appId: '123',
    appSecret: 'secreto-app',
    accessToken: TOKEN,
    fetchFn: mock.fetch,
    ...over,
  });

describe('fetchRecentMedia', () => {
  it('recorre todas las páginas y filtra por el hashtag de la leyenda', async () => {
    mock.media = [
      { id: 'a1', caption: 'Uno #ifts2web' },
      { id: 'a2', caption: 'Dos sin etiqueta' },
      { id: 'a3', caption: 'Tres #ifts2web2024' }, // hashtag distinto
      { id: 'a4', caption: 'Cuatro #IFTS2Web' },
      { id: 'a5', caption: 'Cinco #ifts2web' },
    ];
    const out = await client().fetchRecentMedia({ hashtag: '#ifts2web' });
    expect(out.map((m) => m.id)).toEqual(['a1', 'a4', 'a5']);
    // 5 publicaciones con páginas de 2 => 3 llamadas (paginación real por paging.next)
    expect(mock.callsTo('/me/media')).toHaveLength(3);
    expect(out[0]).toMatchObject({
      mediaType: 'IMAGE',
      permalink: 'https://www.instagram.com/p/a1/',
    });
    expect(out[0]!.mediaUrl).toContain('/img/a1.jpg');
  });

  it('corta al llegar al límite pedido sin seguir paginando', async () => {
    mock.media = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, caption: '#ifts2web' }));
    const out = await client().fetchRecentMedia({ hashtag: '#ifts2web', limit: 3 });
    expect(out).toHaveLength(3);
    expect(mock.callsTo('/me/media')).toHaveLength(2);
  });

  it('respeta el tope de páginas (maxPages)', async () => {
    mock.media = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, caption: '#ifts2web' }));
    const out = await client({ maxPages: 2 }).fetchRecentMedia({ hashtag: '#ifts2web' });
    expect(out).toHaveLength(4);
  });

  it('sin hashtag devuelve todo; en videos usa la miniatura como imagen', async () => {
    mock.media = [
      {
        id: 'v1',
        caption: 'Video',
        media_type: 'VIDEO',
        media_url: 'https://video.example.com/v.mp4',
        thumbnail_url: 'https://scontent.cdninstagram.com/img/thumb.jpg',
      },
      { id: 'i1', caption: 'Foto' },
    ];
    const out = await client().fetchRecentMedia();
    expect(out).toHaveLength(2);
    expect(out[0]!.mediaUrl).toBe('https://scontent.cdninstagram.com/img/thumb.jpg');
  });

  it('ignora datos corruptos (sin fecha válida) en lugar de fallar', async () => {
    mock.media = [
      { id: 'ok', caption: '#ifts2web' },
      { id: 'roto', caption: '#ifts2web', timestamp: 'no-es-fecha' },
    ];
    const out = await client().fetchRecentMedia({ hashtag: '#ifts2web' });
    expect(out.map((m) => m.id)).toEqual(['ok']);
  });

  it('no sigue un paging.next que apunte a otro dominio (no filtra el token)', async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          data: [
            {
              id: '1',
              caption: '#t',
              media_type: 'IMAGE',
              permalink: 'p',
              timestamp: '2026-10-01T00:00:00Z',
            },
          ],
          paging: { next: 'https://evil.example.com/steal' },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const out = await client({ fetchFn }).fetchRecentMedia({ hashtag: '#t' });
    expect(out).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('token vencido (código 190): error claro en español, marcado tokenInvalid y SIN el token', async () => {
    mock.mediaError = { status: 400, body: TOKEN_ERROR_BODY };
    const err = await client()
      .fetchRecentMedia()
      .catch((e) => e);
    expect(err).toBeInstanceOf(InstagramApiError);
    expect(err.tokenInvalid).toBe(true);
    expect(err.message).toMatch(/Volvé a conectar la cuenta/);
    expect(err.message).not.toContain(TOKEN);
  });

  it('límite de consultas (429) y errores del servidor tienen mensajes propios', async () => {
    mock.mediaError = { status: 429, body: { error: { code: 4, message: 'rate' } } };
    await expect(client().fetchRecentMedia()).rejects.toThrow(/limitó temporalmente/);
    mock.mediaError = { status: 500, body: {} };
    await expect(client().fetchRecentMedia()).rejects.toThrow(/respondió con un error \(500\)/);
  });

  it('falla de red: mensaje claro sin detalles internos ni el token', async () => {
    const fetchFn = (async () => {
      throw new TypeError(`fetch failed https://graph.instagram.com/me?access_token=${TOKEN}`);
    }) as unknown as typeof fetch;
    const err = await client({ fetchFn })
      .fetchRecentMedia()
      .catch((e) => e);
    expect(err).toBeInstanceOf(InstagramApiError);
    expect(err.message).toMatch(/No pudimos comunicarnos con Instagram/);
    expect(err.message).not.toContain(TOKEN);
  });

  it('sin credenciales o sin cuenta conectada lanza InstagramNotConfiguredError', async () => {
    await expect(client({ appId: undefined }).fetchRecentMedia()).rejects.toBeInstanceOf(
      InstagramNotConfiguredError,
    );
    await expect(client({ accessToken: undefined }).fetchRecentMedia()).rejects.toThrow(
      /falta conectar la cuenta/,
    );
  });
});

describe('testConnection', () => {
  it('devuelve el usuario conectado', async () => {
    expect(await client().testConnection()).toEqual({ ok: true, username: 'cuenta_simulada' });
  });
  it('informa el error sin lanzar', async () => {
    mock.mediaError = { status: 400, body: TOKEN_ERROR_BODY };
    const r = await client().testConnection();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Volvé a conectar/);
  });
});

describe('exchangeCodeForToken (OAuth)', () => {
  const params = { appId: '123', appSecret: 'sec', redirectUri: 'http://x/cb', code: 'CODIGO#_' };

  it.each(['flat', 'data'] as const)(
    'canjea el código por un token de larga duración (respuesta %s)',
    async (shape) => {
      mock.shortTokenShape = shape;
      const now = Date.UTC(2026, 9, 29);
      const grant = await exchangeCodeForToken(params, mock.fetch, () => now);
      expect(grant.accessToken).toBe('IGAA-larga-duracion');
      expect(grant.expiresAt.getTime()).toBe(now + 5_184_000 * 1000);
      // el sufijo "#_" que agrega Meta no se envía
      const body = new URLSearchParams(mock.callsTo('/oauth/access_token')[0]!.body);
      expect(body.get('code')).toBe('CODIGO');
      expect(body.get('grant_type')).toBe('authorization_code');
      // el secreto va en el canje largo y el token corto se usa para pedir el de larga duración
      const long = mock.callsTo('/access_token')[0]!;
      expect(long.query.get('grant_type')).toBe('ig_exchange_token');
      expect(long.query.get('access_token')).toBe('IGAA-corta');
    },
  );
});

describe('refreshLongLivedToken (renovación)', () => {
  it('devuelve un token nuevo con ~60 días más', async () => {
    const now = Date.UTC(2026, 9, 29);
    const grant = await refreshLongLivedToken('TOK', mock.fetch, () => now);
    expect(grant.accessToken).toBe('TOK-renovado');
    expect(grant.expiresAt.getTime()).toBe(now + 5_184_000 * 1000);
    expect(mock.callsTo('/refresh_access_token')[0]!.query.get('grant_type')).toBe(
      'ig_refresh_token',
    );
  });

  it('si el token ya venció informa que hay que reconectar', async () => {
    mock.refreshError = { status: 400, body: TOKEN_ERROR_BODY };
    const err = await refreshLongLivedToken('TOK', mock.fetch).catch((e) => e);
    expect(err).toBeInstanceOf(InstagramApiError);
    expect(err.tokenInvalid).toBe(true);
  });
});
