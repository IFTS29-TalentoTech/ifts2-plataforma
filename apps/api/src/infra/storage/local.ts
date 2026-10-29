import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hmac, safeEqual } from '../crypto';
import type { PutInput, StorageProvider } from './types';

const META_SUFFIX = '.meta';

/**
 * Almacenamiento en disco (`uploads/`). Las URLs firmadas apuntan a
 * `GET <API_ORIGIN>/api/v1/files/<key>?exp=<unix>&sig=<hmac>` (módulo `files`).
 */
export class LocalDiskStorage implements StorageProvider {
  readonly kind = 'local' as const;
  private readonly root: string;

  constructor(
    dir: string,
    private readonly signingSecret: string,
    private readonly apiOrigin: string,
    private readonly defaultTtl = 300,
  ) {
    this.root = path.resolve(dir);
  }

  /** Resuelve la clave a una ruta dentro de `root`; rechaza intentos de salir del directorio. */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep))
      throw new Error('Clave de almacenamiento no válida.');
    return full;
  }

  async put({ key, body, contentType }: PutInput) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(file + META_SUFFIX, contentType);
  }

  sign(key: string, exp: number): string {
    return hmac(this.signingSecret, `${key}:${exp}`);
  }

  /** Verifica una firma recibida (la usa el módulo `files`). */
  verify(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    return safeEqual(this.sign(key, exp), sig);
  }

  async getSignedUrl(key: string, ttlSeconds = this.defaultTtl) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.sign(key, exp);
    return `${this.apiOrigin}/api/v1/files/${key}?exp=${exp}&sig=${sig}`;
  }

  async get(key: string) {
    try {
      const file = this.resolve(key);
      const [body, ct] = await Promise.all([
        readFile(file),
        readFile(file + META_SUFFIX, 'utf8').catch(() => 'application/octet-stream'),
      ]);
      return { body, contentType: ct };
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    const file = this.resolve(key);
    await rm(file, { force: true });
    await rm(file + META_SUFFIX, { force: true });
  }

  async exists(key: string) {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
