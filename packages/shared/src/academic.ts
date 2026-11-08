/**
 * Contrato del bloque "académico" de la API (avisos, ciclos, horarios, llamados, documentos,
 * ajustes, contenido, enlaces, contacto y /public/*): esquemas de entrada adicionales y las
 * INTERFACES de las respuestas JSON, para que la web las consuma tipadas
 * (`import type { NoticeDto } from '@ifts2/shared'`).
 *
 * Reglas que se reflejan acá (docs/specs/01-requerimientos.md):
 * - RF03: la vigencia se calcula al consultar; el estado "EXPIRED" de un aviso NO se guarda (`viewStatus`).
 * - RF06: horarios y llamados solo se muestran si están publicados y su ciclo es el público actual.
 * - Fechas: ISO 8601 en UTC (string) en todas las respuestas.
 */
import { z } from 'zod';
import {
  CONTENT_PAGES,
  MESSAGE_STATUSES,
  TERM_KIND_LABELS,
  type ContentPage,
  type DocumentKind,
  type DocumentStatus,
  type MessageStatus,
  type NoticeAudience,
  type NoticeStatus,
  type PublicationKind,
  type PublicationOrigin,
  type PublicationSection,
  type SettingKey,
  type TermKind,
} from './enums';
import type { Page } from './problem';
import { dateTime, documentMetaInput, paginationQuery } from './schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Nombre mostrable de un ciclo: "2026 · 2.º cuatrimestre". */
export function termLabel(year: number, kind: TermKind): string {
  return `${year} · ${TERM_KIND_LABELS[kind]}`;
}

const uuidParam = (label: string) =>
  z.string({ required_error: `${label} es obligatorio.` }).uuid(`${label} no es válido.`);

const boolQuery = (label: string) =>
  z
    .enum(['true', 'false'], { errorMap: () => ({ message: `${label}: usá true o false.` }) })
    .transform((v) => v === 'true');

// ---------------------------------------------------------------------------
// Esquemas de entrada
// ---------------------------------------------------------------------------

/** PATCH /terms/:id: solo fechas (año y período identifican al ciclo y no se cambian). */
export const termUpdateInput = z
  .object({
    startsOn: z.preprocess((v) => (v === '' ? null : v), dateTime('La fecha de inicio').nullable()),
    endsOn: z.preprocess(
      (v) => (v === '' ? null : v),
      dateTime('La fecha de fin', 'end').nullable(),
    ),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' })
  .superRefine((v, ctx) => {
    if (v.startsOn && v.endsOn && v.endsOn.getTime() <= v.startsOn.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsOn'],
        message: 'La fecha de fin debe ser posterior a la fecha de inicio.',
      });
    }
  });
export type TermUpdateInput = z.infer<typeof termUpdateInput>;

export const termListQuery = paginationQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const scheduleListQuery = paginationQuery.extend({
  termId: uuidParam('El ciclo').optional(),
  published: boolQuery('Publicado').optional(),
});

export const examCallListQuery = paginationQuery.extend({
  termId: uuidParam('El ciclo').optional(),
  published: boolQuery('Publicado').optional(),
});

/** PATCH /documents/:id: metadatos (el archivo no se reemplaza: se sube otro documento). */
export const documentUpdateInput = documentMetaInput
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' });
export type DocumentUpdateInput = z.infer<typeof documentUpdateInput>;

/** POST /documents/:id/archive: `force` confirma archivar algo que está adjunto a contenido visible. */
export const documentArchiveInput = z
  .object({
    force: z.boolean({ invalid_type_error: 'force debe ser true o false.' }).default(false),
  })
  .default({});
export type DocumentArchiveInput = z.infer<typeof documentArchiveInput>;

/** Parámetros de ruta de una sección de contenido: /content/:page/:slug */
export const contentSectionParams = z.object({
  page: z.enum(CONTENT_PAGES, {
    errorMap: () => ({ message: `La página no existe (${CONTENT_PAGES.join(', ')}).` }),
  }),
  slug: z
    .string()
    .trim()
    .min(1, 'El identificador de la sección es obligatorio.')
    .max(60, 'El identificador no puede superar los 60 caracteres.')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'El identificador solo admite minúsculas, números y guiones (ejemplo: sobre-el-instituto).',
    ),
});

export const contentPageParams = contentSectionParams.pick({ page: true });

export const contactListQuery = paginationQuery.extend({
  status: z
    .enum(MESSAGE_STATUSES, { errorMap: () => ({ message: 'El estado no es válido.' }) })
    .optional(),
  q: z.string().trim().max(100).optional(),
});

export const contactStatusInput = z.object({
  status: z.enum(MESSAGE_STATUSES, {
    errorMap: () => ({ message: `El estado debe ser ${MESSAGE_STATUSES.join(', ')}.` }),
  }),
});

export const linkListQuery = z.object({ visible: boolQuery('Visible').optional() });

/** GET /public/publications */
export const publicPublicationsQuery = z.object({
  year: z.coerce
    .number({ invalid_type_error: 'El año no es válido.' })
    .int('El año no es válido.')
    .min(2000, 'El año no es válido.')
    .max(2100, 'El año no es válido.')
    .optional(),
  category: uuidParam('La categoría').optional(),
  archived: boolQuery('archived').default('false'),
  page: z.coerce.number().int().min(1, 'La página debe ser 1 o mayor.').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(50, 'El tamaño de página no puede superar 50.')
    .default(12),
});
export type PublicPublicationsQuery = z.infer<typeof publicPublicationsQuery>;

export const publicStudentsQuery = z.object({
  audience: z
    .enum(['ALL', 'STUDENTS', 'ASPIRANTS', 'GRADUATES'], {
      errorMap: () => ({ message: 'El destinatario no es válido.' }),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Respuestas (DTO). Todas las fechas viajan como string ISO 8601 (UTC).
// ---------------------------------------------------------------------------

/** Archivo adjunto tal como lo ve el panel (sin clave de almacenamiento). */
export interface DocumentRefDto {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: DocumentKind;
  status: DocumentStatus;
}

/** Archivo adjunto en el sitio público, con enlace de descarga firmado (null si falla el almacenamiento). */
export interface PublicFileDto {
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string | null;
}

export type NoticeViewStatusDto = 'ACTIVE' | 'PAUSED' | 'EXPIRED';

/** Conteos de avisos por estado calculado (respetan el filtro `audience`, no el de `status`). */
export interface NoticeCountsDto {
  ALL: number;
  ACTIVE: number;
  PAUSED: number;
  EXPIRED: number;
}

/** GET /notices: página de avisos + conteos por estado para los filtros del panel. */
export interface NoticeListDto extends Page<NoticeDto> {
  counts: NoticeCountsDto;
}

/** GET /notices, GET /notices/:id, POST/PATCH, pause, resume. */
export interface NoticeDto {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  audience: NoticeAudience;
  urgent: boolean;
  highlighted: boolean;
  /** Estado guardado: ACTIVE | PAUSED. */
  status: NoticeStatus;
  /** Estado calculado para los filtros del panel: PAUSED gana; luego EXPIRED (vigencia terminada); si no, ACTIVE. */
  viewStatus: NoticeViewStatusDto;
  /** true si hoy lo ve un visitante (ACTIVE y dentro de la vigencia). */
  visibleNow: boolean;
  visibleFrom: string;
  visibleUntil: string | null;
  attachmentId: string | null;
  attachment: DocumentRefDto | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TermDto {
  id: string;
  year: number;
  kind: TermKind;
  /** "2026 · 2.º cuatrimestre" */
  label: string;
  startsOn: string | null;
  endsOn: string | null;
  publicCurrent: boolean;
  counts: { schedules: number; examCalls: number };
}

export interface TermRefDto {
  id: string;
  year: number;
  kind: TermKind;
  label: string;
  publicCurrent: boolean;
}

export interface ScheduleDto {
  id: string;
  termId: string;
  term: TermRefDto;
  commissionName: string;
  documentId: string | null;
  document: DocumentRefDto | null;
  notes: string | null;
  published: boolean;
  /** true si hoy lo ve un visitante (publicado y ciclo público). */
  visibleNow: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface ExamCallDto {
  id: string;
  termId: string;
  term: TermRefDto;
  name: string;
  startsOn: string;
  endsOn: string;
  enrollmentOpen: boolean;
  highlighted: boolean;
  documentId: string | null;
  document: DocumentRefDto | null;
  notes: string | null;
  published: boolean;
  visibleNow: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface DocumentDto {
  id: string;
  title: string;
  filename: string;
  kind: DocumentKind;
  category: string | null;
  cycleYear: number | null;
  termLabel: string | null;
  resolutionCode: string | null;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  archivedAt: string | null;
  restoredAt: string | null;
  uploadedBy: string;
  createdAt: string;
  /** Cantidad de avisos, horarios y llamados que lo tienen adjunto (visibles o no). */
  usage: { notices: number; schedules: number; examCalls: number };
}

export interface DocumentReferenceDto {
  type: 'notice' | 'schedule' | 'examCall';
  id: string;
  label: string;
  /** true si el elemento hoy se ve en el sitio público. */
  visible: boolean;
}

/** GET /documents/:id */
export interface DocumentDetailDto extends DocumentDto {
  references: DocumentReferenceDto[];
  /** Cuántas referencias están visibles hoy (si > 0, archivar pide `force: true`). */
  visibleReferences: number;
}

/** GET /documents/:id/file */
export interface DocumentFileDto {
  url: string;
  filename: string;
  mimeType: string;
}

/** GET /settings (panel). Las claves sin valor llegan en null; `exam_enrollment_open` es booleano. */
export type SettingsDto = {
  [K in SettingKey]: K extends 'exam_enrollment_open' ? boolean : string | null;
};

/** GET /public/settings: solo claves con valor y sin `instagram_hashtag`. Strings, salvo `exam_enrollment_open` (boolean). */
export type PublicSettingsDto = Partial<{
  [K in Exclude<SettingKey, 'instagram_hashtag'>]: K extends 'exam_enrollment_open'
    ? boolean
    : string;
}>;

export interface ContentSectionDto {
  id: string;
  page: ContentPage;
  slug: string;
  title: string;
  /** Markdown acotado, ya sanitizado (sin HTML crudo). */
  body: string;
  order: number;
  visible: boolean;
}

export interface LinkDto {
  id: string;
  title: string;
  url: string;
  description: string | null;
  group: string;
  order: number;
  visible: boolean;
  /** A07: enlace de inscripción de ALUMNOS (lo único que se ofrece en /inscripciones). */
  enrollment: boolean;
}

export interface ContactMessageDto {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: MessageStatus;
  consent: boolean;
  receivedAt: string;
  mailSent: boolean;
}

// ---- Público ----

export interface PublicQuickLinkDto {
  id: string;
  title: string;
  url: string;
  description: string | null;
  group: string;
  /** A07: enlace de inscripción de alumnos. /inscripciones muestra solo estos, nunca "todos". */
  enrollment: boolean;
}

export interface PublicPublicationCardDto {
  id: string;
  kind: PublicationKind;
  title: string;
  summary: string;
  coverUrl: string | null;
  category: { id: string; name: string } | null;
  section: PublicationSection;
  origin: PublicationOrigin;
  /** visibleFrom, o createdAt si no tiene. Es la fecha que se muestra en la tarjeta. */
  date: string;
  visibleUntil: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  location: string | null;
}

export interface PublicPublicationDetailDto extends PublicPublicationCardDto {
  body: string;
  /** Enlace a la publicación original si viene de Instagram. */
  permalink: string | null;
}

export interface PublicNoticeDto {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  /** Destacado "próximo evento": la casilla está marcada y el aviso sigue vigente. */
  highlighted: boolean;
  audience: NoticeAudience;
  category: { id: string; name: string } | null;
  visibleFrom: string;
  visibleUntil: string | null;
  attachment: PublicFileDto | null;
}

export interface PublicScheduleDto {
  id: string;
  commissionName: string;
  notes: string | null;
  updatedAt: string;
  file: PublicFileDto | null;
}

export interface PublicExamCallDto {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  enrollmentOpen: boolean;
  /** Destacado "próximo evento": la casilla está marcada y el llamado no terminó. */
  highlighted: boolean;
  notes: string | null;
  updatedAt: string;
  file: PublicFileDto | null;
}

/** GET /public/home */
export interface PublicHomeDto {
  tagline: string | null;
  /** Inscripciones a mesas habilitadas (ajuste `exam_enrollment_open`). */
  examEnrollmentOpen: boolean;
  /** Accesos rápidos: enlaces de interés visibles (SIU Guaraní, Aula virtual, Mi Argentina, Tutoría...). */
  quickLinks: PublicQuickLinkDto[];
  /** Hasta 6 publicaciones vigentes de sección HOME o BOTH, la más reciente primero. */
  publications: PublicPublicationCardDto[];
  highlightedNotices: PublicNoticeDto[];
  highlightedExamCalls: PublicExamCallDto[];
}

/** GET /public/publications */
export interface PublicPublicationsDto extends Page<PublicPublicationCardDto> {
  archived: boolean;
  /** Año que se filtró (null = sin filtro). */
  year: number | null;
  /** Categorías de publicaciones, para los filtros. */
  categories: { id: string; name: string }[];
  /** Años (desc) con publicaciones, para navegar el histórico. */
  availableYears: number[];
}

/** Una diapositiva de una galería, como la ve el panel (GET /gallery). */
export interface GalleryItemDto {
  id: string;
  area: 'STUDENTS' | 'CAREER';
  order: number;
  title: string;
  caption: string;
  alt: string;
  /** Categoría para filtrar la galería (RF09); vacía = sin categoría. */
  category: string;
  /** Lo guardado: ruta propia (`/img/...`) o clave del almacenamiento. */
  image: string;
  /** URL lista para mostrar (firmada si es una clave); `null` si el almacenamiento no responde. */
  src: string | null;
  updatedAt: string;
}

/** Una diapositiva pública: solo lo necesario para mostrarla (las sin imagen utilizable se omiten). */
export interface PublicGalleryItemDto {
  id: string;
  src: string;
  title: string;
  caption: string;
  alt: string;
  /** Categoría para el filtro del sitio; vacía = sin categoría. */
  category: string;
}

/** GET /public/gallery?area=STUDENTS|CAREER */
export interface PublicGalleryDto {
  area: 'STUDENTS' | 'CAREER';
  items: PublicGalleryItemDto[];
}

/** Una persona del plantel docente, como la ve el panel (GET /teachers). */
export interface TeacherDto {
  id: string;
  name: string;
  /** Cargo o rol (por ejemplo "Profesora"); vacío si no se cargó. */
  role: string;
  /** Materias a cargo, una por elemento. */
  subjects: string[];
  /** Lo guardado de la foto (ruta propia o clave del almacenamiento); vacío = sin foto. */
  photo: string;
  /** URL lista para mostrar; `null` si no hay foto o el almacenamiento no responde. */
  photoSrc: string | null;
  order: number;
  /** false = oculta del sitio (baja lógica, RF10); solo las ocultas se pueden eliminar. */
  visible: boolean;
  updatedAt: string;
}

/** Una persona del plantel tal como se publica: sin datos de gestión. */
export interface PublicTeacherDto {
  id: string;
  name: string;
  role: string;
  subjects: string[];
  photoSrc: string | null;
}

/** GET /public/teachers: solo las personas visibles, en el orden elegido. */
export interface PublicTeachersDto {
  items: PublicTeacherDto[];
}

/** GET /public/students */
export interface PublicStudentsDto {
  /** Ciclo público actual; null si todavía no se definió. */
  term: { id: string; year: number; kind: TermKind; label: string } | null;
  examEnrollmentOpen: boolean;
  schedules: PublicScheduleDto[];
  examCalls: PublicExamCallDto[];
  /** Urgentes primero y luego por inicio de vigencia descendente. */
  notices: PublicNoticeDto[];
  links: PublicQuickLinkDto[];
}

/** GET /public/content/:page */
export interface PublicContentDto {
  page: ContentPage;
  sections: { slug: string; title: string; body: string; order: number }[];
}
