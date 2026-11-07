import type { SystemRoleKey } from './enums';

/**
 * Catálogo de permisos (RF11, ADR-18 ampliada).
 *
 * - Las ACCIONES son fijas y viven acá porque cada una corresponde a código que la verifica
 *   (`requirePermission('notices:manage')` en la API, `can(permisos, ...)` en la web).
 *   Convención `<recurso>:<verbo>`.
 * - Los ROLES son datos (tablas `Role` y `RolePermission`): el Superadministrador los crea y tilda
 *   sus permisos desde el panel. La matriz `DEFAULT_ROLE_PERMISSIONS` es solo el punto de partida
 *   de la semilla y de la migración; después manda lo que esté guardado en la base.
 * - `roles:manage` está RESERVADO al rol SUPERADMIN: no aparece entre las casillas y la API rechaza
 *   guardarlo en otro rol (400).
 * - Las acciones `*:delete` se aplican además con reglas de elegibilidad (solo contenido no vigente).
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
  'gallery:manage',
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
  'roles:manage',
] as const;
export type Action = (typeof ACTIONS)[number];

/** Permisos exclusivos del Superadministrador: nunca se asignan a otro rol. */
export const RESERVED_ACTIONS = ['roles:manage'] as const satisfies readonly Action[];

/** Permisos que el Superadministrador puede tildar en un rol (todo el catálogo menos los reservados). */
export const ASSIGNABLE_ACTIONS: readonly Action[] = ACTIONS.filter(
  (a) => !(RESERVED_ACTIONS as readonly string[]).includes(a),
);

/** Clave del rol del sistema que siempre tiene todos los permisos. */
export const SUPERADMIN_KEY = 'SUPERADMIN' satisfies SystemRoleKey;

/**
 * Permisos iniciales de los roles del sistema (los usa la semilla). El SUPERADMIN no figura: sus
 * permisos se resuelven en código (siempre todos), no en filas de la base.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  Exclude<SystemRoleKey, 'SUPERADMIN'>,
  readonly Action[]
> = {
  ADMIN: ASSIGNABLE_ACTIONS,
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
    // Bedelía lee y marca mensajes, pero NO los elimina (Q41, resuelta).
    'contact:read',
    'categories:manage',
  ],
  EDITOR: [
    'dashboard:read',
    'publications:manage',
    'publications:delete',
    'social:moderate',
    'social:delete',
    'gallery:manage',
    'categories:manage',
  ],
};

/** Una casilla de la pantalla "Roles y permisos". */
export interface PermissionDef {
  action: Action;
  /** Rótulo corto de la casilla ("Gestionar", "Eliminar"). */
  label: string;
  /** Da acceso a datos o configuración delicados: la pantalla lo marca con un candado. */
  sensitive?: boolean;
}

/** Una fila de la pantalla: un recurso con sus casillas. */
export interface PermissionResource {
  resource: string;
  label: string;
  description: string;
  permissions: PermissionDef[];
}

export interface PermissionGroup {
  title: string;
  resources: PermissionResource[];
}

/**
 * Catálogo agrupado por recurso, en el orden en que lo muestra el panel (lo devuelve
 * `GET /permissions`). Una prueba verifica que cubre cada acción asignable exactamente una vez.
 */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    title: 'Contenido y comunicación',
    resources: [
      {
        resource: 'dashboard',
        label: 'Resumen',
        description: 'Pantalla de inicio del panel con los pendientes.',
        permissions: [{ action: 'dashboard:read', label: 'Ver' }],
      },
      {
        resource: 'publications',
        label: 'Publicaciones',
        description: 'Noticias y eventos del sitio.',
        permissions: [
          { action: 'publications:manage', label: 'Gestionar' },
          { action: 'publications:delete', label: 'Eliminar' },
        ],
      },
      {
        resource: 'social',
        label: 'Redes sociales',
        description: 'Aprobar o descartar lo que llega de Instagram.',
        permissions: [
          { action: 'social:moderate', label: 'Moderar' },
          { action: 'social:delete', label: 'Eliminar' },
        ],
      },
      {
        resource: 'categories',
        label: 'Categorías',
        description: 'Categorías de publicaciones y avisos.',
        permissions: [{ action: 'categories:manage', label: 'Gestionar' }],
      },
      {
        resource: 'contact',
        label: 'Mensajes de contacto',
        description: 'Consultas que llegan desde el formulario del sitio.',
        permissions: [
          { action: 'contact:read', label: 'Ver y marcar', sensitive: true },
          { action: 'contact:delete', label: 'Eliminar' },
        ],
      },
    ],
  },
  {
    title: 'Académico',
    resources: [
      {
        resource: 'notices',
        label: 'Avisos académicos',
        description: 'Cartelera de avisos para estudiantes.',
        permissions: [
          { action: 'notices:manage', label: 'Gestionar' },
          { action: 'notices:delete', label: 'Eliminar' },
        ],
      },
      {
        resource: 'schedules',
        label: 'Horarios',
        description: 'Horarios de cursada por cuatrimestre.',
        permissions: [
          { action: 'schedules:manage', label: 'Gestionar' },
          { action: 'schedules:delete', label: 'Eliminar' },
        ],
      },
      {
        resource: 'examCalls',
        label: 'Llamados a examen',
        description: 'Mesas y llamados a examen.',
        permissions: [
          { action: 'examCalls:manage', label: 'Gestionar' },
          { action: 'examCalls:delete', label: 'Eliminar' },
        ],
      },
      {
        resource: 'terms',
        label: 'Ciclos lectivos',
        description: 'Cuatrimestres y cuál se muestra en el sitio.',
        permissions: [
          { action: 'terms:manage', label: 'Crear y editar' },
          { action: 'terms:setPublic', label: 'Elegir el ciclo público', sensitive: true },
        ],
      },
      {
        resource: 'documents',
        label: 'Archivo documental',
        description: 'Resoluciones, planes y documentos archivados.',
        permissions: [
          { action: 'documents:manage', label: 'Gestionar' },
          { action: 'documents:delete', label: 'Eliminar' },
        ],
      },
      {
        resource: 'gallery',
        label: 'Galerías',
        description: 'Fotos del carrusel de Estudiantes y de La carrera.',
        permissions: [{ action: 'gallery:manage', label: 'Gestionar' }],
      },
    ],
  },
  {
    title: 'Sitio y sistema',
    resources: [
      {
        resource: 'content',
        label: 'Textos de páginas',
        description: 'Institucional, La carrera e Ingreso.',
        permissions: [
          { action: 'content:manage', label: 'Gestionar' },
          { action: 'content:delete', label: 'Eliminar' },
        ],
      },
      {
        resource: 'links',
        label: 'Enlaces de interés',
        description: 'Enlaces que se muestran en el sitio.',
        permissions: [
          { action: 'links:manage', label: 'Gestionar' },
          { action: 'links:delete', label: 'Eliminar' },
        ],
      },
      {
        resource: 'settings',
        label: 'Configuración del sitio',
        description: 'Datos institucionales, contactos y período académico.',
        permissions: [{ action: 'settings:manage', label: 'Gestionar', sensitive: true }],
      },
      {
        resource: 'integrations',
        label: 'Integraciones',
        description: 'Conexión con Instagram y el correo.',
        permissions: [{ action: 'integrations:manage', label: 'Gestionar', sensitive: true }],
      },
      {
        resource: 'users',
        label: 'Usuarios',
        description: 'Crear usuarios, asignar roles y desactivarlos.',
        permissions: [{ action: 'users:manage', label: 'Gestionar', sensitive: true }],
      },
      {
        resource: 'audit',
        label: 'Auditoría',
        description: 'Historial de quién hizo cada cambio.',
        permissions: [{ action: 'audit:read', label: 'Ver', sensitive: true }],
      },
    ],
  },
];

/** Normaliza una lista: deja solo acciones del catálogo, sin repetir y en el orden del catálogo. */
export function normalizeActions(list: readonly string[]): Action[] {
  const set = new Set(list);
  return ACTIONS.filter((a) => set.has(a));
}

/**
 * Permisos efectivos de un rol: el SUPERADMIN tiene siempre todos (se resuelve acá, no en la base);
 * el resto tiene exactamente lo guardado, sin los reservados aunque alguien los haya escrito a mano.
 */
export function effectivePermissions(roleKey: string, stored: readonly string[]): Action[] {
  if (roleKey === SUPERADMIN_KEY) return [...ACTIONS];
  return normalizeActions(stored).filter(
    (a) => !(RESERVED_ACTIONS as readonly string[]).includes(a),
  );
}

/** `true` si todos los permisos de `subset` están en `of` (regla anti-escalada al asignar roles). */
export function isSubsetOf(subset: readonly string[], of: readonly string[]): boolean {
  const set = new Set(of);
  return subset.every((a) => set.has(a));
}

/**
 * ¿La lista de permisos habilita la acción? Recibe los permisos efectivos de la sesión
 * (`GET /auth/me` -> `permissions`). Sin lista, siempre `false` (denegar por defecto).
 */
export function can(permissions: readonly string[] | null | undefined, action: Action): boolean {
  return permissions?.includes(action) ?? false;
}

/** Permisos efectivos de una sesión, tal como los devuelve `GET /auth/me`. */
export type PermissionList = readonly Action[];
