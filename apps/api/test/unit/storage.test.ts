import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { AppError } from '../../src/infra/errors';
import {
  InMemoryStorage,
  LocalDiskStorage,
  sanitizeFilename,
  sniffMime,
  storeUpload,
} from '../../src/infra/storage';

const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(100, 0x20)]);
const png = () =>
  sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#8D775F' } })
    .png()
    .toBuffer();

const thrown = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('no lanzó');
};

describe('sniffMime (firma del archivo)', () => {
  it('reconoce PDF, JPEG, PNG y WebP', async () => {
    expect(sniffMime(pdf)).toBe('application/pdf');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(sniffMime(await png())).toBe('image/png');
    const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
      .webp()
      .toBuffer();
    expect(sniffMime(webp)).toBe('image/webp');
  });
  it('rechaza ejecutables y texto', () => {
    expect(sniffMime(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(sniffMime(Buffer.from('<?php echo 1;'))).toBeNull();
  });
});

describe('storeUpload', () => {
  it('guarda un PDF con clave aleatoria (no el nombre original)', async () => {
    const storage = new InMemoryStorage();
    const f = await storeUpload(storage, {
      buffer: pdf,
      originalName: '../../Cronograma mesas.pdf',
    });
    expect(f.mimeType).toBe('application/pdf');
    expect(f.key).toMatch(/^files\/[0-9a-f-]{36}\.pdf$/);
    expect(f.filename).toBe('Cronograma mesas.pdf');
    expect(await storage.exists(f.key)).toBe(true);
  });

  it('redimensiona imágenes a 1600 px como máximo y las convierte a WebP', async () => {
    const storage = new InMemoryStorage();
    const f = await storeUpload(storage, { buffer: await png(), originalName: 'foto.png' });
    expect(f.mimeType).toBe('image/webp');
    expect(f.filename).toBe('foto.webp');
    const meta = await sharp((await storage.get(f.key))!.body).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
  });

  it('rechaza un tipo no permitido aunque el nombre diga .pdf (415)', async () => {
    const e = await thrown(
      storeUpload(new InMemoryStorage(), {
        buffer: Buffer.from('MZ-ejecutable'),
        originalName: 'virus.pdf',
      }),
    );
    expect(e.status).toBe(415);
  });

  it('rechaza un PDF de más de 10 MB (413)', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const e = await thrown(
      storeUpload(new InMemoryStorage(), { buffer: big, originalName: 'a.pdf' }),
    );
    expect(e.status).toBe(413);
  });

  it('rechaza una imagen de más de 5 MB (413)', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)]);
    const e = await thrown(
      storeUpload(new InMemoryStorage(), { buffer: big, originalName: 'a.jpg' }),
    );
    expect(e.status).toBe(413);
  });
});

describe('sanitizeFilename', () => {
  it('quita rutas, acentos y caracteres peligrosos', () => {
    expect(sanitizeFilename('C:\\x\\Resolución N°1202.pdf')).toBe('Resolucion N_1202.pdf');
    expect(sanitizeFilename('')).toBe('archivo');
  });
});

describe('LocalDiskStorage', () => {
  let dir = '';
  afterAll(async () => dir && (await rm(dir, { recursive: true, force: true })));

  it('guarda, firma la URL, verifica y rechaza firmas vencidas o alteradas', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ifts2-'));
    const s = new LocalDiskStorage(dir, 'secreto', 'http://localhost:4000');
    await s.put({ key: 'files/a.pdf', body: pdf, contentType: 'application/pdf' });
    expect((await s.get('files/a.pdf'))?.contentType).toBe('application/pdf');

    const url = new URL(await s.getSignedUrl('files/a.pdf', 60));
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;
    expect(s.verify('files/a.pdf', exp, sig)).toBe(true);
    expect(s.verify('files/b.pdf', exp, sig)).toBe(false);
    expect(s.verify('files/a.pdf', exp, sig + 'x')).toBe(false);
    expect(s.verify('files/a.pdf', 1, s.sign('files/a.pdf', 1))).toBe(false); // vencida

    await s.remove('files/a.pdf');
    expect(await s.exists('files/a.pdf')).toBe(false);
  });

  it('no permite salir del directorio con ../', async () => {
    dir ||= await mkdtemp(path.join(os.tmpdir(), 'ifts2-'));
    const s = new LocalDiskStorage(dir, 'secreto', 'http://localhost:4000');
    await expect(s.put({ key: '../fuera.txt', body: pdf, contentType: 'x' })).rejects.toThrow();
  });
});
