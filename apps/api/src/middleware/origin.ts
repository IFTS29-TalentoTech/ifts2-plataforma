import type { NextFunction, Request, Response } from 'express';
import { errors } from '../infra/errors';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Protección CSRF (ADR-06): además de SameSite=Lax, en métodos mutantes el encabezado `Origin`,
 * si viene, debe ser el del frontend (APP_ORIGIN) o el de la propia API. Los navegadores siempre lo
 * envían en peticiones cruzadas; los clientes que no son navegadores (curl, pruebas) no lo envían
 * y no son vector de CSRF.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (!MUTATING.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const { appOrigin, apiOrigin } = req.ctx.config;
  if (origin === appOrigin || origin === apiOrigin) return next();
  next(errors.forbidden('Origen no permitido.'));
}
