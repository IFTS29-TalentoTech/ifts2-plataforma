/**
 * Catálogo de BLOQUES de cada página del sitio público (ADR-042).
 *
 * Un bloque es una parte visible de una página, en el orden en que se ve de arriba hacia abajo
 * ("Encabezado", "Avisos", "Contacto"…). El panel "Páginas del sitio" lista estos bloques para que
 * quien edita sepa qué es cada cosa, dónde se ve y pueda mostrarla u ocultarla. Es la ÚNICA fuente de
 * verdad: el panel y las páginas públicas usan los mismos identificadores.
 *
 * Reglas:
 * - Los bloques FIJOS (los que trae el sitio) NO se eliminan: solo se muestran u ocultan, porque si se
 *   eliminaran no podrían recrearse. Solo se eliminan las secciones que agrega una persona.
 * - Mostrar/ocultar un bloque de este catálogo se guarda en el ajuste `hidden_blocks` (lista de
 *   identificadores ocultos). Las secciones de texto fijas se ocultan con su propio `visible`.
 * - Los bloques con `canHide: false` (el encabezado de cada página) siempre se muestran: sin ellos la
 *   página quedaría sin título.
 * - Nada se calcula por tarea programada: el sitio lee la lista al consultar (RF03, regla 3).
 */
/** Páginas del sitio que se editan en el panel (Inicio incluida). */
export const SITE_PAGES = [
  'inicio',
  'institucional',
  'carrera',
  'estudiantes',
  'ingreso',
  'inscripciones',
] as const;
export type SitePage = (typeof SITE_PAGES)[number];

/** Nombre de cada página tal como se ve en el menú del sitio. */
export const SITE_PAGE_LABELS: Record<SitePage, string> = {
  inicio: 'Inicio',
  institucional: 'Institucional',
  carrera: 'La carrera',
  estudiantes: 'Estudiantes',
  ingreso: 'Ingreso',
  inscripciones: 'Inscripciones',
};

/** Dirección pública de cada página (para el enlace "Ver la página en el sitio"). */
export const SITE_PAGE_PATHS: Record<SitePage, string> = {
  inicio: '/',
  institucional: '/institucional',
  carrera: '/la-carrera',
  estudiantes: '/estudiantes',
  ingreso: '/ingreso',
  inscripciones: '/inscripciones',
};

/**
 * De dónde sale el contenido del bloque:
 * - `textos`: se edita con «Cambiar textos e imágenes» de la página.
 * - `seccion`: es una sección de texto fija (se edita su título y su texto).
 * - `otra-pantalla`: se carga en otra pantalla del panel (avisos, horarios, novedades, plantel…).
 * - `enlaces`: son los enlaces de interés (Configuración > Enlaces de interés).
 * - `fijo`: lo arma el sitio solo; acá solo se muestra u oculta.
 */
export type BlockSource = 'textos' | 'seccion' | 'otra-pantalla' | 'enlaces' | 'fijo';

export interface PageBlockDef {
  /** Identificador estable: `<página>.<bloque>`. Se guarda en `hidden_blocks`; no se renombra. */
  id: string;
  /** Nombre en lenguaje común. */
  name: string;
  /** Qué es y cómo se ve. */
  description: string;
  source: BlockSource;
  /** `false` = siempre se muestra (el encabezado). */
  canHide: boolean;
  /** Pantalla del panel donde se carga el contenido (solo `otra-pantalla` y `enlaces`). */
  editHref?: string;
  /** Texto del botón que lleva a `editHref`. */
  editLabel?: string;
}

/** Un lugar de la página: un bloque fijo o el sitio donde se muestran las secciones agregadas. */
export type PageSlot =
  | { type: 'block'; block: PageBlockDef }
  /** Secciones de TEXTO (las fijas y las que agrega una persona), en su orden. */
  | { type: 'sections' }
  /** Secciones de GALERÍA de fotos que agrega una persona. */
  | { type: 'galleries' };

const ENLACES_HREF = '/panel/configuracion';
const ENLACES_LABEL = 'Elegir los enlaces (Configuración > Enlaces de interés)';

const block = (b: PageBlockDef): PageSlot => ({ type: 'block', block: b });

/**
 * Orden real de cada página pública, de arriba hacia abajo. Si se cambia el orden en
 * `app/(public)/<página>/page.tsx`, se cambia acá.
 */
export const PAGE_LAYOUT: Record<SitePage, PageSlot[]> = {
  inicio: [
    block({
      id: 'inicio.encabezado',
      name: 'Encabezado (lo primero que se ve)',
      description:
        'Rótulo chico, titular grande, frase institucional, las dos fotos y los botones «Conocé la carrera» y «Soy estudiante».',
      source: 'textos',
      canHide: false,
    }),
    block({
      id: 'inicio.accesos',
      name: 'Accesos rápidos',
      description:
        'Cuatro tarjetas que llevan a Plan de estudios, Horarios y exámenes, Ingreso y Contacto.',
      source: 'fijo',
      canHide: true,
    }),
    block({
      id: 'inicio.enlaces',
      name: 'Accesos académicos (enlaces de interés)',
      description:
        'Tarjetas con los enlaces de interés marcados para Inicio (por ejemplo SIU Guaraní o Aula virtual). Se ven debajo de los accesos rápidos.',
      source: 'enlaces',
      canHide: true,
      editHref: ENLACES_HREF,
      editLabel: ENLACES_LABEL,
    }),
    block({
      id: 'inicio.proximos',
      name: 'Próximos eventos',
      description:
        'Avisos y mesas de examen que marcaste como «destacar». Si no hay ninguno, el bloque no aparece.',
      source: 'otra-pantalla',
      canHide: true,
      editHref: '/panel/avisos',
      editLabel: 'Ir a Avisos académicos',
    }),
    block({
      id: 'inicio.actualidad',
      name: 'Actualidad institucional (novedades)',
      description: 'Las últimas publicaciones aprobadas, con el enlace «Ver todas las novedades».',
      source: 'otra-pantalla',
      canHide: true,
      editHref: '/panel/publicaciones',
      editLabel: 'Ir a Publicaciones',
    }),
    { type: 'sections' },
    { type: 'galleries' },
  ],
  institucional: [
    block({
      id: 'institucional.encabezado',
      name: 'Encabezado (título grande y texto de presentación)',
      description:
        'La primera sección: su título es el título grande de la página y su texto va en la franja de arriba. A la derecha se ve la dirección de la sede.',
      source: 'seccion',
      canHide: false,
    }),
    block({
      id: 'institucional.enlaces',
      name: 'Franja de enlaces relacionados',
      description:
        'Una franja con dos enlaces: «Ver plan de estudios de la carrera» y «Requisitos de ingreso para aspirantes».',
      source: 'fijo',
      canHide: true,
    }),
    { type: 'sections' },
    { type: 'galleries' },
    block({
      id: 'institucional.plantel',
      name: 'Plantel docente',
      description:
        'Las personas del plantel con su foto y su cargo. Si no hay ninguna, no aparece.',
      source: 'otra-pantalla',
      canHide: true,
      editHref: '/panel/plantel',
      editLabel: 'Ir a Plantel docente',
    }),
    block({
      id: 'institucional.contacto',
      name: 'Contacto',
      description:
        'A la izquierda los datos de la sede (dirección, teléfono, correos) y a la derecha el formulario de consultas.',
      source: 'fijo',
      canHide: true,
      editHref: '/panel/configuracion',
      editLabel: 'Cambiar los datos de la sede (Configuración)',
    }),
  ],
  carrera: [
    block({
      id: 'carrera.encabezado',
      name: 'Encabezado (título grande y ficha de la carrera)',
      description:
        'La primera sección: su título es el título grande de la página y su texto (título, duración, ingreso) va en la franja de arriba.',
      source: 'seccion',
      canHide: false,
    }),
    { type: 'sections' },
    { type: 'galleries' },
  ],
  estudiantes: [
    block({
      id: 'estudiantes.encabezado',
      name: 'Encabezado (título grande)',
      description:
        'El título «Información para estudiantes» y su frase de apoyo. Lo arma el sitio.',
      source: 'fijo',
      canHide: false,
    }),
    block({
      id: 'estudiantes.avisos',
      name: 'Avisos',
      description:
        'Los avisos académicos vigentes (los urgentes primero). Se cargan en Avisos académicos.',
      source: 'otra-pantalla',
      canHide: true,
      editHref: '/panel/avisos',
      editLabel: 'Ir a Avisos académicos',
    }),
    block({
      id: 'estudiantes.horarios',
      name: 'Horarios y exámenes',
      description:
        'El ciclo lectivo vigente, los horarios de cursada (a la izquierda) y las mesas de examen (a la derecha).',
      source: 'otra-pantalla',
      canHide: true,
      editHref: '/panel/horarios',
      editLabel: 'Ir a Horarios',
    }),
    { type: 'galleries' },
    block({
      id: 'estudiantes.accesos',
      name: 'Accesos académicos (enlaces de interés)',
      description:
        'Tarjetas con los enlaces de interés marcados para Estudiantes, y la nota sobre los períodos anteriores.',
      source: 'enlaces',
      canHide: true,
      editHref: ENLACES_HREF,
      editLabel: ENLACES_LABEL,
    }),
    { type: 'sections' },
  ],
  ingreso: [
    block({
      id: 'ingreso.encabezado',
      name: 'Encabezado (título grande y foto)',
      description: 'El título «Ingresá a…», su frase de apoyo y la foto de la derecha.',
      source: 'textos',
      canHide: false,
    }),
    { type: 'sections' },
    { type: 'galleries' },
    block({
      id: 'ingreso.avisos',
      name: 'Avisos para aspirantes',
      description:
        'Los avisos dirigidos a quienes quieren ingresar. Si no hay ninguno, no aparece.',
      source: 'otra-pantalla',
      canHide: true,
      editHref: '/panel/avisos',
      editLabel: 'Ir a Avisos académicos',
    }),
    block({
      id: 'ingreso.consultas',
      name: 'Franja «¿Tenés dudas sobre el ingreso?»',
      description: 'Un cartel de color con el botón «Ir a contacto».',
      source: 'fijo',
      canHide: true,
    }),
  ],
  inscripciones: [
    block({
      id: 'inscripciones.encabezado',
      name: 'Encabezado (título grande)',
      description:
        'El título «Inscripciones», su frase de apoyo y el botón «Quiero ingresar a la tecnicatura». Lo arma el sitio.',
      source: 'fijo',
      canHide: false,
    }),
    block({
      id: 'inscripciones.mesas',
      name: 'Mesas de examen con inscripción abierta',
      description:
        'Si la inscripción a mesas está habilitada y los llamados abiertos, con sus fechas. Se cargan en Horarios.',
      source: 'otra-pantalla',
      canHide: true,
      editHref: '/panel/horarios',
      editLabel: 'Ir a Horarios y mesas',
    }),
    block({
      id: 'inscripciones.donde',
      name: '¿Dónde me inscribo? (enlaces de interés)',
      description:
        'Los enlaces de interés marcados como «Inscripciones» y, abajo, el correo de Bedelía para dudas.',
      source: 'enlaces',
      canHide: true,
      editHref: ENLACES_HREF,
      editLabel: ENLACES_LABEL,
    }),
    { type: 'sections' },
    { type: 'galleries' },
  ],
};

/** Todos los bloques del catálogo (sin los lugares de secciones), con su página. */
export const ALL_PAGE_BLOCKS: { page: SitePage; block: PageBlockDef }[] = SITE_PAGES.flatMap(
  (page) =>
    PAGE_LAYOUT[page].flatMap((s) => (s.type === 'block' ? [{ page, block: s.block }] : [])),
);

/** Bloques que se pueden ocultar (los guarda `hidden_blocks`). */
export const HIDEABLE_BLOCK_IDS: readonly string[] = ALL_PAGE_BLOCKS.filter(
  (b) => b.block.canHide,
).map((b) => b.block.id);

/**
 * Secciones de texto que trae el sitio (la semilla). Se pueden ocultar (salvo el encabezado) y editar,
 * pero NO eliminar. Cualquier otra sección de texto la agregó una persona y sí se puede eliminar.
 * Clave: `<página>/<identificador>`.
 */
export interface FixedSectionInfo {
  name: string;
  description: string;
  /** `header` = encabezado de la página (siempre visible y primero). `card` = tarjeta o bloque de texto. */
  role: 'header' | 'card';
}

export const FIXED_SECTIONS: Record<string, FixedSectionInfo> = {
  'institucional/presentacion': {
    name: 'Encabezado: presentación del instituto',
    description: 'Su título es el título grande de la página y su texto va en la franja de arriba.',
    role: 'header',
  },
  'institucional/formacion-integral': {
    name: 'Tarjeta: Formación integral',
    description: 'Una tarjeta con ícono, título y texto (primera de la fila).',
    role: 'card',
  },
  'institucional/sede': {
    name: 'Tarjeta: Dónde estamos',
    description: 'Una tarjeta con ícono, título y texto (segunda de la fila).',
    role: 'card',
  },
  'carrera/titulo-y-duracion': {
    name: 'Encabezado: ficha de la carrera',
    description: 'Su título es el título grande de la página y su texto va en la franja de arriba.',
    role: 'header',
  },
  'carrera/perfil': {
    name: 'Perfil profesional',
    description:
      'Texto a la izquierda y, a la derecha, las fotos de la primera galería de la página.',
    role: 'card',
  },
  'carrera/areas-formativas': {
    name: 'Tarjeta: Áreas formativas',
    description: 'Una tarjeta con las áreas y sus horas.',
    role: 'card',
  },
  'carrera/plan-analisis-sector': {
    name: 'Tarjeta: Plan de estudios · Análisis del sector',
    description: 'Una tarjeta con las materias del área.',
    role: 'card',
  },
  'carrera/plan-produccion': {
    name: 'Tarjeta: Plan de estudios · Producción',
    description: 'Una tarjeta con las materias del área.',
    role: 'card',
  },
  'carrera/plan-gestion': {
    name: 'Tarjeta: Plan de estudios · Gestión',
    description: 'Una tarjeta con las materias del área.',
    role: 'card',
  },
  'carrera/plan-practicas': {
    name: 'Tarjeta: Plan de estudios · Prácticas',
    description: 'Una tarjeta con las materias del área.',
    role: 'card',
  },
  'carrera/plan-correlatividades': {
    name: 'Tarjeta: Correlatividades',
    description: 'Una tarjeta con lo que hay que tener aprobado para cursar cada materia.',
    role: 'card',
  },
  'carrera/plan-por-anio': {
    name: 'Tarjeta: Plan por año',
    description: 'Una tarjeta con en qué año se cursa cada materia (todavía a confirmar).',
    role: 'card',
  },
  'ingreso/proceso': {
    name: 'Pasos y próxima convocatoria',
    description:
      'La lista numerada del texto se ve como tarjetas «1 · Requisitos», «2 · …»; el resto del texto (por ejemplo las fechas) va en la tarjeta «Próxima convocatoria».',
    role: 'card',
  },
  'ingreso/requisitos': {
    name: 'Tarjeta: Requisitos de ingreso',
    description: 'Una tarjeta con título y texto, debajo de los pasos.',
    role: 'card',
  },
};

/** Información de una sección fija, o `undefined` si la agregó una persona. */
export function fixedSectionInfo(page: string, slug: string): FixedSectionInfo | undefined {
  return FIXED_SECTIONS[`${page}/${slug}`];
}

/** ¿Es una sección que trae el sitio (no se elimina)? */
export const isFixedSection = (page: string, slug: string): boolean =>
  fixedSectionInfo(page, slug) !== undefined;

/** ¿Es el encabezado de la página (siempre visible y primero)? */
export const isHeaderSection = (page: string, slug: string): boolean =>
  fixedSectionInfo(page, slug)?.role === 'header';

/** Lee el ajuste `hidden_blocks` (JSON con una lista de identificadores). Tolera valores rotos. */
export function parseHiddenBlocks(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && HIDEABLE_BLOCK_IDS.includes(x))
      : [];
  } catch {
    return [];
  }
}

/** ¿El bloque se muestra? Un bloque que no se puede ocultar siempre se muestra. */
export const isBlockVisible = (hidden: readonly string[], id: string): boolean =>
  !hidden.includes(id);
