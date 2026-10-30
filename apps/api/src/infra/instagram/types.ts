/** ADR-09: Instagram detrás de una interfaz. Nunca se publica nada sin aprobación humana. */
export interface InstagramMedia {
  id: string; // se guarda como SocialPost.externalId (único: sincronizar dos veces no duplica)
  caption: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  /** Imagen a copiar al aprobar. Para videos es la miniatura (`thumbnail_url`). Expira en horas/días. */
  mediaUrl: string;
  permalink: string;
  timestamp: string; // ISO
}

export interface ConnectionTest {
  ok: boolean;
  username?: string;
  error?: string;
}

export interface FetchMediaOptions {
  /** Máximo de publicaciones a devolver (después de filtrar por hashtag). Por defecto 50. */
  limit?: number;
  /** Si se indica, solo se devuelven las que lo contienen en la leyenda (RF04). */
  hashtag?: string;
}

export interface InstagramClient {
  readonly kind: 'fake' | 'graph';
  /**
   * Publicaciones recientes de la cuenta conectada, de la más nueva a la más vieja.
   * Con `hashtag` filtra por leyenda; el servicio de sincronización vuelve a filtrar por seguridad.
   */
  fetchRecentMedia(opts?: FetchMediaOptions): Promise<InstagramMedia[]>;
  testConnection(): Promise<ConnectionTest>;
}

/** Se lanza cuando faltan credenciales o la cuenta no está conectada. La API lo traduce a 422 claro. */
export class InstagramNotConfiguredError extends Error {
  constructor(
    message = 'Instagram no está configurado: faltan credenciales o conectar la cuenta.',
  ) {
    super(message);
    this.name = 'InstagramNotConfiguredError';
  }
}

/**
 * La API de Instagram respondió con un error o no se pudo contactar. El mensaje ya está en español y
 * NUNCA incluye el token. `tokenInvalid` indica token vencido/revocado (hay que reconectar la cuenta).
 */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly opts: { status?: number; code?: number; tokenInvalid?: boolean } = {},
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }
  get status() {
    return this.opts.status;
  }
  get tokenInvalid() {
    return this.opts.tokenInvalid ?? false;
  }
}
