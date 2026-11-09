/**
 * Imágenes que no tienen una firma JPG/PNG/WebP pero sharp sabe leer (GIF, TIFF, AVIF/HEIC): se aceptan y se
 * reconvierten a WebP. HTML (un enlace a una página pegado como imagen), SVG y texto se rechazan.
 * Reproduce el error "La imagen de la publicación no se puede usar" de la carga manual.
 */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/infra/errors';
import { InMemoryStorage, looksLikeHtml, storeUpload } from '../../src/infra/storage';

const base = () => sharp({ create: { width: 80, height: 60, channels: 3, background: '#8D775F' } });

const thrown = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('se esperaba un error');
};

describe('storeUpload con formatos sin firma conocida', () => {
  it('acepta TIFF y lo guarda como WebP', async () => {
    const storage = new InMemoryStorage();
    const stored = await storeUpload(
      storage,
      { buffer: await base().tiff().toBuffer(), originalName: 'x.tif' },
      'social',
    );
    expect(stored.mimeType).toBe('image/webp');
    expect(stored.key).toMatch(/^social\/.+\.webp$/);
  });

  it('acepta AVIF (HEIF) si el build de sharp lo codifica', async () => {
    let avif: Buffer;
    try {
      avif = await base().avif().toBuffer();
    } catch {
      return; // este build de sharp no escribe AVIF: no hay nada que probar
    }
    const stored = await storeUpload(
      new InMemoryStorage(),
      { buffer: avif, originalName: 'x.avif' },
      'social',
    );
    expect(stored.mimeType).toBe('image/webp');
  });

  it('rechaza HTML, SVG y texto con 415', async () => {
    const storage = new InMemoryStorage();
    for (const body of [
      '<!DOCTYPE html><html><body>Instagram</body></html>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>',
      'esto no es una imagen',
    ]) {
      const e = await thrown(
        storeUpload(storage, { buffer: Buffer.from(body), originalName: 'x.jpg' }, 'social'),
      );
      expect(e.code).toBe('unsupported-media-type');
    }
  });

  it('una imagen de más de 5 MB sigue dando 413', async () => {
    const jpeg = await base().jpeg().toBuffer();
    const big = Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024 + 1)]);
    const e = await thrown(
      storeUpload(new InMemoryStorage(), { buffer: big, originalName: 'x.jpg' }, 'social'),
    );
    expect(e.code).toBe('payload-too-large');
  });
});

describe('looksLikeHtml', () => {
  it('reconoce una página web aunque tenga espacios o mayúsculas, y no confunde una imagen', async () => {
    expect(looksLikeHtml(Buffer.from('  \n<!DOCTYPE HTML><html>'))).toBe(true);
    expect(looksLikeHtml(Buffer.from('<html lang="es">'))).toBe(true);
    expect(looksLikeHtml(await base().jpeg().toBuffer())).toBe(false);
    expect(looksLikeHtml(Buffer.from('texto plano'))).toBe(false);
  });
});
