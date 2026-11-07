import { decryptJson, encryptJson } from './crypto';
import type { Db } from './prisma';

/**
 * Configuración de integraciones que carga el cliente desde el panel (ADR-20).
 * Se guarda en `IntegrationConfig.valueEnc` como JSON cifrado con AES-256-GCM (APP_ENCRYPTION_KEY).
 * Nada de esto sale en claro de la API: solo máscaras y estados.
 */
export interface InstagramStoredConfig {
  mode: 'demo' | 'real';
  /**
   * Cómo se conecta la cuenta: `oauth` (App ID + Secret + inicio de sesión de Meta) o `token` (se pega un
   * token de acceso y no hacen falta App ID ni Secret). Si falta se asume `oauth` (configuraciones viejas).
   */
  connectionMethod?: 'oauth' | 'token';
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  tokenExpiresAt?: string; // ISO
  username?: string;
  connectedAt?: string; // ISO
  lastError?: string | null;
}

/**
 * Estado de la sincronización incremental de Instagram (ADR-038). Se guarda aparte de `instagram` para
 * que ni "Guardar configuración" ni "Desconectar" lo pisen, y porque en modo demostración no existe la
 * fila `instagram`. No contiene secretos: solo fechas, un conteo, el id de la cuenta y la configuración con la que se sincronizó.
 */
export interface InstagramSyncState {
  /** Cuándo terminó el último fetch EXITOSO (ISO). Es lo que se muestra en el panel. */
  lastFetchAt: string;
  /** Instante (ISO) hasta el cual ya se vio todo lo publicado: de acá parte la próxima incremental. */
  coveredUntil: string;
  /** Tipo del último fetch exitoso. */
  mode: 'incremental' | 'full';
  /** Publicaciones con el hashtag que trajo ese fetch. */
  count: number;
  /** Id de usuario de Instagram (Graph `/me?fields=id`) de la cuenta sincronizada. No es un secreto. */
  accountId: string;
  /** Hashtag normalizado con el que se sincronizó. */
  hashtag: string;
  /** Método de conexión ('oauth' | 'token') o 'demo'. Si cambia o cambia la cuenta o el hashtag, la próxima es completa. */
  connection: string;
}

export interface MailStoredConfig {
  contactToEmail?: string;
  smtpUrl?: string;
}

export interface StoredConfigs {
  instagram: InstagramStoredConfig;
  instagram_sync: InstagramSyncState;
  mail: MailStoredConfig;
}
export type IntegrationName = keyof StoredConfigs;

export class IntegrationStore {
  constructor(
    private readonly db: Db,
    private readonly key: Buffer,
  ) {}

  async get<N extends IntegrationName>(name: N): Promise<StoredConfigs[N] | null> {
    const row = await this.db.integrationConfig.findUnique({ where: { key: name } });
    if (!row) return null;
    try {
      return decryptJson<StoredConfigs[N]>(row.valueEnc, this.key);
    } catch {
      // Clave de cifrado distinta o dato alterado: se trata como "sin configurar".
      return null;
    }
  }

  async set<N extends IntegrationName>(name: N, value: StoredConfigs[N], userId?: string | null) {
    const valueEnc = encryptJson(value, this.key);
    await this.db.integrationConfig.upsert({
      where: { key: name },
      create: { key: name, valueEnc, updatedBy: userId ?? null },
      update: { valueEnc, updatedBy: userId ?? null },
    });
  }

  /** Actualiza combinando con lo guardado. */
  async patch<N extends IntegrationName>(
    name: N,
    patch: Partial<StoredConfigs[N]>,
    userId?: string | null,
  ) {
    const current = (await this.get(name)) ?? ({} as StoredConfigs[N]);
    const next = { ...current, ...patch } as StoredConfigs[N];
    await this.set(name, next, userId);
    return next;
  }

  async remove(name: IntegrationName) {
    await this.db.integrationConfig.deleteMany({ where: { key: name } });
  }
}
