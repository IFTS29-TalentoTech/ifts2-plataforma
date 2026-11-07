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
  /**
   * Sincronización incremental: no traer publicaciones MÁS VIEJAS que este instante (ISO). Instagram
   * devuelve las más nuevas primero, así que el cliente corta la paginación al llegar a una más vieja.
   * Sin `since` se hace la carga completa (hasta `limit` / el tope de páginas).
   */
  since?: string;
  /**
   * Se llama una vez al terminar el recorrido con cuánto del listado se cubrió. Es un canal aparte para
   * no cambiar el tipo de retorno (un arreglo). Ver `FetchCoverage`.
   */
  onCoverage?: (coverage: FetchCoverage) => void;
}

/** Hasta dónde llegó un recorrido de `fetchRecentMedia`. Lo usa el servicio para decidir la próxima cota. */
export interface FetchCoverage {
  /**
   * `true` si se vio TODO lo posterior a `since` (o todo el listado): se llegó al final de la lista o a
   * una publicación más vieja que `since`. `false` si se cortó antes por `limit` o por el tope de páginas.
   */
  complete: boolean;
  /** Fecha (ISO) de la publicación más vieja examinada (con o sin hashtag), o `null` si no vio ninguna. */
  oldestScanned: string | null;
}

export interface InstagramClient {
  readonly kind: 'fake' | 'graph';
  /**
   * Publicaciones recientes de la cuenta conectada, de la más nueva a la más vieja.
   * Con `hashtag` filtra por leyenda; el servicio de sincronización vuelve a filtrar por seguridad.
   */
  fetchRecentMedia(opts?: FetchMediaOptions): Promise<InstagramMedia[]>;
  testConnection(): Promise<ConnectionTest>;
  /**
   * Id de usuario de la cuenta conectada (no secreto), con una llamada liviana (`/me?fields=id`). Sirve
   * para detectar que se cambió de cuenta y entonces hacer una carga completa (ADR-038).
   */
  getAccountId(): Promise<string>;
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
