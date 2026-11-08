import { CORRELATIVIDADES, PLAN } from './seed-plan';

// Datos reales del IFTS N.° 2 (docs/specs/08-contenido-y-datos-semilla.md). Son SOLO el valor inicial:
// en la plataforma viven en SiteSetting / ContentSection / ExternalLink y se editan desde el panel.

export const PLACEHOLDER_URL = 'https://pendiente.invalid/a-confirmar';

/**
 * Diapositivas iniciales de las galerías editables (RF09, ADR-036). Son las imágenes PROVISORIAS del
 * Figma (ADR-035, Q63); el instituto las cambia desde Configuración -> Galerías.
 */
export interface GallerySeed {
  area: 'STUDENTS' | 'CAREER';
  image: string;
  title: string;
  caption: string;
  alt: string;
  /** Categoría provisoria para el filtro (US-30); sale del tema de cada foto, no de contenido institucional. */
  category: string;
}

const STUDENT_GALLERY: GallerySeed[] = [
  {
    area: 'STUDENTS',
    image: '/img/provisorio/vida-cocina-1.webp',
    title: 'Cocina compartida',
    category: 'Prácticas',
    caption: 'Prácticas en equipo y aprendizaje colaborativo.',
    alt: '',
  },
  {
    area: 'STUDENTS',
    image: '/img/provisorio/vida-cocina-2.webp',
    title: 'Ingredientes frescos',
    category: 'Ingredientes',
    caption: 'Selección y preparación de materia prima local.',
    alt: '',
  },
  {
    area: 'STUDENTS',
    image: '/img/provisorio/vida-cocina-3.webp',
    title: 'Presentación final',
    category: 'Platos',
    caption: 'Técnica, sabor y presentación en cada plato.',
    alt: '',
  },
];

export const GALLERY: GallerySeed[] = [
  ...STUDENT_GALLERY,
  {
    area: 'CAREER',
    image: '/img/provisorio/la-carrera-perfil.webp',
    title: '',
    category: 'Perfil',
    caption: '',
    alt: '',
  },
];

export const SETTINGS: Record<string, string> = {
  institution_name: 'Instituto de Formación Técnica Superior N.° 2 DE 20',
  institution_short: 'IFTS N.° 2',
  institution_subtitle: 'Tecnicatura Superior en Emprendimientos Gastronómicos',
  footer_text: 'IFTS N.° 2 • Tecnicatura Superior en Emprendimientos Gastronómicos',
  career_name: 'Tecnicatura Superior en Emprendimientos Gastronómicos',
  tagline: 'Nosotros no formamos chefs. Formamos empresarios/microempresarios gastronómicos.',
  phone: '4638-5656',
  email_institutional: 'dfts_ifts2_de20@bue.edu.ar',
  email_bedelia: 'bedelia.ifts2@gmail.com',
  email_trabajos_practicos: 'ayudantiaiftsn2@gmail.com',
  address: 'Cañada de Gómez 3850, Villa Lugano, CABA',
  instagram_url: 'https://www.instagram.com/ifts_2_ok/',
  facebook_url: 'https://www.facebook.com/iftsn2/',
  exam_enrollment_open: 'false',
  // Presentación del sitio público (Figma). Q64: titular corto + frase ancla (`tagline`) como subtítulo.
  hero_title: 'Formamos emprendedores gastronómicos',
  hero_eyebrow: 'Educación pública · Formación técnica',
  // Imágenes PROVISORIAS exportadas del Figma (ADR-035, Q63): el instituto las reemplaza desde
  // Configuración (ruta /img/... o dirección https) cuando entregue las suyas con consentimiento (RNF08).
  logo_url: '/img/provisorio/logo.webp',
  hero_image_1: '/img/provisorio/inicio-plato.webp',
  hero_image_2: '/img/provisorio/inicio-sarten.webp',
  career_image: '/img/provisorio/la-carrera-perfil.webp',
  ingreso_image: '/img/provisorio/ingreso-hero.webp',
  // Respaldo (ADR-036): se usa solo si no hay diapositivas cargadas en la galería editable.
  // Una tarjeta por línea: ruta | título | descripción.
  student_gallery: STUDENT_GALLERY.map((g) => `${g.image} | ${g.title} | ${g.caption}`).join('\n'),
  // instagram_hashtag: [definir con el cliente] (Q1). Solo se carga en la semilla demo.
};

export interface LinkSeed {
  title: string;
  url: string;
  description?: string;
  group: string;
  order: number;
  visible: boolean;
  /** A07: enlace donde se inscriben los alumnos (página /inscripciones). */
  enrollment?: boolean;
}

/** Los enlaces "a confirmar" quedan visible=false hasta tener la URL oficial (Q6). */
export const LINKS: LinkSeed[] = [
  {
    title: 'Aulas virtuales',
    url: 'https://aulasvirtuales.bue.edu.ar/',
    description: 'Agencia de Habilidades para el Futuro (Moodle).',
    group: 'academico',
    order: 1,
    visible: true,
  },
  {
    title: 'SIU Guaraní — Acceso alumnos',
    url: PLACEHOLDER_URL,
    description:
      'Gestión diaria de alumnos y primera inscripción a la Tecnicatura. [URL a confirmar con el cliente]',
    group: 'academico',
    order: 2,
    visible: false,
    // A07: es el destino de /inscripciones. Sigue oculto hasta tener la URL oficial (Q6), así que
    // mientras tanto la página muestra "enlace pendiente" y el contacto de Bedelía.
    enrollment: true,
  },
  {
    title: 'SIU Guaraní — Gestión académica',
    url: 'https://guarani-gestionagencia.bue.edu.ar/',
    description: 'Profesores y secretaría.',
    group: 'academico',
    order: 3,
    visible: true,
  },
  {
    title: 'Mi Argentina — Título digital',
    url: PLACEHOLDER_URL,
    description:
      'Podés ver tu Título Digital, emitido por el Gobierno de la Ciudad en el sistema SITED. [URL oficial a confirmar]',
    group: 'academico',
    order: 4,
    visible: false,
  },
  {
    title: 'Tutoría',
    url: PLACEHOLDER_URL,
    description: 'Contacto y orientación. [enlace o contacto a confirmar]',
    group: 'academico',
    order: 5,
    visible: false,
  },
];

export interface SectionSeed {
  page: 'institucional' | 'carrera' | 'ingreso';
  slug: string;
  title: string;
  body: string;
  order: number;
}

export const CONTENT: SectionSeed[] = [
  {
    page: 'institucional',
    slug: 'presentacion',
    title: 'Sobre el IFTS N.° 2',
    order: 1,
    body: 'El Instituto de Formación Técnica Superior N.° 2 DE 20 depende del Ministerio de Educación del Gobierno de la Ciudad de Buenos Aires. Hace 18 años forma emprendedores gastronómicos en una carrera corta de 3 años, gratuita y con título oficial de alcance nacional. La cursada es presencial en la sede de Villa Lugano.',
  },
  {
    page: 'institucional',
    slug: 'formacion-integral',
    title: 'Formación integral',
    order: 2,
    body: 'La formación abarca Cocina nacional e internacional, Repostería, Panadería y Servicios de catering, junto con Organización de eventos, Protocolo y Gestión contable. Nosotros no formamos chefs: formamos empresarios y microempresarios gastronómicos.',
  },
  {
    page: 'institucional',
    slug: 'sede',
    title: 'Dónde estamos',
    order: 3,
    body: 'Cañada de Gómez 3850, Villa Lugano, Ciudad Autónoma de Buenos Aires. Cursada presencial de lunes a viernes de 18:00 a 22:00 hs.',
  },
  {
    page: 'carrera',
    slug: 'titulo-y-duracion',
    title: 'Tecnicatura Superior en Emprendimientos Gastronómicos',
    order: 1,
    body: 'Título: Técnico/a Superior en Emprendimientos Gastronómicos, oficial y de alcance nacional. Duración: 3 años, 2758 horas cátedra. Requisito de ingreso: secundario completo.',
  },
  {
    page: 'carrera',
    slug: 'perfil',
    title: 'Más que cocinar: emprender y gestionar',
    order: 2,
    body: 'El egresado está capacitado para diseñar y gestionar emprendimientos gastronómicos y para tareas de planificación de la producción y elaboración de productos alimenticios aptos para el consumo, conforme a condiciones de higiene, seguridad y calidad.',
  },
  {
    page: 'carrera',
    slug: 'areas-formativas',
    title: 'Áreas formativas',
    order: 3,
    // Fuente: Resolución MEGC 1202/07 (ver seed-plan.ts).
    body: [
      'La carrera suma 2758 horas cátedra repartidas en cuatro áreas:',
      '',
      ...PLAN.map((a) => `- ${a.title}: ${a.total} hs cátedra (${a.percent} %)`),
      '',
      'Combina materias, talleres, un laboratorio y seminarios, anuales y cuatrimestrales. Las Prácticas Profesionales son uno de los ejes de la formación y culminan con el diseño de un emprendimiento gastronómico propio.',
    ].join('\n'),
  },
  ...PLAN.map((a, i): SectionSeed => ({
    page: 'carrera',
    slug: a.slug,
    title: `Plan de estudios · ${a.title}`,
    order: 4 + i,
    body: [
      ...a.items.map((m) => `- ${m.name}: ${m.regime}, ${m.detail}`),
      '',
      `Total del área: ${a.total} hs cátedra.`,
    ].join('\n'),
  })),
  {
    page: 'carrera',
    slug: 'plan-correlatividades',
    title: 'Correlatividades',
    order: 8,
    body: [
      'Para cursar cada instancia hay que tener:',
      '',
      ...CORRELATIVIDADES.map(([materia, requisito]) => `- ${materia}: ${requisito}`),
    ].join('\n'),
  },
  {
    page: 'carrera',
    slug: 'plan-por-anio',
    title: 'Plan por año',
    order: 9,
    body: 'En qué año y cuatrimestre se cursa cada instancia: [a confirmar con el cliente]. La ficha de la carrera y la resolución indican el régimen (cuatrimestral o anual) y la carga horaria, pero no la ubicación por año.',
  },
  {
    page: 'ingreso',
    slug: 'proceso',
    title: '¿Cómo es el proceso?',
    order: 1,
    body: '1. Requisitos\n2. Preinscripción\n3. Confirmación\n\nFechas de inscripción a la tecnicatura: [a confirmar con el cliente]',
  },
  {
    page: 'ingreso',
    slug: 'requisitos',
    title: 'Requisitos de ingreso',
    order: 2,
    // "Secundario completo" figura en la ficha de la carrera; lo demás no está en los documentos del cliente.
    body: 'Secundario completo (nivel medio aprobado). La carrera es gratuita, dura 3 años y otorga un título oficial de alcance nacional. La cursada es presencial, de lunes a viernes de 18:00 a 22:00 hs.\n\nDocumentación a presentar y modo de preinscripción: [a confirmar con el cliente]',
  },
];

/**
 * Roles del sistema (RF11). Nombres y descripciones son el valor inicial: el Superadministrador puede
 * cambiarlos desde el panel. Los permisos iniciales salen de DEFAULT_ROLE_PERMISSIONS (packages/shared).
 */
export const SYSTEM_ROLES = [
  {
    key: 'SUPERADMIN',
    name: 'Superadministrador',
    description: 'Crea roles y define sus permisos. Tiene acceso a todo.',
  },
  {
    key: 'ADMIN',
    name: 'Rectoría / Dirección',
    description: 'Configuración, usuarios, archivo y todo el contenido.',
  },
  {
    key: 'BEDELIA',
    name: 'Bedelía Académica',
    description: 'Horarios, mesas, avisos y cartelera.',
  },
  { key: 'EDITOR', name: 'Comunicación', description: 'Publicaciones, redes y novedades.' },
] as const;

/**
 * PLANTEL DE DEMOSTRACIÓN (RF10, ADR-037). Personas FICTICIAS: los nombres son obviamente inventados
 * ("Docente de ejemplo") y no corresponden a nadie del instituto. Se cargan SOLO con SEED_MODE=demo,
 * para poder mostrar la pantalla de Institucional y el panel; producción deja el plantel vacío y el
 * instituto carga el real (Q138). Las materias son nombres del plan de estudios ya sembrado
 * (Res. MEGC 1202/07). Sin fotos: no hay imágenes de personas con consentimiento. La última está
 * oculta a propósito, para mostrar la baja lógica.
 */
export interface TeacherSeed {
  name: string;
  /** Ilustración de ejemplo (no es una foto de una persona real): ver apps/web/public/img/provisorio/docentes. */
  photo: string;
  role: string;
  subjects: string[];
  visible: boolean;
}

export const DEMO_TEACHERS: TeacherSeed[] = [
  {
    name: 'Mariana Quiroga',
    photo: '/img/provisorio/docentes/docente-1.webp',
    role: 'Profesor/a (demostración)',
    subjects: ['Elaboraciones a base de carnes', 'Cocina nacional e internacional'],
    visible: true,
  },
  {
    name: 'Julián Bertolini',
    photo: '/img/provisorio/docentes/docente-2.webp',
    role: 'Profesor/a (demostración)',
    subjects: ['Elaboraciones de Panadería', 'Pastelería básica', 'Repostería'],
    visible: true,
  },
  {
    name: 'Lucía Ferrante',
    photo: '/img/provisorio/docentes/docente-3.webp',
    role: 'Profesor/a (demostración)',
    subjects: ['Elementos de Química', 'Nutrición'],
    visible: true,
  },
  {
    name: 'Martín Olivera',
    photo: '/img/provisorio/docentes/docente-4.webp',
    role: 'Profesor/a (demostración)',
    subjects: ['Introducción general a la microempresa', 'Comercialización'],
    visible: true,
  },
  {
    name: 'Sofía Ledesma',
    photo: '/img/provisorio/docentes/docente-5.webp',
    role: 'Profesor/a (demostración)',
    subjects: ['Organización de eventos gastronómicos'],
    visible: true,
  },
  {
    name: 'Esteban Rinaldi (oculto)',
    photo: '/img/provisorio/docentes/docente-6.webp',
    role: 'Profesor/a (demostración)',
    subjects: ['Taller de Francés técnico'],
    visible: false,
  },
];
