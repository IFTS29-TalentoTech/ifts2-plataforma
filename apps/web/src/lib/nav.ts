import type { Action } from '@ifts2/shared';

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
  /** Clave del contador que se muestra a la derecha (si hay). */
  countKey?: 'publications' | 'notices';
}

export const PANEL_NAV: PanelNavItem[] = [
  { href: '/panel', label: 'Resumen', permission: 'dashboard:read' },
  {
    href: '/panel/publicaciones',
    label: 'Publicaciones',
    permission: 'publications:manage',
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
  { href: '/panel/horarios', label: 'Horarios', permission: 'schedules:manage' },
  { href: '/panel/archivo', label: 'Archivo', permission: 'documents:manage' },
  { href: '/panel/configuracion', label: 'Configuración', permission: 'settings:manage' },
];
