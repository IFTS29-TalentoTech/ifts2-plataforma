/** ADR-09: Instagram detrás de una interfaz. Nunca se publica nada sin aprobación humana. */
export interface InstagramMedia {
  id: string; // se guarda como SocialPost.externalId (único: sincronizar dos veces no duplica)
  caption: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl: string;
  permalink: string;
  timestamp: string; // ISO
}

export interface ConnectionTest {
  ok: boolean;
  username?: string;
  error?: string;
}

export interface InstagramClient {
  readonly kind: 'fake' | 'graph';
  /** Publicaciones recientes de la cuenta conectada (el filtro por hashtag lo aplica el servicio de sync). */
  fetchRecentMedia(opts?: { limit?: number }): Promise<InstagramMedia[]>;
  testConnection(): Promise<ConnectionTest>;
}

/** Se lanza cuando faltan credenciales o la cuenta no está conectada. La API lo traduce a 502/422 claro. */
export class InstagramNotConfiguredError extends Error {
  constructor(
    message = 'Instagram no está configurado: faltan credenciales o conectar la cuenta.',
  ) {
    super(message);
    this.name = 'InstagramNotConfiguredError';
  }
}
