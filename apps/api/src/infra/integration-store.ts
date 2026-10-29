import { decryptJson, encryptJson } from './crypto';
import type { Db } from './prisma';

/**
 * Configuración de integraciones que carga el cliente desde el panel (ADR-20).
 * Se guarda en `IntegrationConfig.valueEnc` como JSON cifrado con AES-256-GCM (APP_ENCRYPTION_KEY).
 * Nada de esto sale en claro de la API: solo máscaras y estados.
 */
export interface InstagramStoredConfig {
  mode: 'demo' | 'real';
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  tokenExpiresAt?: string; // ISO
  username?: string;
  connectedAt?: string; // ISO
  lastError?: string | null;
}

export interface MailStoredConfig {
  contactToEmail?: string;
  smtpUrl?: string;
}

export interface StoredConfigs {
  instagram: InstagramStoredConfig;
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
