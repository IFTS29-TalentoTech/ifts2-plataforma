import type { RequestHandler } from 'express';
import type { Action } from '@ifts2/shared';
import type { AppConfig } from './config';
import type { IntegrationStore } from './infra/integration-store';
import type { InstagramClient } from './infra/instagram';
import type { Logger } from './infra/logger';
import type { Mailer } from './infra/mailer';
import type { Db } from './infra/prisma';
import type { StorageProvider } from './infra/storage';

export interface Limiters {
  /** Por IP, solo cuenta intentos fallidos. */
  login: RequestHandler;
  /** Por correo, solo cuenta intentos fallidos. */
  loginByEmail: RequestHandler;
  contact: RequestHandler;
  sync: RequestHandler;
}

export interface ResolvedMail {
  mailer: Mailer;
  contactTo: string | null;
  source: 'panel' | 'env' | 'default';
}

/**
 * Todo lo que un módulo necesita. Llega en `req.ctx`: los módulos NO importan singletons, así los
 * tests pueden reemplazar cualquier servicio por un doble (createTestApp).
 */
export interface AppContext {
  config: AppConfig;
  logger: Logger;
  prisma: Db;
  /** Almacenamiento activo (STORAGE_PROVIDER). */
  storage: StorageProvider;
  /** Configuración cifrada de integraciones (cargada desde el panel). */
  integrations: IntegrationStore;
  /** Se resuelve en cada llamada: aplica los cambios hechos desde el panel. */
  getInstagramClient(): Promise<InstagramClient>;
  getMailer(): Promise<ResolvedMail>;
  limiters: Limiters;
  /** Descargador con validación DNS y conexión al destino validado. */
  downloadImage(url: string): Promise<Buffer>;
  /** `fetch` inyectable para la API de Instagram y otras integraciones. */
  fetch: typeof fetch;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  /** Clave del rol (SUPERADMIN, ADMIN, BEDELIA, EDITOR o una propia). */
  role: string;
  roleName: string;
  /** Permisos efectivos, leídos de la base en ESTE pedido (un cambio de rol rige al instante). */
  permissions: Action[];
  mustChangePassword: boolean;
}
export interface AuthInfo {
  user: AuthUser;
  sessionId: string;
}
