/**
 * Módulo `roles` — Roles y permisos configurables (RF11, US-36, ADR-18 ampliada).
 *
 * Solo el SUPERADMIN (`roles:manage`) crea, edita y elimina roles y define sus permisos. `GET /roles`
 * también lo usa quien crea usuarios (`users:manage`) para el selector de rol: cada rol trae
 * `assignable` según los permisos de quien pregunta (anti-escalada, ver roles.service.ts).
 *
 * Reglas:
 * - SUPERADMIN es del sistema: no se edita ni se elimina (409) y siempre tiene todos los permisos.
 * - Los roles del sistema (ADMIN, BEDELIA, EDITOR) se editan casilla por casilla, pero no se eliminan.
 * - Un rol con usuarios no se elimina (409): primero hay que reasignarlos. La eliminación es manual,
 *   con confirmación en la interfaz y queda en la auditoría (regla general del proyecto).
 * - Nombre único (409). Permisos inexistentes o `roles:manage` -> 400 (lo valida el esquema zod).
 * - Los cambios rigen en el próximo pedido de cada usuario: los permisos se leen en cada pedido.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  idParam,
  roleCreateInput,
  rolePermissionsInput,
  roleUpdateInput,
  SUPERADMIN_KEY,
  type RoleCreateInput,
  type RolePermissionsInput,
  type RoleUpdateInput,
} from '@ifts2/shared';
import { errors } from '../../infra/errors';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { rolePermissions, roleWithPermissions, toRoleDto, uniqueRoleKey } from './roles.service';

export const mountPath = '/roles';
export const router = Router();

const manage = requirePermission('roles:manage');
const DUP_NAME = { name: ['Ya existe un rol con ese nombre.'] };

async function findRole(req: import('express').Request, id: string) {
  const role = await req.ctx.prisma.role.findUnique({
    where: { id },
    include: roleWithPermissions,
  });
  if (!role) throw errors.notFound('No encontramos el rol.');
  return role;
}

async function assertNameFree(req: import('express').Request, name: string, exceptId?: string) {
  const dup = await req.ctx.prisma.role.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (dup) throw errors.conflict('Ya existe un rol con ese nombre.', DUP_NAME);
}

/** GET /roles -> `{ items: RoleDto[] }` (sin paginar: son pocos). SUPERADMIN primero, luego por nombre. */
router.get('/', requireAnyPermission('roles:manage', 'users:manage'), async (req, res) => {
  const roles = await req.ctx.prisma.role.findMany({
    include: roleWithPermissions,
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
  });
  const items = roles.map((r) => toRoleDto(r, req.auth!.user));
  items.sort((a, b) => Number(b.key === SUPERADMIN_KEY) - Number(a.key === SUPERADMIN_KEY));
  res.json({ items });
});

router.get('/:id', manage, validate({ params: idParam }), async (req, res) => {
  res.json(toRoleDto(await findRole(req, req.valid.params.id as string), req.auth!.user));
});

/** POST /roles `{ name, description?, permissions? }` -> 201 con el rol. */
router.post('/', manage, validate({ body: roleCreateInput }), async (req, res) => {
  const body = valid<RoleCreateInput>(req, 'body');
  await assertNameFree(req, body.name);
  try {
    const role = await req.ctx.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: {
          key: await uniqueRoleKey(tx, body.name),
          name: body.name,
          description: body.description,
          permissions: { create: body.permissions.map((permission) => ({ permission })) },
        },
        include: roleWithPermissions,
      });
      await audit.fromReq(
        req,
        {
          action: 'role.create',
          entity: 'Role',
          entityId: r.id,
          detail: { key: r.key, name: r.name, permissions: rolePermissions(r) },
        },
        tx,
      );
      return r;
    });
    res.status(201).json(toRoleDto(role, req.auth!.user));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw errors.conflict('Ya existe un rol con ese nombre.', DUP_NAME);
    }
    throw e;
  }
});

/** PATCH /roles/:id `{ name?, description? }`. SUPERADMIN -> 409. */
router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: roleUpdateInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const body = valid<RoleUpdateInput>(req, 'body');
    const current = await findRole(req, id);
    if (current.key === SUPERADMIN_KEY) {
      throw errors.conflict('El rol Superadministrador no se modifica.');
    }
    if (body.name) await assertNameFree(req, body.name, id);
    const role = await req.ctx.prisma.$transaction(async (tx) => {
      const r = await tx.role.update({ where: { id }, data: body, include: roleWithPermissions });
      await audit.fromReq(
        req,
        {
          action: 'role.update',
          entity: 'Role',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return r;
    });
    res.json(toRoleDto(role, req.auth!.user));
  },
);

/**
 * PUT /roles/:id/permissions `{ permissions: string[] }`: reemplaza la lista completa (lo que no
 * viene, se quita). SUPERADMIN -> 409. Audita qué se agregó y qué se quitó.
 */
router.put(
  '/:id/permissions',
  manage,
  validate({ params: idParam, body: rolePermissionsInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const { permissions } = valid<RolePermissionsInput>(req, 'body');
    const current = await findRole(req, id);
    if (current.key === SUPERADMIN_KEY) {
      throw errors.conflict('El rol Superadministrador siempre tiene todos los permisos.');
    }
    const before = rolePermissions(current);
    const added = permissions.filter((p) => !before.includes(p as never));
    const removed = before.filter((p) => !permissions.includes(p));
    const role = await req.ctx.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: id, permission })),
      });
      // updatedAt del rol: deja registro de cuándo cambiaron sus permisos.
      const r = await tx.role.update({
        where: { id },
        data: { updatedAt: new Date() },
        include: roleWithPermissions,
      });
      await audit.fromReq(
        req,
        { action: 'role.permissions', entity: 'Role', entityId: id, detail: { added, removed } },
        tx,
      );
      return r;
    });
    res.json(toRoleDto(role, req.auth!.user));
  },
);

/** DELETE /roles/:id -> 204. Del sistema o con usuarios -> 409. */
router.delete('/:id', manage, validate({ params: idParam }), async (req, res) => {
  const id = req.valid.params.id as string;
  const current = await findRole(req, id);
  if (current.isSystem) throw errors.conflict('Los roles del sistema no se eliminan.');
  if (current._count.users > 0) {
    throw errors.conflict('Reasigná a los usuarios antes de eliminar el rol.');
  }
  try {
    await req.ctx.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await audit.fromReq(
        req,
        {
          action: 'role.delete',
          entity: 'Role',
          entityId: id,
          detail: { key: current.key, name: current.name },
        },
        tx,
      );
    });
  } catch (e) {
    // Alguien le asignó el rol a un usuario entre la verificación y el borrado: la FK lo impide.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw errors.conflict('Reasigná a los usuarios antes de eliminar el rol.');
    }
    throw e;
  }
  res.status(204).end();
});
