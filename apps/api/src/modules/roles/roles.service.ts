/**
 * Reglas de roles compartidas por los módulos `roles` y `users` (RF11, ADR-18 ampliada).
 *
 * - Permisos efectivos: SUPERADMIN tiene todo por código; el resto, exactamente lo guardado.
 * - Anti-escalada (Q125): quien no es SUPERADMIN solo puede asignar —o administrar a usuarios con—
 *   roles cuyos permisos son un subconjunto de los suyos, y nunca SUPERADMIN. Esto evita, por
 *   ejemplo, que un ADMIN se dé más permisos creando un usuario o restablezca la clave del
 *   Superadministrador para entrar con su cuenta.
 * - Siempre queda al menos un SUPERADMIN activo.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { effectivePermissions, isSubsetOf, SUPERADMIN_KEY, type Action } from '@ifts2/shared';
import type { AuthUser } from '../../context';
import { errors } from '../../infra/errors';

type Db = PrismaClient | Prisma.TransactionClient;

export const roleWithPermissions = {
  permissions: { select: { permission: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

export type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleWithPermissions }>;

/** Permisos efectivos de una fila de rol. */
export function rolePermissions(role: {
  key: string;
  permissions: { permission: string }[];
}): Action[] {
  return effectivePermissions(
    role.key,
    role.permissions.map((p) => p.permission),
  );
}

/** ¿Quien llama puede asignar este rol (o administrar a alguien que lo tiene)? */
export function canAssign(
  caller: AuthUser,
  role: { key: string; permissions: { permission: string }[] },
) {
  if (caller.role === SUPERADMIN_KEY) return true;
  if (role.key === SUPERADMIN_KEY) return false;
  return isSubsetOf(rolePermissions(role), caller.permissions);
}

/** DTO público de un rol. `assignable` depende de quién pregunta. */
export function toRoleDto(role: RoleRow, caller: AuthUser) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    /** SUPERADMIN no se edita: siempre tiene todos los permisos. */
    editable: role.key !== SUPERADMIN_KEY,
    userCount: role._count.users,
    permissions: rolePermissions(role),
    assignable: canAssign(caller, role),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/**
 * Valida que el rol exista y que quien llama pueda asignarlo. 400 si el rol no existe (es un dato
 * del formulario); 403 si sería una escalada de permisos.
 */
export async function assertAssignableRole(db: Db, caller: AuthUser, roleId: string) {
  const role = await db.role.findUnique({
    where: { id: roleId },
    include: { permissions: { select: { permission: true } } },
  });
  if (!role) {
    throw errors.validation('El rol elegido no existe.', { roleId: ['El rol elegido no existe.'] });
  }
  if (!canAssign(caller, role)) {
    throw errors.forbidden(
      role.key === SUPERADMIN_KEY
        ? 'Solo un Superadministrador puede asignar el rol Superadministrador.'
        : 'No podés asignar un rol con permisos que vos no tenés.',
    );
  }
  return role;
}

/** Valida que quien llama pueda administrar al usuario (editarlo, desactivarlo, restablecer su clave). */
export async function assertCanManageUser(db: Db, caller: AuthUser, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { select: { permission: true } } } } },
  });
  if (!user) throw errors.notFound('No encontramos al usuario.');
  if (!canAssign(caller, user.role)) {
    throw errors.forbidden('No podés administrar a un usuario con más permisos que vos.');
  }
  return user;
}

/** Cantidad de SUPERADMIN activos sin contar a `exceptUserId`. */
export function countOtherActiveSuperadmins(db: Db, exceptUserId: string) {
  return db.user.count({
    where: { active: true, role: { key: SUPERADMIN_KEY }, NOT: { id: exceptUserId } },
  });
}

/**
 * Clave estable para un rol nuevo a partir del nombre ("Comunicación sin archivo" ->
 * "COMUNICACION_SIN_ARCHIVO"). Si ya existe, agrega un sufijo numérico.
 */
export async function uniqueRoleKey(db: Db, name: string) {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'ROL';
  let key = base;
  for (let n = 2; await db.role.findUnique({ where: { key } }); n++) key = `${base}_${n}`;
  return key;
}
