import type { Role } from './enums';

/**
 * Acciones del sistema, convención `<recurso>:<verbo>`.
 * La matriz es la de docs/specs/04-api.md ("Permisos por rol"). A validar con el cliente (ADR-18).
 * Las acciones `*:delete` se aplican además con reglas de elegibilidad (solo contenido no vigente).
 */
export const ACTIONS = [
  'dashboard:read',
  'publications:manage',
  'publications:delete',
  'social:moderate',
  'social:delete',
  'notices:manage',
  'notices:delete',
  'schedules:manage',
  'schedules:delete',
  'examCalls:manage',
  'examCalls:delete',
  'documents:manage',
  'documents:delete',
  'terms:manage',
  'terms:setPublic',
  'settings:manage',
  'integrations:manage',
  'content:manage',
  'content:delete',
  'links:manage',
  'links:delete',
  'users:manage',
  'contact:read',
  'contact:delete',
  'audit:read',
  'categories:manage',
] as const;
export type Action = (typeof ACTIONS)[number];

export const PERMISSIONS: Record<Role, readonly Action[]> = {
  ADMIN: ACTIONS,
  BEDELIA: [
    'dashboard:read',
    'notices:manage',
    'notices:delete',
    'schedules:manage',
    'schedules:delete',
    'examCalls:manage',
    'examCalls:delete',
    'documents:manage',
    'documents:delete',
    'terms:manage',
    // Bedelía lee y marca mensajes, pero NO los elimina: eliminar es solo ADMIN (Q41, resuelta).
    'contact:read',
    'categories:manage',
  ],
  EDITOR: [
    'dashboard:read',
    'publications:manage',
    'publications:delete',
    'social:moderate',
    'social:delete',
    'categories:manage',
  ],
};

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(action) ?? false;
}

export function permissionsFor(role: Role): readonly Action[] {
  return PERMISSIONS[role];
}
