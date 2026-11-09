import { can, type Action, type PermissionList } from '@ifts2/shared';

export const PANEL_CAPABILITIES = {
  configuration: ['settings:manage', 'users:manage', 'links:manage', 'integrations:manage'],
  schedules: ['schedules:manage', 'examCalls:manage', 'terms:manage', 'terms:setPublic'],
  publications: ['publications:manage', 'social:moderate'],
} as const satisfies Record<string, readonly Action[]>;

export function canAccessPanel(perms: PermissionList, actions: readonly Action[]) {
  return actions.some((action) => can(perms, action));
}

export function canAccessNav(perms: PermissionList, item: PanelNavItem) {
  return canAccessPanel(perms, item.anyOf ?? [item.permission]);
}

/** Menú público. Ingreso (aspirantes) e Inscripciones (alumnos) separados (reunión del 06/10, Q20). */
export const PUBLIC_NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/institucional', label: 'Institucional' },
  { href: '/la-carrera', label: 'La carrera' },
  { href: '/estudiantes', label: 'Estudiantes' },
  { href: '/ingreso', label: 'Ingreso' },
  { href: '/inscripciones', label: 'Inscripciones' },
  { href: '/novedades', label: 'Novedades' },
] as const;

export interface PanelNavItem {
  href: string;
  label: string;
  /** Acción de la matriz de permisos que habilita el ítem. */
  permission: Action;
  /** Contenedores: basta una capacidad; cada sección conserva su control propio. */
  anyOf?: readonly Action[];
  /** Clave del contador que se muestra a la derecha (si hay). */
  countKey?: 'publications' | 'notices';
}

export const PANEL_NAV: PanelNavItem[] = [
  { href: '/panel', label: 'Resumen', permission: 'dashboard:read' },
  {
    href: '/panel/publicaciones',
    label: 'Publicaciones',
    permission: 'publications:manage',
    anyOf: PANEL_CAPABILITIES.publications,
    countKey: 'publications',
  },
  {
    href: '/panel/avisos',
    label: 'Avisos académicos',
    permission: 'notices:manage',
    countKey: 'notices',
  },
  // Mensajes de contacto (RF08, Should): solo ADMIN y BEDELIA (permiso `contact:read`). Ítem de panel-a.
  { href: '/panel/mensajes', label: 'Mensajes', permission: 'contact:read' },
  {
    href: '/panel/horarios',
    label: 'Horarios',
    permission: 'schedules:manage',
    anyOf: PANEL_CAPABILITIES.schedules,
  },
  { href: '/panel/archivo', label: 'Archivo', permission: 'documents:manage' },
  // Textos, imágenes y secciones de cada página del sitio (RF01/RF02, ADR-041): ADMIN por defecto.
  { href: '/panel/paginas', label: 'Páginas del sitio', permission: 'content:manage' },
  // Galerías de fotos del sitio (RF09, ADR-036, ADR-041): ADMIN y EDITOR por defecto.
  { href: '/panel/galerias', label: 'Galerías', permission: 'gallery:manage' },
  // Plantel docente (RF10, ADR-037): ADMIN y EDITOR por defecto.
  { href: '/panel/plantel', label: 'Plantel docente', permission: 'teachers:manage' },
  {
    href: '/panel/configuracion',
    label: 'Configuración',
    permission: 'settings:manage',
    anyOf: PANEL_CAPABILITIES.configuration,
  },
  // RF11: solo el Superadministrador (roles:manage) ve este ítem.
  { href: '/panel/roles', label: 'Roles y permisos', permission: 'roles:manage' },
];
