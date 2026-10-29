import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { can, type Action, type Role } from '@ifts2/shared';
import { sha256 } from '../infra/crypto';
import { errors } from '../infra/errors';

/** Lee la cookie de sesión y carga `req.auth` (o null). No rechaza: eso lo hacen requireAuth & co. */
export async function attachAuth(req: Request, _res: Response, next: NextFunction) {
  req.auth = null;
  const token = req.cookies?.[req.ctx.config.session.cookieName];
  if (typeof token !== 'string' || token.length < 20) return next();
  const session = await req.ctx.prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.active) return next();
  const u = session.user;
  req.auth = {
    sessionId: session.id,
    user: { id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: u.mustChangePassword },
  };
  next();
}

export interface RequireAuthOptions {
  /** Permite pasar aunque la persona deba cambiar su clave (para /auth/change-password, /auth/me, /auth/logout). */
  allowMustChangePassword?: boolean;
}

export function requireAuth(opts: RequireAuthOptions = {}): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(errors.unauthorized());
    if (req.auth.user.mustChangePassword && !opts.allowMustChangePassword) {
      return next(
        errors.forbidden('Tenés que cambiar tu contraseña antes de continuar.', {
          reason: 'password-change-required',
        }),
      );
    }
    next();
  };
}

/** Exige sesión y que el rol sea uno de los indicados. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(errors.unauthorized());
    if (req.auth.user.mustChangePassword) {
      return next(
        errors.forbidden('Tenés que cambiar tu contraseña antes de continuar.', {
          reason: 'password-change-required',
        }),
      );
    }
    if (!roles.includes(req.auth.user.role)) return next(errors.forbidden());
    next();
  };
}

/** Exige sesión y que la matriz de permisos (packages/shared) habilite la acción para el rol. */
export function requirePermission(action: Action): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(errors.unauthorized());
    if (req.auth.user.mustChangePassword) {
      return next(
        errors.forbidden('Tenés que cambiar tu contraseña antes de continuar.', {
          reason: 'password-change-required',
        }),
      );
    }
    if (!can(req.auth.user.role, action)) return next(errors.forbidden());
    next();
  };
}
