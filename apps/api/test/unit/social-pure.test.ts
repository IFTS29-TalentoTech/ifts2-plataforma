/** Pruebas unitarias (sin base): filtro por hashtag, textos derivados, SSRF y regla de renovación del token. */
import { describe, expect, it } from 'vitest';
import { captionHasHashtag, normalizeHashtag } from '../../src/infra/instagram';
import { assertPublicHttpUrl, MediaDownloadError } from '../../src/infra/media-download';
import {
  deriveBody,
  deriveSummary,
  deriveTitle,
  stripHashtags,
} from '../../src/modules/social/caption';
import { REFRESH_WHEN_DAYS_LEFT, shouldRefresh } from '../../src/modules/social/token.service';

describe('captionHasHashtag (RF04: filtro por hashtag configurable)', () => {
  const tag = '#ifts2web';

  it('encuentra el hashtag en cualquier parte de la leyenda', () => {
    expect(captionHasHashtag('Jornada en Lugano #ifts2web', tag)).toBe(true);
    expect(captionHasHashtag('#ifts2web Jornada en Lugano', tag)).toBe(true);
    expect(captionHasHashtag('Línea uno\nLínea dos #ifts2web\n#otro', tag)).toBe(true);
  });

  it('no distingue mayúsculas, acentos ni si el configurado lleva o no el #', () => {
    expect(captionHasHashtag('Hola #IFTS2Web', tag)).toBe(true);
    expect(captionHasHashtag('Hola #ifts2web', 'IFTS2WEB')).toBe(true);
    expect(captionHasHashtag('Mateada #Educación', '#educacion')).toBe(true);
    expect(captionHasHashtag('Mateada #educacion', '#EDUCACIÓN')).toBe(true);
  });

  it('exige el hashtag COMPLETO: no coincide con prefijos ni sufijos', () => {
    expect(captionHasHashtag('Hola #ifts2web2024', tag)).toBe(false);
    expect(captionHasHashtag('Hola #ifts2webs', tag)).toBe(false);
    expect(captionHasHashtag('Hola #nuevo_ifts2web', tag)).toBe(false);
    expect(captionHasHashtag('Hola #ifts2', tag)).toBe(false);
  });

  it('termina el hashtag en signos de puntuación', () => {
    expect(captionHasHashtag('Gracias #ifts2web.', tag)).toBe(true);
    expect(captionHasHashtag('Gracias (#ifts2web), saludos', tag)).toBe(true);
    expect(captionHasHashtag('Gracias #ifts2web, #otro', tag)).toBe(true);
  });

  it('no cuenta si no tiene # o si está pegado a otra palabra', () => {
    expect(captionHasHashtag('Visitá ifts2web hoy', tag)).toBe(false);
    expect(captionHasHashtag('mail@ifts2web.com', tag)).toBe(false);
    expect(captionHasHashtag('ab#ifts2web', tag)).toBe(false);
  });

  it('casos vacíos y caracteres especiales de regex en el hashtag configurado', () => {
    expect(captionHasHashtag('', tag)).toBe(false);
    expect(captionHasHashtag(null, tag)).toBe(false);
    expect(captionHasHashtag('Hola #ifts2web', '')).toBe(false);
    expect(captionHasHashtag('Hola #ifts2web', '#')).toBe(false);
    expect(captionHasHashtag('Hola #axb', '#a.b')).toBe(false); // el punto no actúa como comodín de regex
    expect(normalizeHashtag('  ##Hola ')).toBe('hola');
  });
});

describe('textos derivados de la leyenda', () => {
  const caption =
    'Jornada gastronómica en sede Lugano. Actividades de las prácticas profesionalizantes. #ifts2web #cocina';

  it('stripHashtags quita hashtags y menciones', () => {
    expect(stripHashtags('Hola @ifts2 mundo #ifts2web fin')).toBe('Hola mundo fin');
  });

  it('el título es la primera oración, sin hashtags y con tope de 160', () => {
    expect(deriveTitle(caption)).toBe('Jornada gastronómica en sede Lugano');
    expect(deriveTitle('x'.repeat(300)).length).toBeLessThanOrEqual(160);
    expect(deriveTitle('#ifts2web')).toBe('Publicación de Instagram');
  });

  it('el resumen tiene tope de 400 y el cuerpo conserva los párrafos', () => {
    expect(deriveSummary('palabra '.repeat(200)).length).toBeLessThanOrEqual(400);
    expect(deriveBody('Uno #ifts2web\n\n\n\nDos')).toBe('Uno\n\nDos');
  });
});

describe('assertPublicHttpUrl (evita SSRF al copiar imágenes)', () => {
  it('acepta direcciones públicas http(s)', () => {
    expect(assertPublicHttpUrl('https://scontent.cdninstagram.com/a.jpg').hostname).toBe(
      'scontent.cdninstagram.com',
    );
  });
  it.each([
    'ftp://example.com/a.jpg',
    'file:///etc/passwd',
    'http://localhost/a.jpg',
    'http://127.0.0.1:4000/a',
    'http://10.0.0.5/a',
    'http://192.168.1.10/a',
    'http://172.16.0.1/a',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/a',
    'http://intranet/a',
    'https://servicio.local/a',
    'no es una url',
  ])('rechaza %s', (u) => {
    expect(() => assertPublicHttpUrl(u)).toThrow(MediaDownloadError);
  });
});

describe('shouldRefresh (renovación del token a los ~50 días)', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

  it('renueva cuando faltan 10 días o menos', () => {
    expect(REFRESH_WHEN_DAYS_LEFT).toBe(10);
    expect(shouldRefresh(inDays(10), now)).toBe(true);
    expect(shouldRefresh(inDays(3), now)).toBe(true);
  });
  it('no renueva si falta más de 10 días', () => {
    expect(shouldRefresh(inDays(10.01), now)).toBe(false);
    expect(shouldRefresh(inDays(59), now)).toBe(false);
  });
  it('si no se conoce el vencimiento intenta renovar', () => {
    expect(shouldRefresh(null, now)).toBe(true);
  });
});
