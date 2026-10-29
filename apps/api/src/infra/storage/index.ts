import type { AppConfig } from '../../config';
import { LocalDiskStorage } from './local';
import { InMemoryStorage } from './memory';
import { S3Storage } from './s3';
import type { StorageProvider } from './types';

export * from './types';
export { LocalDiskStorage, InMemoryStorage, S3Storage };
export { storeUpload, sniffMime, sanitizeFilename } from './upload';

/** Fábrica por entorno (STORAGE_PROVIDER). La validación de variables faltantes la hace loadConfig. */
export function createStorage(config: AppConfig): StorageProvider {
  const s = config.storage;
  switch (s.provider) {
    case 'memory':
      return new InMemoryStorage();
    case 's3':
      return new S3Storage(
        {
          endpoint: s.s3.endpoint,
          bucket: s.s3.bucket!,
          accessKeyId: s.s3.accessKeyId!,
          secretAccessKey: s.s3.secretAccessKey!,
          region: s.s3.region,
          publicUrl: s.s3.publicUrl,
          forcePathStyle: s.s3.forcePathStyle || undefined,
        },
        s.signedUrlTtlSeconds,
      );
    case 'local':
    default:
      return new LocalDiskStorage(s.localDir, s.signingSecret, config.apiOrigin, s.signedUrlTtlSeconds);
  }
}
