import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PutInput, StorageProvider } from './types';

export interface S3Options {
  endpoint?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Si existe, las imágenes públicas se sirven desde este CDN/URL pública. */
  publicUrl?: string;
  forcePathStyle?: boolean;
}

/**
 * Almacenamiento compatible con S3: Supabase Storage (endpoint S3), Cloudflare R2, MinIO, AWS S3.
 * No se probó contra un servicio real en la fundación (sin credenciales): ver docs/avance.md.
 */
export class S3Storage implements StorageProvider {
  readonly kind = 's3' as const;
  private readonly client: S3Client;

  constructor(
    private readonly opts: S3Options,
    private readonly defaultTtl = 300,
  ) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle ?? !!opts.endpoint,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async put({ key, body, contentType }: PutInput) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getSignedUrl(key: string, ttlSeconds = this.defaultTtl) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  /** URL pública/CDN (para imágenes de portada) si está configurada. */
  publicUrl(key: string): string | null {
    return this.opts.publicUrl ? `${this.opts.publicUrl.replace(/\/$/, '')}/${key}` : null;
  }

  async get(key: string) {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        body: Buffer.from(bytes),
        contentType: res.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
