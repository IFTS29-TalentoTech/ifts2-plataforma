/**
 * Módulo `permissions` — Catálogo de permisos para la pantalla "Roles y permisos" (RF11).
 * El catálogo es fijo (packages/shared/src/permissions.ts): cada permiso corresponde a código que lo
 * verifica. `roles:manage` no figura porque es exclusivo del Superadministrador.
 */
import { Router } from 'express';
import { PERMISSION_GROUPS, RESERVED_ACTIONS } from '@ifts2/shared';
import { requirePermission } from '../../middleware/auth';

export const mountPath = '/permissions';
export const router = Router();

/** GET /permissions -> `{ groups: [{ title, resources: [{ resource, label, description, permissions }] }], reserved }`. */
router.get('/', requirePermission('roles:manage'), (_req, res) => {
  res.json({ groups: PERMISSION_GROUPS, reserved: RESERVED_ACTIONS });
});
