// Datos reales del IFTS N.° 2 (docs/specs/08-contenido-y-datos-semilla.md). Son SOLO el valor inicial:
// en la plataforma viven en SiteSetting / ContentSection / ExternalLink y se editan desde el panel.

export const PLACEHOLDER_URL = 'https://pendiente.invalid/a-confirmar';

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
  // instagram_hashtag: [definir con el cliente] (Q1). Solo se carga en la semilla demo.
};

export interface LinkSeed {
  title: string;
  url: string;
  description?: string;
  group: string;
  order: number;
  visible: boolean;
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
    description: 'Gestión diaria de alumnos y primera inscripción a la Tecnicatura. [URL a confirmar con el cliente]',
    group: 'academico',
    order: 2,
    visible: false,
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
    body: '- Análisis del sector de servicios gastronómicos\n- Proceso de producción gastronómica\n- Gestión y administración gastronómica\n- Prácticas profesionales\n\n[completar] El plan completo por año, las horas y las correlatividades se cargan desde la ficha de la carrera y la resolución MEGC 1202/07.',
  },
  {
    page: 'ingreso',
    slug: 'proceso',
    title: '¿Cómo es el proceso?',
    order: 1,
    body: '1. Requisitos\n2. Preinscripción\n3. Confirmación\n\n[provisorio] Fechas sujetas a confirmación oficial por el instituto. Los requisitos, fechas y documentos de ingreso todavía no fueron relevados con el cliente.',
  },
];
