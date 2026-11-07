import { Router, type CookieOptions, type Request, type Response } from 'express';
import {
  changePasswordInput,
  loginInput,
  type ChangePasswordInput,
  type LoginInput,
} from '@ifts2/shared';
import { randomToken, sha256 } from '../../infra/crypto';
import { errors } from '../../infra/errors';
import { dummyHash, hashPassword, verifyPassword } from '../../lib/password';
import { requireAuth } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';

export const mountPath = '/auth';
export const router = Router();

function cookieOptions(req: Request, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: req.ctx.config.session.secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(req.ctx.config.session.cookieName, {
    ...cookieOptions(req, 0),
    maxAge: undefined,
  });
}

/** POST /auth/login: 204 + cookie de sesión; 401 con mensaje genérico; 429 tras 5 intentos fallidos. */
router.post(
  '/login',
  (req, res, next) => req.ctx.limiters.login(req, res, next),
  validate({ body: loginInput }),
  (req, res, next) => req.ctx.limiters.loginByEmail(req, res, next),
  async (req, res) => {
    const { email, password, remember } = valid<LoginInput>(req, 'body');
    const { prisma, config } = req.ctx;
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user
      ? await verifyPassword(user.passwordHash, password)
      : (await verifyPassword(await dummyHash(), password), false);
    if (!user || !ok || !user.active) {
      throw errors.unauthorized('Correo o contraseña incorrectos.');
    }

    const ttlMs = remember
      ? config.session.rememberDays * 24 * 3600_000
      : config.session.ttlHours * 3600_000;
    const token = randomToken(32);
    await prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + ttlMs),
          userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await audit.log(tx, {
        userId: user.id,
        action: 'auth.login',
        entity: 'User',
        entityId: user.id,
      });
    });
    // Limpieza oportunista de sesiones vencidas (no es borrado de contenido).
    void prisma.session
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);

    res.cookie(config.session.cookieName, token, cookieOptions(req, ttlMs));
    res.status(204).end();
  },
);

/** POST /auth/logout: cierra la sesión actual (idempotente). */
router.post('/logout', async (req, res) => {
  if (req.auth) {
    await req.ctx.prisma.session.deleteMany({ where: { id: req.auth.sessionId } });
  }
  clearSessionCookie(req, res);
  res.status(204).end();
});

/**
 * GET /auth/me: usuario, rol y permisos EFECTIVOS de la sesión (RF11). La interfaz los usa para
 * ocultar lo que la persona no puede usar; la API igual rechaza con 403 si se fuerza.
 */
router.get('/me', requireAuth({ allowMustChangePassword: true }), (req, res) => {
  const u = req.auth!.user;
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    roleId: u.roleId,
    roleName: u.roleName,
    mustChangePassword: u.mustChangePassword,
    permissions: u.permissions,
  });
});

/** POST /auth/change-password: obligatorio tras un restablecimiento. Cierra las demás sesiones. */
router.post(
  '/change-password',
  requireAuth({ allowMustChangePassword: true }),
  validate({ body: changePasswordInput }),
  async (req, res) => {
    const { current, next } = valid<ChangePasswordInput>(req, 'body');
    const { prisma } = req.ctx;
    const me = req.auth!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.user.id } });
    if (!(await verifyPassword(user.passwordHash, current))) {
      throw errors.validation('La contraseña actual no es correcta.', {
        current: ['La contraseña actual no es correcta.'],
      });
    }
    const passwordHash = await hashPassword(next);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.session.deleteMany({ where: { userId: user.id, NOT: { id: me.sessionId } } });
      await audit.log(tx, {
        userId: user.id,
        action: 'auth.change-password',
        entity: 'User',
        entityId: user.id,
      });
    });
    res.status(204).end();
  },
);
