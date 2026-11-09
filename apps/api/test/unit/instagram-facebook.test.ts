/**
 * ADR-045: la conexión con Instagram acepta los DOS tipos de token y elige sola el host de Meta
 * (EAA… = Facebook Login → graph.facebook.com; IG… = inicio de sesión de Instagram → graph.instagram.com),
 * resuelve la cuenta de Instagram detrás de una Página, busca publicaciones por su enlace y diagnostica la
 * conexión paso a paso. Todo contra el servidor HTTP simulado (no hay credenciales reales).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  detectTokenFlavor,
  GraphInstagramClient,
  InstagramApiError,
  instagramShortcode,
  normalizeInstagramPermalink,
  refreshFacebookToken,
  samePermalink,
} from '../../src/infra/instagram';
import { InstagramMock } from '../helpers/instagram-mock';

const mock = new InstagramMock();
beforeAll(() => mock.start());
afterAll(() => mock.stop());
beforeEach(() => mock.reset());

const EAA = 'EAAGm0PX4ZCpsBA-token-de-facebook-1234567890';
const IG = 'IGAA-token-de-instagram-1234567890';

const client = (accessToken: string, over: Record<string, unknown> = {}) =>
  new GraphInstagramClient({ method: 'token', accessToken, fetchFn: mock.fetch, ...over });

describe('enlaces de publicaciones de Instagram', () => {
  it('reconoce el código corto en /p/, /reel/, /tv/, con parámetros, www o usuario por delante', () => {
    for (const link of [
      'https://www.instagram.com/p/CxYz_123-ab/',
      'https://instagram.com/p/CxYz_123-ab',
      'https://www.instagram.com/p/CxYz_123-ab/?igsh=MWx0b2g5',
      'https://www.instagram.com/reel/CxYz_123-ab/',
      'https://www.instagram.com/tv/CxYz_123-ab/?utm_source=ig_web_copy_link#algo',
      'https://www.instagram.com/ifts2/p/CxYz_123-ab/',
    ]) {
      expect(instagramShortcode(link), link).toBe('CxYz_123-ab');
      expect(normalizeInstagramPermalink(link), link).toBe(
        'https://www.instagram.com/p/CxYz_123-ab/',
      );
    }
  });

  it('lo que no es un enlace de publicación de Instagram no tiene código y se deja tal cual', () => {
    expect(instagramShortcode('https://example.com/foto.jpg')).toBeNull();
    expect(instagramShortcode('https://www.instagram.com/ifts2/')).toBeNull();
    expect(instagramShortcode('no es un enlace')).toBeNull();
    expect(normalizeInstagramPermalink(' https://example.com/foto.jpg ')).toBe(
      'https://example.com/foto.jpg',
    );
  });

  it('compara dos enlaces por su código aunque tengan otra forma', () => {
    expect(
      samePermalink(
        'https://www.instagram.com/reel/AbCdE12/',
        'https://instagram.com/p/AbCdE12?igsh=x',
      ),
    ).toBe(true);
    expect(
      samePermalink('https://www.instagram.com/p/AbCdE12/', 'https://www.instagram.com/p/ZZZZZ99/'),
    ).toBe(false);
  });
});

describe('tipo de token y host', () => {
  it('detecta el tipo por el prefijo', () => {
    expect(detectTokenFlavor(EAA)).toBe('facebook');
    expect(detectTokenFlavor(IG)).toBe('instagram');
    expect(detectTokenFlavor('abcdef-sin-prefijo')).toBeNull();
  });

  it('token IG: usa graph.instagram.com y /me/media', async () => {
    mock.media = [{ id: 'a1', caption: 'Uno #ifts2web' }];
    const out = await client(IG).fetchRecentMedia({ hashtag: '#ifts2web' });
    expect(out.map((m) => m.id)).toEqual(['a1']);
    expect(mock.callsTo('/me/media').every((c) => c.host === 'graph.instagram.com')).toBe(true);
    expect(mock.calls.some((c) => c.host === 'graph.facebook.com')).toBe(false);
  });

  it('token EAA (de usuario): usa graph.facebook.com, resuelve la cuenta por /me/accounts y lee /{ig-user-id}/media', async () => {
    mock.media = [
      { id: 'f1', caption: 'Uno #ifts2web' },
      { id: 'f2', caption: 'Sin etiqueta' },
    ];
    const c = client(EAA);
    expect(await c.getAccountId()).toBe('ig1');
    const out = await c.fetchRecentMedia({ hashtag: '#ifts2web' });
    expect(out.map((m) => m.id)).toEqual(['f1']);
    expect(mock.callsTo('/me/accounts')).toHaveLength(1); // la cuenta se resuelve una sola vez
    expect(mock.callsTo('/ig1/media').length).toBeGreaterThan(0);
    expect(mock.calls.every((c2) => c2.host === 'graph.facebook.com')).toBe(true);
    // El token viaja como parámetro, nunca en la ruta.
    expect(mock.calls.every((c2) => !c2.path.includes(EAA))).toBe(true);
  });

  it('token EAA de Página: /me/accounts no aplica y se usa /me', async () => {
    mock.pageToken = true;
    mock.media = [{ id: 'p1', caption: '#ifts2web' }];
    const c = client(EAA);
    expect(await c.getAccountId()).toBe('ig1');
    expect((await c.fetchRecentMedia({ hashtag: '#ifts2web' })).map((m) => m.id)).toEqual(['p1']);
  });

  it('con varias Páginas con Instagram usa la primera y lo informa; igUserId elige otra', async () => {
    mock.pages = [
      { id: 'p1', name: 'Página A', ig: { id: 'ig1', username: 'cuenta_a' } },
      { id: 'p2', name: 'Página B', ig: { id: 'ig2', username: 'cuenta_b' } },
    ];
    const d = await client(EAA).diagnose();
    const identity = d.steps.find((s) => s.id === 'identity')!;
    expect(identity.status).toBe('warn');
    expect(identity.detail).toContain('@cuenta_a');
    expect(identity.detail).toContain('@cuenta_b');
    expect(await client(EAA, { igUserId: 'ig2' }).getAccountId()).toBe('ig2');
  });

  it('un token EAA sin cuenta de Instagram vinculada da un error claro (no "venció")', async () => {
    mock.pages = [{ id: 'p1', name: 'Página sin Instagram' }];
    const err = (await client(EAA)
      .getAccountId()
      .catch((e: unknown) => e)) as InstagramApiError;
    expect(err).toBeInstanceOf(InstagramApiError);
    expect(err.tokenInvalid).toBe(false);
    expect(err.message).toMatch(/no ve ninguna cuenta de Instagram profesional/);
    expect(err.message).toMatch(/instagram_basic/);
  });

  it('prefijo no concluyente: prueba Instagram y, ante 190 «Cannot parse», reintenta con Facebook', async () => {
    mock.unknownTokenHost = 'graph.facebook.com';
    mock.media = [{ id: 'u1', caption: '#ifts2web' }];
    const c = client('token-sin-prefijo-conocido-123456');
    expect((await c.fetchRecentMedia({ hashtag: '#ifts2web' })).map((m) => m.id)).toEqual(['u1']);
    const hosts = mock.calls.map((x) => x.host);
    expect(hosts[0]).toBe('graph.instagram.com'); // primero el esperado
    expect(hosts).toContain('graph.facebook.com');
    // Ya sabe cuál es: la segunda consulta no vuelve a probar el otro host.
    mock.calls = [];
    await c.getAccountId();
    expect(mock.calls.every((x) => x.host === 'graph.facebook.com')).toBe(true);
  });

  it('prefijo no concluyente que sí es de Instagram: una sola llamada, sin reintentos', async () => {
    mock.media = [{ id: 'u1', caption: '#ifts2web' }];
    await client('token-sin-prefijo-conocido-123456').fetchRecentMedia({ hashtag: '#ifts2web' });
    expect(mock.calls.every((x) => x.host === 'graph.instagram.com')).toBe(true);
  });

  it('un token inválido de verdad falla con el error del host esperado (no se oculta tras el reintento)', async () => {
    mock.mediaError = {
      status: 400,
      body: {
        error: { message: 'Error validating access token', type: 'OAuthException', code: 190 },
      },
    };
    const err = (await client('token-sin-prefijo-conocido-123456')
      .fetchRecentMedia()
      .catch((e: unknown) => e)) as InstagramApiError;
    expect(err.tokenInvalid).toBe(true);
  });
});

describe('hashtag público (solo Facebook Login)', () => {
  it('suma las publicaciones públicas del hashtag sin duplicar las propias', async () => {
    mock.media = [{ id: 'own1', caption: 'Propia #ifts2web' }];
    mock.hashtagMedia = [
      { id: 'own1', caption: 'Propia #ifts2web' },
      { id: 'pub1', caption: 'De otra cuenta #ifts2web' },
    ];
    const warnings: string[] = [];
    const out = await client(EAA).fetchRecentMedia({
      hashtag: '#ifts2web',
      onWarning: (w) => warnings.push(w),
    });
    expect(out.map((m) => m.id).sort()).toEqual(['own1', 'pub1']);
    expect(warnings).toEqual([]);
    expect(mock.callsTo('/ig_hashtag_search')[0]!.query.get('q')).toBe('ifts2web');
  });

  it('si falta el permiso de contenido público avisa y NO rompe la sincronización de la cuenta', async () => {
    mock.media = [{ id: 'own1', caption: 'Propia #ifts2web' }];
    mock.hashtagError = {
      status: 400,
      body: {
        error: {
          message: '(#10) Application does not have permission for this action',
          type: 'OAuthException',
          code: 10,
        },
      },
    };
    const warnings: string[] = [];
    const out = await client(EAA).fetchRecentMedia({
      hashtag: '#ifts2web',
      onWarning: (w) => warnings.push(w),
    });
    expect(out.map((m) => m.id)).toEqual(['own1']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Instagram Public Content Access/);
  });

  it('con token de Instagram no se intenta la búsqueda de hashtags (no existe en esa API)', async () => {
    mock.media = [{ id: 'own1', caption: '#ifts2web' }];
    await client(IG).fetchRecentMedia({ hashtag: '#ifts2web' });
    expect(mock.callsTo('/ig_hashtag_search')).toHaveLength(0);
  });
});

describe('findMediaByPermalink (carga manual por enlace)', () => {
  beforeEach(() => {
    mock.pageSize = 2;
    mock.media = Array.from({ length: 5 }, (_, i) => ({
      id: `Post${i}ABC`,
      caption: `Texto ${i}`,
    }));
  });

  it('encuentra la publicación en cualquier página, aunque peguen /reel/ y ?igsh=', async () => {
    for (const flavor of [IG, EAA]) {
      const found = await client(flavor).findMediaByPermalink(
        'https://www.instagram.com/reel/Post4ABC/?igsh=MWx0',
      );
      expect(found?.id).toBe('Post4ABC');
      expect(found?.caption).toBe('Texto 4');
      expect(found?.mediaUrl).toContain('/img/Post4ABC.jpg');
    }
  });

  it('devuelve null si no está entre las recientes (no raspa instagram.com)', async () => {
    expect(
      await client(IG).findMediaByPermalink('https://www.instagram.com/p/NoExiste99/'),
    ).toBeNull();
    expect(mock.calls.every((c) => c.host !== 'www.instagram.com')).toBe(true);
  });

  it('un token inválido propaga el error (la carga manual lo informa sin romperse)', async () => {
    mock.mediaError = {
      status: 400,
      body: { error: { message: 'x', type: 'OAuthException', code: 190 } },
    };
    await expect(
      client(IG).findMediaByPermalink('https://www.instagram.com/p/Post1ABC/'),
    ).rejects.toBeInstanceOf(InstagramApiError);
  });
});

describe('diagnose (Probar conexión)', () => {
  it('token IG correcto: token, cuenta y lectura en verde', async () => {
    mock.media = [{ id: 'a1', caption: 'Uno #ifts2web' }];
    const d = await client(IG).diagnose('#ifts2web');
    expect(d.ok).toBe(true);
    expect(d.username).toBe('cuenta_simulada');
    expect(d.steps.map((s) => [s.id, s.status])).toEqual([
      ['token', 'ok'],
      ['identity', 'ok'],
      ['media', 'ok'],
      ['hashtag', 'ok'],
    ]);
  });

  it('token EAA: informa que se usa graph.facebook.com y la Página vinculada', async () => {
    mock.media = [{ id: 'f1', caption: '#ifts2web' }];
    const d = await client(EAA).diagnose('#ifts2web');
    expect(d.ok).toBe(true);
    expect(d.steps.find((s) => s.id === 'token')!.detail).toMatch(/graph\.facebook\.com/);
    expect(d.steps.find((s) => s.id === 'identity')!.detail).toContain('Página del instituto');
    expect(d.steps.find((s) => s.id === 'hashtag')!.detail).toMatch(/búsqueda pública/i);
  });

  it('hashtag que no aparece en las publicaciones: aviso, no falla la conexión', async () => {
    mock.media = [{ id: 'a1', caption: 'Sin etiqueta' }];
    const d = await client(IG).diagnose('#ifts2web');
    expect(d.ok).toBe(true);
    expect(d.steps.find((s) => s.id === 'hashtag')!.status).toBe('warn');
  });

  it('falla en el paso 3 (lectura): informa el código de Meta y deja el resto sin probar, sin el token', async () => {
    // Solo falla la lectura de publicaciones: el token y la cuenta están bien.
    mock.listError = {
      status: 400,
      body: {
        error: {
          message: '(#10) Permission denied',
          type: 'OAuthException',
          code: 10,
          fbtrace_id: 'Tr4ce',
        },
      },
    };
    const d = await client(IG).diagnose('#ifts2web');
    expect(d.ok).toBe(false);
    const failed = d.steps.find((s) => s.status === 'fail')!;
    expect(failed.detail).toMatch(/código 10/);
    expect(JSON.stringify(d)).not.toContain(IG);
    expect(d.steps.filter((s) => s.status === 'skipped').length).toBeGreaterThan(0);
  });

  it('token inválido (190): falla el paso del token con el detalle de Meta', async () => {
    mock.accountError = {
      status: 400,
      body: {
        error: {
          message: 'Invalid OAuth access token - Cannot parse access token',
          type: 'OAuthException',
          code: 190,
        },
      },
    };
    mock.mediaError = null;
    const d = await client(IG).diagnose();
    expect(d.ok).toBe(false);
    expect(d.steps[0]).toMatchObject({ id: 'token', status: 'fail' });
    expect(d.steps[0]!.detail).toMatch(/código 190/);
    expect(d.steps[0]!.detail).toMatch(/Cannot parse access token/);
  });

  it('token con espacios o saltos de línea: lo dice antes de llamar a Meta', async () => {
    const d = await client('IGAA-token con espacio\n').diagnose();
    expect(d.ok).toBe(false);
    expect(d.steps[0]!.detail).toMatch(/espacios/);
    expect(mock.calls).toHaveLength(0);
  });

  it('sin token cargado: el primer paso falla con el aviso de configuración', async () => {
    const d = await new GraphInstagramClient({ method: 'token', fetchFn: mock.fetch }).diagnose();
    expect(d.ok).toBe(false);
    expect(d.steps[0]!.status).toBe('fail');
  });
});

describe('renovación del token de Facebook', () => {
  it('fb_exchange_token con App ID y Secret devuelve un token con su vencimiento', async () => {
    const grant = await refreshFacebookToken(
      { appId: '123', appSecret: 'secreto-app', accessToken: EAA },
      mock.fetch,
      () => 1_000,
    );
    expect(grant.accessToken).toBe('EAA-larga-duracion');
    expect(grant.expiresAt.getTime()).toBe(1_000 + mock.expiresIn * 1000);
    const call = mock.callsTo('/oauth/access_token')[0]!;
    expect(call.host).toBe('graph.facebook.com');
    expect(call.query.get('grant_type')).toBe('fb_exchange_token');
    expect(call.query.get('fb_exchange_token')).toBe(EAA);
  });
});
