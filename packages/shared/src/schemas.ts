import { z } from 'zod';
import {
  CATEGORY_KINDS,
  CONTENT_PAGES,
  DOCUMENT_KINDS,
  NOTICE_AUDIENCES,
  NOTICE_VIEW_STATUSES,
  PUBLICATION_ORIGINS,
  PUBLICATION_KINDS,
  PUBLICATION_SECTIONS,
  PUBLICATION_STATUSES,
  SETTING_KEYS,
  SOCIAL_STATUSES,
  TERM_KINDS,
} from './enums';
import { ACTIONS, RESERVED_ACTIONS } from './permissions';
import { endOfDayBA, startOfDayBA } from './time';

/**
 * Esquemas de entrada (ADR-12). Los mensajes de error están en español claro: forman parte de la
 * consigna de la cátedra (campos obligatorios, duplicados, mensajes claros).
 */

// ---------- helpers de campos ----------

/**
 * Género y número del rótulo de un campo, para que los mensajes concuerden en español
 * ("La leyenda es obligatoria.", "Las notas son obligatorias.", "El correo es obligatorio.").
 * 'm' masculino, 'f' femenino, 'mp' / 'fp' plurales.
 */
export type Gender = 'm' | 'f' | 'mp' | 'fp';

/** Deduce el género del artículo inicial del rótulo ("La…", "Las…", "El…", "Los…"); por defecto 'm'. */
export function genderOf(label: string): Gender {
  if (/^Las\s/i.test(label)) return 'fp';
  if (/^Los\s/i.test(label)) return 'mp';
  if (/^La\s/i.test(label)) return 'f';
  return 'm';
}

/** Formas concordadas del verbo "ser" y de los adjetivos que usan los mensajes de validación. */
function agree(label: string, gender?: Gender) {
  const g = gender ?? genderOf(label);
  const plural = g === 'mp' || g === 'fp';
  const fem = g === 'f' || g === 'fp';
  const adj = (stem: string) => `${stem}${fem ? 'a' : 'o'}${plural ? 's' : ''}`;
  return {
    es: plural ? 'son' : 'es',
    puede: plural ? 'pueden' : 'puede',
    obligatorio: adj('obligatori'),
    valido: adj('válid'),
    demasiadoLargo: `${adj('demasiad')} ${adj('larg')}`,
  };
}

/**
 * Texto obligatorio. \`gender\` es opcional: si falta se deduce del artículo del rótulo
 * (`'La leyenda'` -> femenino); pasalo solo si el rótulo no empieza con artículo.
 */
export const text = (label: string, max = 200, gender?: Gender) => {
  const w = agree(label, gender);
  return z
    .string({
      required_error: `${label} ${w.es} ${w.obligatorio}.`,
      invalid_type_error: `${label} no ${w.es} ${w.valido}.`,
    })
    .trim()
    .min(1, `${label} ${w.es} ${w.obligatorio}.`)
    .max(max, `${label} no ${w.puede} superar los ${max} caracteres.`);
};

export const optionalText = (label: string, max = 200, gender?: Gender) => {
  const w = agree(label, gender);
  return z
    .string({ invalid_type_error: `${label} no ${w.es} ${w.valido}.` })
    .trim()
    .max(max, `${label} no ${w.puede} superar los ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));
};

const enumOf = <T extends readonly [string, ...string[]]>(label: string, values: T) =>
  z.enum(values, {
    errorMap: () => ({ message: `${label}: elegí una opción válida (${values.join(', ')}).` }),
  });

const uuid = (label: string, gender?: Gender) => {
  const w = agree(label, gender);
  return z
    .string({ required_error: `${label} ${w.es} ${w.obligatorio}.` })
    .uuid(`${label} no ${w.es} ${w.valido}.`);
};

export const email = (label = 'El correo', gender?: Gender) => {
  const w = agree(label, gender);
  return z
    .string({
      required_error: `${label} ${w.es} ${w.obligatorio}.`,
      invalid_type_error: `${label} no ${w.es} ${w.valido}.`,
    })
    .trim()
    .toLowerCase()
    .min(1, `${label} ${w.es} ${w.obligatorio}.`)
    .max(254, `${label} ${w.es} ${w.demasiadoLargo}.`)
    .email(`${label} no tiene un formato válido (ejemplo: nombre@dominio.com).`);
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fecha como `yyyy-mm-dd` (se interpreta en Buenos Aires: inicio o fin del día según `edge`)
 * o como fecha/hora ISO 8601. Devuelve `Date` (instante UTC). Los rótulos de fecha son femeninos
 * ("La fecha de inicio"), por eso \`gender\` vale 'f' por omisión.
 */
export const dateTime = (label: string, edge: 'start' | 'end' = 'start', gender?: Gender) => {
  const w = agree(label, gender ?? 'f');
  return z
    .union([z.string(), z.date()], {
      invalid_type_error: `${label} no es una fecha válida.`,
      required_error: `${label} ${w.es} ${w.obligatorio}.`,
    })
    .transform((v, ctx) => {
      let d: Date;
      if (v instanceof Date) d = v;
      else if (DATE_ONLY.test(v)) d = edge === 'start' ? startOfDayBA(v) : endOfDayBA(v);
      else d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} no es una fecha válida.` });
        return z.NEVER;
      }
      return d;
    });
};

const optionalDate = (label: string, edge: 'start' | 'end' = 'start') =>
  z.preprocess((v) => (v === '' ? null : v), dateTime(label, edge).nullish());

export const url = (label: string, gender?: Gender) => {
  const w = agree(label, gender);
  return z
    .string({
      required_error: `${label} ${w.es} ${w.obligatorio}.`,
      invalid_type_error: `${label} no ${w.es} ${w.valido}.`,
    })
    .trim()
    .min(1, `${label} ${w.es} ${w.obligatorio}.`)
    .max(2000, `${label} ${w.es} ${w.demasiadoLargo}.`)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }, `${label} debe ser una dirección web completa que empiece con http:// o https://.`);
};

/**
 * Imagen del sitio público: ruta propia (`/img/...`) o dirección http(s) completa. Vacía = quitarla.
 * Se aceptan rutas porque las imágenes provisorias viajan con la web; las definitivas pueden ser
 * direcciones de un CDN o del almacenamiento del instituto.
 */
export const IMAGE_REF_RE = /^(\/(?!\/)[^\s?#]+|https?:\/\/\S+)$/i;
const LINE_BREAK = /\r?\n/;
export const imageRef = (label: string, gender?: Gender) => {
  const w = agree(label, gender);
  return z
    .string({ invalid_type_error: `${label} no ${w.es} ${w.valido}.` })
    .trim()
    .max(500, `${label} ${w.es} ${w.demasiadoLargo}.`)
    .refine(
      (v) => v === '' || IMAGE_REF_RE.test(v),
      `${label} debe ser una ruta del sitio (que empiece con /) o una dirección web completa.`,
    );
};

/** Máximo de tarjetas de la galería "Vida en la cocina". */
export const GALLERY_MAX_ITEMS = 6;

/** Una tarjeta de la galería: imagen, título y descripción (los dos últimos opcionales). */
export interface GalleryItem {
  src: string;
  title: string;
  description: string;
}

/**
 * Galería de Estudiantes (`student_gallery`): una tarjeta por línea con el formato
 * `ruta | título | descripción`. Las líneas vacías o con una ruta inválida se ignoran.
 */
export function parseGallery(raw: string | null | undefined): GalleryItem[] {
  if (!raw) return [];
  return raw
    .split(LINE_BREAK)
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter(([src]) => !!src && IMAGE_REF_RE.test(src))
    .slice(0, GALLERY_MAX_ITEMS)
    .map(([src, title, description]) => ({
      src: src!,
      title: title ?? '',
      description: description ?? '',
    }));
}

const password = (label = 'La contraseña') =>
  z
    .string({ required_error: `${label} es obligatoria.` })
    .min(10, `${label} debe tener al menos 10 caracteres.`)
    .max(128, `${label} no puede superar los 128 caracteres.`)
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), `${label} debe combinar letras y números.`);

/** Verifica que `from` <= `until` cuando existen ambas. */
function windowRefine<T extends { visibleFrom?: Date | null; visibleUntil?: Date | null }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  if (v.visibleFrom && v.visibleUntil && v.visibleUntil.getTime() <= v.visibleFrom.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['visibleUntil'],
      message: 'La fecha de fin debe ser posterior a la fecha de inicio.',
    });
  }
}

// ---------- paginación y filtros ----------

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1, 'La página debe ser 1 o mayor.').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'El tamaño de página debe ser 1 o mayor.')
    .max(100, 'El tamaño de página no puede superar 100.')
    .default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

// ---------- auth y usuarios ----------

export const loginInput = z.object({
  email: email('El correo'),
  password: z
    .string({ required_error: 'La contraseña es obligatoria.' })
    .min(1, 'La contraseña es obligatoria.')
    .max(128),
  remember: z.boolean().optional().default(false),
});
export type LoginInput = z.infer<typeof loginInput>;

export const changePasswordInput = z
  .object({
    current: z
      .string({ required_error: 'Ingresá tu contraseña actual.' })
      .min(1, 'Ingresá tu contraseña actual.'),
    next: password('La nueva contraseña'),
  })
  .refine((v) => v.current !== v.next, {
    path: ['next'],
    message: 'La nueva contraseña debe ser distinta de la actual.',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;

export const userCreateInput = z.object({
  name: text('El nombre', 120),
  email: email('El correo'),
  /** Rol asignado (RF11): un ADMIN solo asigna roles cuyos permisos tiene y nunca SUPERADMIN. */
  roleId: uuid('El rol'),
  /** Opcional: si falta, la API genera una clave temporal y obliga a cambiarla. */
  password: password().optional(),
});
export type UserCreateInput = z.infer<typeof userCreateInput>;

export const userUpdateInput = z
  .object({
    name: text('El nombre', 120).optional(),
    email: email('El correo').optional(),
    roleId: uuid('El rol').optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' });
export type UserUpdateInput = z.infer<typeof userUpdateInput>;

export const userListQuery = paginationQuery.extend({
  roleId: uuid('El rol').optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  q: z.string().trim().max(100).optional(),
});

// ---------- roles y permisos (RF11, solo SUPERADMIN) ----------

/**
 * Lista de permisos de un rol. Rechaza (400) acciones que no existen en el catálogo y las
 * reservadas al Superadministrador (`roles:manage`). Quita repetidos.
 */
export const rolePermissionList = z
  .array(z.string({ invalid_type_error: 'Cada permiso debe ser un texto.' }), {
    invalid_type_error: 'Los permisos deben ser una lista.',
  })
  .max(ACTIONS.length, 'Hay más permisos de los que existen.')
  .superRefine((list, ctx) => {
    for (const p of list) {
      if ((RESERVED_ACTIONS as readonly string[]).includes(p)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El permiso ${p} es exclusivo del Superadministrador.`,
        });
      } else if (!(ACTIONS as readonly string[]).includes(p)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El permiso ${p} no existe.` });
      }
    }
  })
  .transform((list) => [...new Set(list)]);

export const roleCreateInput = z.object({
  name: text('El nombre del rol', 80),
  description: optionalText('La descripción', 300),
  permissions: rolePermissionList.optional().default([]),
});
export type RoleCreateInput = z.infer<typeof roleCreateInput>;

export const roleUpdateInput = z
  .object({
    name: text('El nombre del rol', 80).optional(),
    // .optional() afuera: si no se envía queda undefined (no borra la descripción guardada).
    description: optionalText('La descripción', 300).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'No hay cambios para guardar.',
  });
export type RoleUpdateInput = z.infer<typeof roleUpdateInput>;

export const rolePermissionsInput = z.object({
  permissions: rolePermissionList,
});
export type RolePermissionsInput = z.infer<typeof rolePermissionsInput>;

// ---------- categorías ----------

export const categoryInput = z.object({
  name: text('El nombre de la categoría', 80),
  kind: enumOf('El tipo de categoría', CATEGORY_KINDS),
});
export type CategoryInput = z.infer<typeof categoryInput>;

// ---------- publicaciones ----------

const publicationBase = z.object({
  kind: enumOf('El tipo', PUBLICATION_KINDS).default('NEWS'),
  title: text('El título', 160),
  summary: text('El resumen', 400),
  body: z.string().max(20000, 'El texto no puede superar los 20000 caracteres.').default(''),
  coverUrl: optionalText('La imagen de portada', 2000),
  categoryId: uuid('La categoría').nullish(),
  section: enumOf('La sección', PUBLICATION_SECTIONS).default('BOTH'),
  visibleFrom: optionalDate('La fecha de inicio', 'start'),
  visibleUntil: optionalDate('La fecha de fin', 'end'),
  eventStart: optionalDate('El inicio del evento', 'start'),
  eventEnd: optionalDate('El fin del evento', 'end'),
  location: optionalText('El lugar', 200),
});

function eventRefine(
  v: { eventStart?: Date | null; eventEnd?: Date | null },
  ctx: z.RefinementCtx,
) {
  if (v.eventStart && v.eventEnd && v.eventEnd.getTime() < v.eventStart.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['eventEnd'],
      message: 'El fin del evento no puede ser anterior a su inicio.',
    });
  }
}

export const publicationCreateInput = publicationBase.superRefine((v, ctx) => {
  windowRefine(v, ctx);
  eventRefine(v, ctx);
});
export type PublicationCreateInput = z.infer<typeof publicationCreateInput>;

/**
 * Precondición de concurrencia (A10): la portada que el cliente vio al abrir el formulario. Si se
 * envía, el cambio se aplica SOLO si la portada guardada sigue siendo esa; si alguien la cambió en el
 * medio, la API responde 409 y no pisa nada. `null` = "no tenía portada". Si no se envía, la API usa la
 * portada que lee al recibir el pedido.
 */
const expectedCoverUrl = z
  .string({ invalid_type_error: 'La portada esperada no es válida.' })
  .max(2000, 'La portada esperada no puede superar los 2000 caracteres.')
  .nullable()
  .optional();

export const publicationUpdateInput = publicationBase
  .partial()
  .extend({ expectedCoverUrl })
  .superRefine((v, ctx) => {
    windowRefine(v, ctx);
    eventRefine(v, ctx);
  })
  // La precondición sola no es un cambio.
  .refine((v) => Object.keys(v).some((k) => k !== 'expectedCoverUrl'), {
    message: 'No hay cambios para guardar.',
  });
export type PublicationUpdateInput = z.infer<typeof publicationUpdateInput>;

/**
 * Campos de texto que acompañan a `POST /publications/:id/cover` (multipart). `expectedCoverUrl`
 * vacío = "no tenía portada"; ausente = sin precondición del cliente.
 */
export const publicationCoverUploadFields = z.object({
  expectedCoverUrl: z
    .string({ invalid_type_error: 'La portada esperada no es válida.' })
    .max(2000, 'La portada esperada no puede superar los 2000 caracteres.')
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '' ? null : v)),
});

/** Programar / reactivar con nueva vigencia. */
export const publicationScheduleInput = z
  .object({
    visibleFrom: dateTime('La fecha de inicio', 'start'),
    visibleUntil: optionalDate('La fecha de fin', 'end'),
  })
  .superRefine(windowRefine);

export const publicationReactivateInput = z
  .object({
    visibleFrom: optionalDate('La fecha de inicio', 'start'),
    visibleUntil: optionalDate('La fecha de fin', 'end'),
  })
  .superRefine(windowRefine);

export const publicationListQuery = paginationQuery.extend({
  status: enumOf('El estado', PUBLICATION_STATUSES).optional(),
  origin: enumOf('El origen', PUBLICATION_ORIGINS).optional(),
  q: z.string().trim().max(100).optional(),
});

// ---------- redes sociales (moderación) ----------

export const socialListQuery = paginationQuery.extend({
  status: enumOf('El estado', SOCIAL_STATUSES).optional(),
  /** Origen de la publicación de redes: traída de Instagram o cargada a mano (contingencia). */
  source: enumOf('El origen', ['instagram', 'manual'] as const).optional(),
});

export const socialApproveInput = z
  .object({
    title: optionalText('El título', 160),
    summary: optionalText('El resumen', 400),
    section: enumOf('La sección', PUBLICATION_SECTIONS),
    categoryId: uuid('La categoría').nullish(),
    visibleFrom: optionalDate('La fecha de inicio', 'start'),
    visibleUntil: optionalDate('La fecha de fin', 'end'),
    consentConfirmed: z.literal(true, {
      errorMap: () => ({
        message: 'Confirmá que existe consentimiento para publicar imágenes de estudiantes.',
      }),
    }),
  })
  .superRefine(windowRefine);
export type SocialApproveInput = z.infer<typeof socialApproveInput>;

/** Carga manual de una publicación de redes (contingencia, mismo flujo de moderación). */
export const socialManualInput = z.object({
  permalink: url('El enlace a la publicación'),
  caption: text('La leyenda', 2200),
  mediaUrl: url('La dirección de la imagen'),
  postedAt: dateTime('La fecha de publicación', 'start'),
});
export type SocialManualInput = z.infer<typeof socialManualInput>;

// ---------- avisos ----------

const noticeBase = z.object({
  title: text('El título', 160),
  body: text('El texto del aviso', 5000),
  categoryId: uuid('La categoría').nullish(),
  audience: enumOf('El destinatario', NOTICE_AUDIENCES).default('ALL'),
  urgent: z.boolean().default(false),
  highlighted: z.boolean().default(false),
  visibleFrom: optionalDate('La fecha de inicio', 'start'),
  visibleUntil: optionalDate('La fecha de fin', 'end'),
  attachmentId: uuid('El adjunto').nullish(),
});

export const noticeCreateInput = noticeBase.superRefine(windowRefine);
export type NoticeCreateInput = z.infer<typeof noticeCreateInput>;

export const noticeUpdateInput = noticeBase
  .partial()
  .superRefine(windowRefine)
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' });
export type NoticeUpdateInput = z.infer<typeof noticeUpdateInput>;

export const noticeListQuery = paginationQuery.extend({
  status: enumOf('El estado', NOTICE_VIEW_STATUSES).default('ALL'),
  audience: enumOf('El destinatario', NOTICE_AUDIENCES).optional(),
});

/** Reanudar un aviso (opcionalmente con nueva vigencia). */
export const noticeResumeInput = z
  .object({ visibleUntil: optionalDate('La fecha de fin', 'end') })
  .default({});

// ---------- ciclos, horarios y llamados ----------

export const termCreateInput = z
  .object({
    year: z
      .number({
        required_error: 'El año lectivo es obligatorio.',
        invalid_type_error: 'El año lectivo debe ser un número.',
      })
      .int('El año lectivo debe ser un número entero.')
      .min(2000, 'El año lectivo no es válido.')
      .max(2100, 'El año lectivo no es válido.'),
    kind: enumOf('El período', TERM_KINDS),
    startsOn: optionalDate('La fecha de inicio', 'start'),
    endsOn: optionalDate('La fecha de fin', 'end'),
  })
  .superRefine((v, ctx) => {
    if (v.startsOn && v.endsOn && v.endsOn.getTime() <= v.startsOn.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsOn'],
        message: 'La fecha de fin debe ser posterior a la fecha de inicio.',
      });
    }
  });
export type TermCreateInput = z.infer<typeof termCreateInput>;

export const scheduleCreateInput = z.object({
  termId: uuid('El ciclo'),
  commissionName: text('El nombre de la comisión', 80),
  documentId: uuid('El archivo de la grilla').nullish(),
  notes: optionalText('Las notas', 1000),
});
export type ScheduleCreateInput = z.infer<typeof scheduleCreateInput>;

export const scheduleUpdateInput = scheduleCreateInput
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' });

export const examCallCreateInput = z
  .object({
    termId: uuid('El ciclo'),
    name: text('El nombre del llamado', 160),
    startsOn: dateTime('La fecha de inicio', 'start'),
    endsOn: dateTime('La fecha de fin', 'end'),
    enrollmentOpen: z.boolean().default(false),
    highlighted: z.boolean().default(false),
    documentId: uuid('El archivo del cronograma').nullish(),
    notes: optionalText('Las notas', 1000),
  })
  .superRefine((v, ctx) => {
    if (v.endsOn.getTime() < v.startsOn.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsOn'],
        message: 'La fecha de fin no puede ser anterior a la de inicio.',
      });
    }
  });
export type ExamCallCreateInput = z.infer<typeof examCallCreateInput>;

export const examCallUpdateInput = z
  .object({
    name: text('El nombre del llamado', 160),
    startsOn: dateTime('La fecha de inicio', 'start'),
    endsOn: dateTime('La fecha de fin', 'end'),
    enrollmentOpen: z.boolean(),
    highlighted: z.boolean(),
    documentId: uuid('El archivo del cronograma').nullable(),
    notes: optionalText('Las notas', 1000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' })
  .superRefine((v, ctx) => {
    if (v.startsOn && v.endsOn && v.endsOn.getTime() < v.startsOn.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsOn'],
        message: 'La fecha de fin no puede ser anterior a la de inicio.',
      });
    }
  });

// ---------- documentos (metadatos del multipart) ----------

export const documentMetaInput = z.object({
  title: text('El título del documento', 200),
  kind: enumOf('El tipo de documento', DOCUMENT_KINDS).default('OTHER'),
  category: optionalText('La categoría', 80),
  cycleYear: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? null : Number(v)),
    z
      .number({ invalid_type_error: 'El ciclo lectivo debe ser un año (por ejemplo 2026).' })
      .int('El ciclo lectivo debe ser un año (por ejemplo 2026).')
      .min(2000, 'El ciclo lectivo no es válido.')
      .max(2100, 'El ciclo lectivo no es válido.')
      .nullable(),
  ),
  termLabel: optionalText('El cuatrimestre', 40),
  resolutionCode: optionalText('El código de resolución', 80),
});
export type DocumentMetaInput = z.infer<typeof documentMetaInput>;

export const documentListQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  kind: enumOf('El tipo', DOCUMENT_KINDS).optional(),
  cycleYear: z.coerce.number().int().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

// ---------- ajustes, enlaces, contenido ----------

/** Texto de ajuste que se puede vaciar (vacío = usar el valor por defecto de la pantalla). */
const optionalSetting = (label: string, max: number) => {
  const w = agree(label);
  return z
    .string({ invalid_type_error: `${label} no ${w.es} ${w.valido}.` })
    .trim()
    .max(max, `${label} no ${w.puede} superar los ${max} caracteres.`);
};

export const settingsUpdateInput = z
  .object({
    phone: text('El teléfono', 60),
    email_institutional: email('El correo institucional'),
    email_bedelia: email('El correo de bedelía'),
    email_trabajos_practicos: email('El correo de trabajos prácticos'),
    address: text('La dirección', 200),
    instagram_url: url('La dirección de Instagram'),
    facebook_url: url('La dirección de Facebook'),
    instagram_hashtag: z
      .string()
      .trim()
      .regex(
        /^#?[\p{L}\p{N}_]{2,50}$/u,
        'El hashtag debe tener entre 2 y 50 letras, números o guiones bajos.',
      )
      .transform((v) => (v.startsWith('#') ? v : `#${v}`)),
    exam_enrollment_open: z.boolean(),
    tagline: text('La frase institucional', 300),
    institution_name: text('El nombre de la institución', 200),
    institution_short: text('La sigla de la institución', 40),
    institution_subtitle: text('El subtítulo institucional', 200),
    footer_text: text('El texto del pie', 300),
    career_name: text('El nombre de la carrera', 200),
    hero_title: optionalSetting('El titular de Inicio', 120),
    hero_eyebrow: optionalSetting('El rótulo del encabezado de Inicio', 120),
    logo_url: imageRef('El logo'),
    hero_image_1: imageRef('La primera imagen de Inicio', 'f'),
    hero_image_2: imageRef('La segunda imagen de Inicio', 'f'),
    career_image: imageRef('La imagen de La carrera', 'f'),
    ingreso_image: imageRef('La imagen de Ingreso', 'f'),
    student_gallery: z
      .string({ invalid_type_error: 'La galería no es válida.' })
      .trim()
      .max(2000, 'La galería es demasiado larga.')
      .refine(
        (v) =>
          v === '' ||
          v
            .split(LINE_BREAK)
            .filter((l) => l.trim())
            .every((l) => IMAGE_REF_RE.test((l.split('|')[0] ?? '').trim())),
        'Cada línea de la galería debe empezar con una ruta del sitio (/...) o una dirección web, y luego título y descripción separados por |.',
      ),
  })
  .partial()
  .strict('Hay ajustes que no existen.')
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' });
export type SettingsUpdateInput = z.infer<typeof settingsUpdateInput>;
export const _settingKeysCheck: readonly string[] = SETTING_KEYS;

export const linkInput = z.object({
  title: text('El título del enlace', 160),
  url: url('La dirección del enlace'),
  description: optionalText('La descripción', 400),
  group: text('El grupo', 60).default('academico'),
  order: z.number().int().min(0).max(1000).default(0),
  visible: z.boolean().default(true),
  /** A07: es el enlace donde los alumnos se inscriben (se muestra en /inscripciones). */
  enrollment: z.boolean().default(false),
});
export type LinkInput = z.infer<typeof linkInput>;

export const linkUpdateInput = linkInput
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' });

export const contentPageParam = enumOf('La página', CONTENT_PAGES);

export const contentSectionInput = z.object({
  title: text('El título de la sección', 160),
  body: z
    .string({ required_error: 'El texto es obligatorio.' })
    .max(50000, 'El texto es demasiado largo.'),
  order: z.number().int().min(0).max(1000).default(0),
  visible: z.boolean().default(true),
});
export type ContentSectionInput = z.infer<typeof contentSectionInput>;

// ---------- contacto ----------

export const contactInput = z.object({
  name: text('El nombre', 120),
  email: email('El correo'),
  subject: text('El asunto', 160),
  message: text('El mensaje', 4000),
  consent: z.literal(true, {
    errorMap: () => ({
      message: 'Para enviar la consulta tenés que aceptar el aviso de uso de datos personales.',
    }),
  }),
});
export type ContactInput = z.infer<typeof contactInput>;

// ---------- integraciones (configuración que carga el cliente desde el panel) ----------

export const instagramConfigInput = z
  .object({
    mode: enumOf('El modo', ['demo', 'real'] as const),
    /** Método de conexión: OAuth (App ID y Secret) o token pegado (sin App ID ni Secret). */
    connectionMethod: enumOf('El método de conexión', ['oauth', 'token'] as const),
    appId: z.string().trim().min(1, 'El App ID es obligatorio.').max(100),
    /** Si no viene, se conserva el secreto guardado. */
    appSecret: z.string().trim().min(1, 'El App Secret no puede estar vacío.').max(200).optional(),
    hashtag: z
      .string()
      .trim()
      .regex(
        /^#?[\p{L}\p{N}_]{2,50}$/u,
        'El hashtag debe tener entre 2 y 50 letras, números o guiones bajos.',
      )
      .transform((v) => (v.startsWith('#') ? v : `#${v}`))
      .optional(),
    /** Alternativa a OAuth: pegar un token de acceso de larga duración. */
    accessToken: z.string().trim().min(10, 'El token de acceso no es válido.').max(2000).optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' });
export type InstagramConfigInput = z.infer<typeof instagramConfigInput>;

export const mailConfigInput = z
  .object({
    contactToEmail: email('El correo de destino'),
    smtpUrl: z
      .string()
      .trim()
      .regex(/^smtps?:\/\/.+/, 'La conexión SMTP debe empezar con smtp:// o smtps://.')
      .max(500)
      .nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios para guardar.' });
export type MailConfigInput = z.infer<typeof mailConfigInput>;

export const idParam = z.object({ id: uuid('El identificador') });
