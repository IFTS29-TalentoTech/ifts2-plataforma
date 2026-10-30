import type { Express } from 'express';
import { createApp, getContext, type CreateAppOptions } from '../../src/app';
import { loadConfig } from '../../src/config';
import type { AppContext } from '../../src/context';
import { FakeInstagramClient } from '../../src/infra/instagram';
import { FakeMailer } from '../../src/infra/mailer';
import { InMemoryStorage } from '../../src/infra/storage';
import { testPrisma } from './db';

export interface TestApp {
  app: Express;
  ctx: AppContext;
  mailer: FakeMailer;
  storage: InMemoryStorage;
  instagram: FakeInstagramClient;
}

/**
 * Aplicación lista para Supertest: base de prueba, almacenamiento en memoria, correo falso e
 * Instagram falso. Cada llamada crea limitadores de frecuencia nuevos (sin contadores compartidos).
 * Pasá `useRealIntegrationResolution: true` para probar la resolución desde la base/entorno.
 */
export async function createTestApp(
  overrides: Partial<CreateAppOptions> & { useRealIntegrationResolution?: boolean } = {},
): Promise<TestApp> {
  const mailer = new FakeMailer();
  const storage = new InMemoryStorage();
  const instagram = new FakeInstagramClient();
  const { useRealIntegrationResolution, ...rest } = overrides;
  const app = await createApp({
    // REVALIDATE_SECRET vacío: las pruebas nunca avisan a una web real (revalidación bajo demanda).
    config: loadConfig({ ...process.env, REVALIDATE_SECRET: '' }),
    prisma: testPrisma,
    storage,
    ...(useRealIntegrationResolution ? {} : { mailer, instagramClient: instagram }),
    ...rest,
  });
  return { app, ctx: getContext(app), mailer, storage, instagram };
}
