import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  idParam,
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

export const mountPath = '/users';
export const router = Router();

// Solo ADMIN (acción users:manage). Los usuarios NO se eliminan: se desactivan (conserva la auditoría).
router.use(requirePermission('users:manage'));

const select = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

const DUP_EMAIL = { email: ['Ya existe un usuario con ese correo.'] };

async function countOtherActiveAdmins(db: Prisma.TransactionClient | import('@prisma/client').PrismaClient, exceptId: string) {
  return db.user.count({ where: { role: 'ADMIN', active: true, NOT: { id: exceptId } } });
}

router.get('/', validate({ query: userListQuery }), async (req, res) => {
  const q = valid<z.infer<typeof userListQuery>>(req, 'query');
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.active !== undefined ? { active: q.active } : {}),
    ...(q.q
      ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] }
      : {}),
  };
  const [total, items] = await Promise.all([
    req.ctx.prisma.user.count({ where }),
    req.ctx.prisma.user.findMany({ where, select, orderBy: { createdAt: 'asc' }, ...pageArgs(q) }),
  ]);
  res.json(toPage(items, total, q));
});

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const user = await req.ctx.prisma.user.findUnique({ where: { id: req.valid.params.id }, select });
  if (!user) throw errors.notFound('No encontramos al usuario.');
  res.json(user);
});

/** POST /users: si no se envía clave, se genera una temporal (se muestra una sola vez) y debe cambiarse. */
router.post('/', validate({ body: userCreateInput }), async (req, res) => {
  const body = valid<UserCreateInput>(req, 'body');
  const { prisma } = req.ctx;
  if (await prisma.user.findUnique({ where: { email: body.email } })) {
    throw errors.conflict('Ya existe un usuario con ese correo.', DUP_EMAIL);
  }
  const temporaryPassword = body.password ? undefined : generateTempPassword();
  const passwordHash = await hashPassword(body.password ?? temporaryPassword!);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          role: body.role,
          passwordHash,
          mustChangePassword: !body.password,
        },
        select,
      });
      await audit.fromReq(req, { action: 'user.create', entity: 'User', entityId: u.id, detail: { role: u.role } }, tx);
      return u;
    });
    res.status(201).json({ user, ...(temporaryPassword ? { temporaryPassword } : {}) });
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
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw errors.notFound('No encontramos al usuario.');

  if (body.email && body.email !== current.email) {
    if (await prisma.user.findUnique({ where: { email: body.email } })) {
      throw errors.conflict('Ya existe un usuario con ese correo.', DUP_EMAIL);
    }
  }
  if (body.role && body.role !== 'ADMIN' && current.role === 'ADMIN' && current.active) {
    if ((await countOtherActiveAdmins(prisma, id)) === 0) {
      throw errors.unprocessable('No podés sacarle el rol de administrador al último administrador activo.');
    }
  }
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: body, select });
    await audit.fromReq(
      req,
      { action: 'user.update', entity: 'User', entityId: id, detail: { fields: Object.keys(body) } },
      tx,
    );
    if (body.role && body.role !== current.role) await tx.session.deleteMany({ where: { userId: id } });
    return u;
  });
  res.json(user);
});

router.post('/:id/deactivate', validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { prisma } = req.ctx;
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw errors.notFound('No encontramos al usuario.');
  if (id === req.auth!.user.id) throw errors.unprocessable('No podés desactivar tu propio usuario.');
  if (current.role === 'ADMIN' && current.active && (await countOtherActiveAdmins(prisma, id)) === 0) {
    throw errors.unprocessable('No podés desactivar al último administrador activo.');
  }
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { active: false }, select });
    await tx.session.deleteMany({ where: { userId: id } }); // revoca sesiones: no puede seguir entrando
    await audit.fromReq(req, { action: 'user.deactivate', entity: 'User', entityId: id }, tx);
    return u;
  });
  res.json(user);
});

router.post('/:id/activate', validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { prisma } = req.ctx;
  if (!(await prisma.user.findUnique({ where: { id } }))) throw errors.notFound('No encontramos al usuario.');
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { active: true }, select });
    await audit.fromReq(req, { action: 'user.activate', entity: 'User', entityId: id }, tx);
    return u;
  });
  res.json(user);
});

/** Genera una clave temporal (se devuelve una sola vez), obliga a cambiarla y cierra sus sesiones. */
router.post('/:id/reset-password', validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { prisma } = req.ctx;
  if (!(await prisma.user.findUnique({ where: { id } }))) throw errors.notFound('No encontramos al usuario.');
  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit.fromReq(req, { action: 'user.reset-password', entity: 'User', entityId: id }, tx);
  });
  res.json({ temporaryPassword });
});
