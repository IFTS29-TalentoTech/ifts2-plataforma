/**
 * Autenticación y autorización (RNF06, RF11, ADR-18 ampliada).
 *
 * - `attachAuth` lee la cookie de sesión y carga `req.auth` con el usuario, su rol y sus PERMISOS
 *   EFECTIVOS leídos de la base en cada pedido: si el Superadministrador cambia los permisos de un
 *   rol, rigen desde el próximo pedido sin volver a iniciar sesión.
 * - `requirePermission` deniega por defecto: exige sesión y que la acción esté entre los permisos.
 * - Toda ruta fuera de `/public` y `/auth` tiene que declarar un permiso con estas funciones; una
 *   prueba (test/api/route-permissions.test.ts) recorre las rutas y falla si alguna no lo hace.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { can, effectivePermissions, type Action } from '@ifts2/shared';
import { sha256 } from '../infra/crypto';
import { errors } from '../infra/errors';

/**
 * Marca de los middlewares que declaran permiso. La usa la prueba que verifica que ninguna ruta del
 * panel quede sin protección (no tiene efecto en tiempo de ejecución).
 */
export const PERMISSION_GUARDS = new WeakSet<RequestHandler>();

/** Lee la cookie de sesión y carga `req.auth` (o null). No rechaza: eso lo hacen requireAuth & co. */
export async function attachAuth(req: Request, _res: Response, next: NextFunction) {
  req.auth = null;
  const token = req.cookies?.[req.ctx.config.session.cookieName];
  if (typeof token !== 'string' || token.length < 20) return next();
  const session = await req.ctx.prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: { include: { permissions: true } } } } },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.active) return next();
  const u = session.user;
  req.auth = {
    sessionId: session.id,
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      roleId: u.roleId,
      role: u.role.key,
      roleName: u.role.name,
      permissions: effectivePermissions(
        u.role.key,
        u.role.permissions.map((p) => p.permission),
      ),
      mustChangePassword: u.mustChangePassword,
    },
  };
  next();
}

export interface RequireAuthOptions {
  /** Permite pasar aunque la persona deba cambiar su clave (para /auth/change-password, /auth/me, /auth/logout). */
  allowMustChangePassword?: boolean;
}

const passwordChangeRequired = () =>
  errors.forbidden('Tenés que cambiar tu contraseña antes de continuar.', {
    reason: 'password-change-required',
  });

export function requireAuth(opts: RequireAuthOptions = {}): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(errors.unauthorized());
    if (req.auth.user.mustChangePassword && !opts.allowMustChangePassword) {
      return next(passwordChangeRequired());
    }
    next();
  };
}

/** Exige sesión y que los permisos efectivos del rol incluyan la acción. */
export function requirePermission(action: Action): RequestHandler {
  return requireAnyPermission(action);
}

/**
 * Exige sesión y AL MENOS UNO de los permisos. Ejemplo: `GET /roles` lo usa el Superadministrador
 * (`roles:manage`) y también quien crea usuarios (`users:manage`) para elegir el rol.
 */
export function requireAnyPermission(...actions: Action[]): RequestHandler {
  const guard: RequestHandler = (req, _res, next) => {
    if (!req.auth) return next(errors.unauthorized());
    if (req.auth.user.mustChangePassword) return next(passwordChangeRequired());
    if (!actions.some((a) => can(req.auth!.user.permissions, a))) return next(errors.forbidden());
    next();
  };
  PERMISSION_GUARDS.add(guard);
  return guard;
}
