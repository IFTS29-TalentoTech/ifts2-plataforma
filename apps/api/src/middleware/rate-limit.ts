import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';
import type { Limiters } from '../context';
import { errors } from '../infra/errors';

const handler: RequestHandler = (_req, _res, next) => next(errors.tooMany());

/** Una instancia de limitadores por aplicación (así las pruebas no comparten contadores). */
export function createLimiters(config: AppConfig): Limiters {
  const base = { standardHeaders: 'draft-7' as const, legacyHeaders: false, handler };
  return {
    // ADR-06: 5 intentos fallidos por 15 minutos, por IP y por correo.
    login: rateLimit({
      ...base,
      windowMs: config.loginLimit.windowMs,
      limit: config.loginLimit.max,
      skipSuccessfulRequests: true,
    }),
    loginByEmail: rateLimit({
      ...base,
      windowMs: config.loginLimit.windowMs,
      limit: config.loginLimit.max,
      skipSuccessfulRequests: true,
      keyGenerator: (req) =>
        `email:${String(req.body?.email ?? '')
          .toLowerCase()
          .trim()}`,
      validate: { keyGeneratorIpFallback: false },
    }),
    contact: rateLimit({ ...base, windowMs: 60 * 60_000, limit: 5 }),
    sync: rateLimit({ ...base, windowMs: 60_000, limit: 6 }),
  };
}
