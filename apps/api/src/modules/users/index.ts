/**
 * Módulo `users` — Usuarios del panel (RF05, RF11, US-26).
 *
 * - Crean y administran usuarios quienes tienen `users:manage` (SUPERADMIN y ADMIN), incluso otros
 *   administradores (Q125).
 * - Anti-escalada: quien no es SUPERADMIN solo asigna roles cuyos permisos tiene y nunca SUPERADMIN,
 *   y no puede administrar a un usuario con más permisos que él (403). Ver roles/roles.service.ts.
 * - Siempre queda al menos un SUPERADMIN activo (409 al desactivarlo o cambiarle el rol).
 * - Los usuarios NO se eliminan: se desactivan (se conserva la auditoría).
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  idParam,
  SUPERADMIN_KEY,
  userCreateInput,
  userListQuery,
  userUpdateInput,
  type UserCreateInput,
  type UserUpdateInput,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { pageArgs, toPage } from '../../lib/pagination';
import { generateTempPassword, hashPassword } from '../../lib/password';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import {
  assertAssignableRole,
  assertCanManageUser,
  countOtherActiveSuperadmins,
} from '../roles/roles.service';

export const mountPath = '/users';
export const router = Router();

// Acción users:manage (SUPERADMIN y ADMIN por defecto). Los usuarios NO se eliminan: se desactivan.
router.use(requirePermission('users:manage'));

const select = {
  id: true,
  email: true,
  name: true,
  roleId: true,
  role: { select: { key: true, name: true } },
  active: true,
  mustChangePassword: true,
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof select }>;

/** Respuesta plana: `role` es la clave del rol (como antes del RF11) y `roleName` el nombre visible. */
const toDto = ({ role, ...u }: UserRow) => ({ ...u, role: role.key, roleName: role.name });

const DUP_EMAIL = { email: ['Ya existe un usuario con ese correo.'] };
const LAST_SUPERADMIN =
  'El sistema siempre tiene que conservar al menos un Superadministrador activo.';

router.get('/', validate({ query: userListQuery }), async (req, res) => {
  const q = valid<z.infer<typeof userListQuery>>(req, 'query');
  const where: Prisma.UserWhereInput = {
    ...(q.roleId ? { roleId: q.roleId } : {}),
    ...(q.active !== undefined ? { active: q.active } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { email: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    req.ctx.prisma.user.count({ where }),
    req.ctx.prisma.user.findMany({ where, select, orderBy: { createdAt: 'asc' }, ...pageArgs(q) }),
  ]);
  res.json(toPage(items.map(toDto), total, q));
});

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const user = await req.ctx.prisma.user.findUnique({ where: { id: req.valid.params.id }, select });
  if (!user) throw errors.notFound('No encontramos al usuario.');
  res.json(toDto(user));
});

/** POST /users: si no se envía clave, se genera una temporal (se muestra una sola vez) y debe cambiarse. */
router.post('/', validate({ body: userCreateInput }), async (req, res) => {
  const body = valid<UserCreateInput>(req, 'body');
  const { prisma } = req.ctx;
  if (await prisma.user.findUnique({ where: { email: body.email } })) {
    throw errors.conflict('Ya existe un usuario con ese correo.', DUP_EMAIL);
  }
  await assertAssignableRole(prisma, req.auth!.user, body.roleId);
  const temporaryPassword = body.password ? undefined : generateTempPassword();
  const passwordHash = await hashPassword(body.password ?? temporaryPassword!);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          roleId: body.roleId,
          passwordHash,
          mustChangePassword: !body.password,
        },
        select,
      });
      await audit.fromReq(
        req,
        { action: 'user.create', entity: 'User', entityId: u.id, detail: { role: u.role.key } },
        tx,
      );
      return u;
    });
    res
      .status(201)
      .json({ user: toDto(user), ...(temporaryPassword ? { temporaryPassword } : {}) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw errors.conflict('Ya existe un usuario con ese correo.', DUP_EMAIL);
    }
    throw e;
  }
});

router.patch('/:id', validate({ params: idParam, body: userUpdateInput }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const body = valid<UserUpdateInput>(req, 'body');
  const { prisma } = req.ctx;
  const current = await assertCanManageUser(prisma, req.auth!.user, id);

  if (body.email && body.email !== current.email) {
    if (await prisma.user.findUnique({ where: { email: body.email } })) {
      throw errors.conflict('Ya existe un usuario con ese correo.', DUP_EMAIL);
    }
  }
  const roleChanges = body.roleId !== undefined && body.roleId !== current.roleId;
  if (roleChanges) {
    await assertAssignableRole(prisma, req.auth!.user, body.roleId!);
    if (
      current.role.key === SUPERADMIN_KEY &&
      current.active &&
      (await countOtherActiveSuperadmins(prisma, id)) === 0
    ) {
      throw errors.conflict(LAST_SUPERADMIN);
    }
  }
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: body, select });
    await audit.fromReq(
      req,
      {
        action: 'user.update',
        entity: 'User',
        entityId: id,
        detail: { fields: Object.keys(body) },
      },
      tx,
    );
    // Cambio de rol: se cierran sus sesiones para que vuelva a entrar con el menú del rol nuevo.
    // (Los permisos igual se leen en cada pedido: esto solo evita pantallas abiertas desactualizadas.)
    if (roleChanges) await tx.session.deleteMany({ where: { userId: id } });
    return u;
  });
  res.json(toDto(user));
});

router.post('/:id/deactivate', validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { prisma } = req.ctx;
  if (id === req.auth!.user.id)
    throw errors.unprocessable('No podés desactivar tu propio usuario.');
  const current = await assertCanManageUser(prisma, req.auth!.user, id);
  if (
    current.role.key === SUPERADMIN_KEY &&
    current.active &&
    (await countOtherActiveSuperadmins(prisma, id)) === 0
  ) {
    throw errors.conflict(LAST_SUPERADMIN);
  }
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { active: false }, select });
    await tx.session.deleteMany({ where: { userId: id } }); // revoca sesiones: no puede seguir entrando
    await audit.fromReq(req, { action: 'user.deactivate', entity: 'User', entityId: id }, tx);
    return u;
  });
  res.json(toDto(user));
});

router.post('/:id/activate', validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { prisma } = req.ctx;
  await assertCanManageUser(prisma, req.auth!.user, id);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { active: true }, select });
    await audit.fromReq(req, { action: 'user.activate', entity: 'User', entityId: id }, tx);
    return u;
  });
  res.json(toDto(user));
});

/** Genera una clave temporal (se devuelve una sola vez), obliga a cambiarla y cierra sus sesiones. */
router.post('/:id/reset-password', validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { prisma } = req.ctx;
  // Restablecer la clave de alguien con más permisos sería una vía de escalada: 403.
  await assertCanManageUser(prisma, req.auth!.user, id);
  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit.fromReq(req, { action: 'user.reset-password', entity: 'User', entityId: id }, tx);
  });
  res.json({ temporaryPassword });
});
