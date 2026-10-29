/** ADR-08: almacenamiento detrás de una interfaz. Se elige con STORAGE_PROVIDER (local | memory | s3). */
export interface PutInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageProvider {
  readonly kind: 'local' | 'memory' | 's3';
  put(input: PutInput): Promise<void>;
  /** URL de descarga con vencimiento corto (o URL pública/CDN si el proveedor la define). */
  getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
  /** Contenido del archivo (para copiar imágenes de Instagram, pruebas, etc.). */
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
