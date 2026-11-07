import { describe, expect, it, vi } from 'vitest';
import { isSitePath, isStorageKey, resolveCoverSrc } from '../../src/lib/cover';
import type { StorageProvider } from '../../src/infra/storage';

/** Portadas: http(s), ruta propia del sitio (/img/...) o clave del almacenamiento. */
describe('lib/cover', () => {
  it('distingue rutas del sitio, direcciones web y claves del almacenamiento', () => {
    expect(isSitePath('/img/provisorio/x.webp')).toBe(true);
    expect(isSitePath('//otro.host/x.webp')).toBe(false);
    expect(isStorageKey('/img/provisorio/x.webp')).toBe(false);
    expect(isStorageKey('https://cdn.example.org/x.webp')).toBe(false);
    expect(isStorageKey('social/uuid.webp')).toBe(true);
    expect(isStorageKey(null)).toBe(false);
  });

  it('una ruta del sitio se devuelve tal cual, sin pedir una URL firmada', async () => {
    const storage = { getSignedUrl: vi.fn() } as unknown as StorageProvider;
    expect(await resolveCoverSrc(storage, '/img/provisorio/x.webp')).toBe('/img/provisorio/x.webp');
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });
});
