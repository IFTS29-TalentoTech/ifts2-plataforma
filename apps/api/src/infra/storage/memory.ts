import type { PutInput, StorageProvider } from './types';

/** Almacenamiento en memoria: para pruebas (el doble de StorageProvider). */
export class InMemoryStorage implements StorageProvider {
  readonly kind = 'memory' as const;
  readonly files = new Map<string, { body: Buffer; contentType: string }>();

  async put({ key, body, contentType }: PutInput) {
    this.files.set(key, { body, contentType });
  }
  async getSignedUrl(key: string, ttlSeconds = 300) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `memory://${encodeURIComponent(key)}?exp=${exp}`;
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async remove(key: string) {
    this.files.delete(key);
  }
  async exists(key: string) {
    return this.files.has(key);
  }
}
