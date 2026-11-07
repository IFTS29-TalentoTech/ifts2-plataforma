/**
 * Fábrica de la aplicación Express (la usan server.ts y Supertest).
 *
 * - `buildContext` arma el AppContext (req.ctx): prisma, storage, integraciones y limitadores. Los
 *   módulos solo hablan con servicios a través de req.ctx, así las pruebas los reemplazan por dobles.
 * - Orden de middlewares (importa): ctx -> helmet -> CORS (solo APP_ORIGIN, con cookies) -> JSON (1 MB)
 *   -> cookies -> log -> verificación de Origin (CSRF, ADR-06) -> attachAuth (sesión) -> módulos -> 404 -> errores.
 * - Los módulos se descubren solos (routes.ts): agregar uno no requiere editar este archivo.
 */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { loadConfig, type AppConfig } from './config';
import type { AppContext } from './context';
import { IntegrationStore } from './infra/integration-store';
import { createInstagramClient, type InstagramClient } from './infra/instagram';
import { createLogger, type Logger } from './infra/logger';
import { createMailer, type Mailer } from './infra/mailer';
import { downloadImage } from './infra/media-download';
import { createPrisma, type Db } from './infra/prisma';
import { createStorage, type StorageProvider } from './infra/storage';
import { attachAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { originCheck } from './middleware/origin';
import { revalidateWeb } from './middleware/revalidate-web';
import { createLimiters } from './middleware/rate-limit';
import { loadModules } from './routes';
import healthRouter from './modules/health/router';

export interface CreateAppOptions {
  config?: AppConfig;
  prisma?: Db;
  logger?: Logger;
  /** Dobles de prueba: si se pasan, reemplazan a la resolución por panel/entorno. */
  storage?: StorageProvider;
  mailer?: Mailer;
  contactTo?: string | null;
  instagramClient?: InstagramClient;
  /** Doble de `fetch` para integraciones salientes (pruebas). */
  fetch?: typeof fetch;
  downloadImage?: AppContext['downloadImage'];
}

export const API_PREFIX = '/api/v1';

export function buildContext(opts: CreateAppOptions = {}): AppContext {
  const config = opts.config ?? loadConfig();
  const logger = opts.logger ?? createLogger(config.logLevel, config.nodeEnv === 'development');
  const prisma = opts.prisma ?? createPrisma(config.databaseUrl);
  const integrations = new IntegrationStore(prisma, config.encryptionKey);
  const fetchFn: typeof fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  return {
    fetch: fetchFn,
    downloadImage: opts.downloadImage ?? downloadImage,
    config,
    logger,
    prisma,
    integrations,
    storage: opts.storage ?? createStorage(config),
    limiters: createLimiters(config),
    getInstagramClient: async () =>
      opts.instagramClient ?? createInstagramClient(config, integrations, fetchFn),
    getMailer: async () => {
      if (opts.mailer) {
        return {
          mailer: opts.mailer,
          contactTo: opts.contactTo ?? config.mailer.contactToEmail ?? null,
          source: 'default' as const,
        };
      }
      return createMailer(config, integrations, logger);
    },
  };
}

/** Fábrica de la aplicación Express (la usan server.ts y Supertest). El contexto queda en `app.locals.ctx`. */
export async function createApp(opts: CreateAppOptions = {}): Promise<Express> {
  const ctx = buildContext(opts);
  const { config } = ctx;
  const app = express();
  app.locals.ctx = ctx;
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, _res, next) => {
    req.ctx = ctx;
    next();
  });
  app.use(helmet());
  app.use(cors({ origin: config.appOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () =>
      ctx.logger.info(
        { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start },
        'request',
      ),
    );
    next();
  });
  app.use(originCheck);
  app.use(attachAuth);
  app.use(revalidateWeb); // avisa a la web para refrescar el sitio público tras cada cambio del panel

  app.use('/health', healthRouter);

  const api = express.Router();
  for (const m of await loadModules()) {
    api.use(m.mountPath, m.router);
  }
  app.use(API_PREFIX, api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function getContext(app: Express): AppContext {
  return app.locals.ctx as AppContext;
}
