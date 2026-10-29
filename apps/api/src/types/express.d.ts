import type { AppContext, AuthInfo } from '../context';

declare global {
  namespace Express {
    interface Request {
      /** Servicios de la aplicación (prisma, storage, config...). */
      ctx: AppContext;
      /** Sesión autenticada, o null. La completa el middleware `attachAuth`. */
      auth: AuthInfo | null;
      /** Datos validados por `validate({ body, query, params })`. */
      valid: { body?: any; query?: any; params?: any };
    }
  }
}

export {};
