// Enums y constantes alineados con prisma/schema.prisma. Si cambia el schema, cambia acá
// (apps/api/test/unit/enums-sync.test.ts lo verifica).
/**
 * Roles del sistema (RF11, ADR-18 ampliada). Los roles son DATOS (tabla `Role`): estos cuatro los crea
 * la semilla con `isSystem = true`.
 * Solo SUPERADMIN es intocable (no se edita ni se elimina); ADMIN, BEDELIA y EDITOR se pueden eliminar a
 * mano si no tienen usuarios. El Superadministrador puede crear otros roles.
 * Sus nombres visibles ("Rectoría / Dirección", etc.) también son datos: salen de la semilla.
 */
export const SYSTEM_ROLE_KEYS = ['SUPERADMIN', 'ADMIN', 'BEDELIA', 'EDITOR'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export const PUBLICATION_KINDS = ['NEWS', 'EVENT'] as const;
export type PublicationKind = (typeof PUBLICATION_KINDS)[number];

export const PUBLICATION_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'PAUSED'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_ORIGINS = ['MANUAL', 'INSTAGRAM'] as const;
export type PublicationOrigin = (typeof PUBLICATION_ORIGINS)[number];

export const PUBLICATION_SECTIONS = ['HOME', 'NEWS', 'BOTH'] as const;
export type PublicationSection = (typeof PUBLICATION_SECTIONS)[number];

export const SOCIAL_STATUSES = ['DETECTED', 'LINKED', 'DISCARDED'] as const;
export type SocialStatus = (typeof SOCIAL_STATUSES)[number];

export const NOTICE_STATUSES = ['ACTIVE', 'PAUSED'] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

export const NOTICE_AUDIENCES = ['ALL', 'STUDENTS', 'ASPIRANTS', 'GRADUATES'] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

export const DOCUMENT_KINDS = [
  'SCHEDULE',
  'EXAM_CALENDAR',
  'RESOLUTION',
  'PLAN',
  'NOTICE_ATTACHMENT',
  'OTHER',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const TERM_KINDS = ['FIRST', 'SECOND', 'EXTRAORDINARY'] as const;
export type TermKind = (typeof TERM_KINDS)[number];

export const TERM_KIND_LABELS: Record<TermKind, string> = {
  FIRST: '1.º cuatrimestre',
  SECOND: '2.º cuatrimestre',
  EXTRAORDINARY: 'Turno extraordinario',
};

export const MESSAGE_STATUSES = ['NEW', 'READ', 'ANSWERED'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Estado calculado de un aviso para los filtros del panel. */
export const NOTICE_VIEW_STATUSES = ['ACTIVE', 'PAUSED', 'EXPIRED', 'ALL'] as const;
export type NoticeViewStatus = (typeof NOTICE_VIEW_STATUSES)[number];

export const CATEGORY_KINDS = ['PUBLICATION', 'NOTICE', 'GALLERY'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CONTENT_PAGES = ['institucional', 'carrera', 'ingreso'] as const;
export type ContentPage = (typeof CONTENT_PAGES)[number];

/** Claves conocidas de SiteSetting. */
export const SETTING_KEYS = [
  'phone',
  'email_institutional',
  'email_bedelia',
  'email_trabajos_practicos',
  'address',
  'instagram_url',
  'facebook_url',
  'instagram_hashtag',
  'exam_enrollment_open',
  'tagline',
  'institution_name',
  'institution_short',
  'institution_subtitle',
  'footer_text',
  'career_name',
  // Presentación del sitio público (Figma): titular corto, rótulo del hero, logo e imágenes.
  // Las imágenes son rutas del sitio (/img/...) o direcciones https; vacías = sin imagen.
  'hero_title',
  'hero_eyebrow',
  'logo_url',
  'hero_image_1',
  'hero_image_2',
  'career_image',
  'ingreso_image',
  'student_gallery',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Límites de archivos (ADR-08). */
export const FILE_LIMITS = {
  pdfMaxBytes: 10 * 1024 * 1024,
  imageMaxBytes: 5 * 1024 * 1024,
  imageMaxSidePx: 1600,
  allowedMime: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const,
} as const;

export const APP_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const EXPIRING_SOON_DAYS = 7;

/** Códigos de error de la API (sufijo de `type` en Problem Details). */
export const ERROR_CODES = [
  'validation',
  'unauthorized',
  'forbidden',
  'not-found',
  'conflict',
  'payload-too-large',
  'unsupported-media-type',
  'unprocessable',
  'too-many-requests',
  'bad-gateway',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
