/**
 * Plan de estudios de la Tecnicatura Superior en Emprendimientos Gastronómicos (datos reales).
 *
 * FUENTE: Resolución MEGC 1202/07, "Presentación de la estructura curricular" (págs. 8-9) y
 * "Correlatividades" (págs. 60-61), PDF `3 - Marco normativo y plan de carrera`, contrastada con la
 * ficha `2 - Tecnicatura Superior en Emprendimientos Gastronómicos` entregada por el cliente.
 * Las horas son horas CÁTEDRA. Los totales de cada área y el de la carrera (2758 hs) cierran con la
 * resolución. La ficha tiene la tabla de horas desalineada al extraer el texto: se usó la resolución.
 *
 * LÍMITE: ni la ficha ni la resolución indican en qué AÑO o cuatrimestre se cursa cada instancia
 * (solo el régimen: cuatrimestral o anual). Por eso el plan se organiza por área formativa y la
 * ubicación por año queda como "[a confirmar con el cliente]" (Q120); no se inventa.
 *
 * Es solo el valor inicial: en la plataforma vive en `ContentSection` y se edita desde el panel.
 */

export interface PlanItem {
  name: string;
  regime: string;
  detail: string;
}

export interface PlanArea {
  slug: string;
  title: string;
  /** Total de horas cátedra del área, según la resolución. */
  total: number;
  /** Porcentaje del total de la carrera, tal como figura en la resolución. */
  percent: string;
  items: PlanItem[];
}

const sem = (weekly: number, total: number) => `${weekly} hs semanales, ${total} hs`;
const COURSE = 'materia cuatrimestral';
const WORKSHOP = 'taller cuatrimestral';

export const PLAN: PlanArea[] = [
  {
    slug: 'plan-analisis-sector',
    title: 'Análisis del Sector Servicios Gastronómicos',
    total: 256,
    percent: '9,28',
    items: [
      { name: 'Introducción a la Gastronomía', regime: COURSE, detail: sem(3, 48) },
      { name: 'Industria de la hospitalidad', regime: COURSE, detail: sem(3, 48) },
      { name: 'Principios de Economía', regime: COURSE, detail: sem(3, 48) },
      { name: 'Herramientas de investigación', regime: COURSE, detail: sem(4, 64) },
      { name: 'Organización empresarial', regime: COURSE, detail: sem(3, 48) },
    ],
  },
  {
    slug: 'plan-produccion',
    title: 'Proceso de Producción Gastronómica',
    total: 1378,
    percent: '49,96',
    items: [
      {
        name: 'Elaboraciones a base de vegetales, cereales y huevos',
        regime: WORKSHOP,
        detail: sem(9, 144),
      },
      { name: 'Elaboraciones a base de carnes', regime: WORKSHOP, detail: sem(9, 144) },
      { name: 'Elaboración de pizzas y pastas', regime: WORKSHOP, detail: sem(6, 96) },
      { name: 'Elaboraciones de buffet', regime: WORKSHOP, detail: sem(6, 96) },
      { name: 'Servicios de catering', regime: WORKSHOP, detail: sem(4, 64) },
      { name: 'Cocina nacional e internacional', regime: WORKSHOP, detail: sem(4, 64) },
      { name: 'Taller de primeros auxilios', regime: WORKSHOP, detail: sem(3, 48) },
      {
        name: 'Seguridad e higiene en la Gastronomía',
        regime: 'materia anual',
        detail: sem(3, 96),
      },
      { name: 'Elaboraciones de Panadería', regime: COURSE, detail: sem(5, 80) },
      { name: 'Pastelería básica', regime: WORKSHOP, detail: sem(6, 96) },
      { name: 'Repostería', regime: COURSE, detail: sem(4, 64) },
      { name: 'Bebidas', regime: COURSE, detail: sem(3, 48) },
      { name: 'Elementos de Química', regime: COURSE, detail: sem(4, 64) },
      { name: 'Nutrición', regime: COURSE, detail: sem(4, 64) },
      {
        name: 'Laboratorio de tecnología de los alimentos',
        regime: 'laboratorio cuatrimestral',
        detail: sem(5, 80),
      },
      { name: 'Taller de Francés técnico', regime: WORKSHOP, detail: sem(4, 64) },
      {
        name: 'Seminario de actualización / profundización',
        regime: 'seminario cuatrimestral',
        detail: '3 hs semanales y 18 hs de trabajo autónomo, 66 hs',
      },
    ],
  },
  {
    slug: 'plan-gestion',
    title: 'Gestión y Administración Gastronómica',
    total: 778,
    percent: '28,21',
    items: [
      { name: 'Introducción general a la microempresa', regime: COURSE, detail: sem(4, 64) },
      {
        name: 'Elementos de Administración y Contabilidad',
        regime: 'materia anual',
        detail: sem(4, 128),
      },
      { name: 'Comercialización', regime: COURSE, detail: sem(3, 48) },
      { name: 'Recursos humanos', regime: COURSE, detail: sem(4, 64) },
      { name: 'Compras y gestión de stock', regime: COURSE, detail: sem(3, 48) },
      { name: 'Organización de eventos gastronómicos', regime: COURSE, detail: sem(5, 80) },
      { name: 'Taller de conducción de equipos de trabajo', regime: WORKSHOP, detail: sem(4, 64) },
      {
        name: 'Taller de comunicación escrita',
        regime: WORKSHOP,
        detail: '3 hs semanales y 24 hs de trabajo autónomo, 72 hs',
      },
      { name: 'Inglés', regime: WORKSHOP, detail: sem(3, 48) },
      { name: 'Inglés técnico', regime: WORKSHOP, detail: sem(3, 48) },
      { name: 'Taller de Informática', regime: WORKSHOP, detail: sem(3, 48) },
      {
        name: 'Seminario de actualización / profundización',
        regime: 'seminario cuatrimestral',
        detail: '3 hs semanales y 18 hs de trabajo autónomo, 66 hs',
      },
    ],
  },
  {
    slug: 'plan-practicas',
    title: 'Prácticas Profesionales',
    total: 346,
    percent: '12,55',
    items: [
      {
        name: 'Práctica Profesional 1: Observación organizacional',
        regime: WORKSHOP,
        detail: '3 hs semanales (48 hs) más 3 semanas de 10 hs en terreno (30 hs), 78 hs',
      },
      {
        name: 'Práctica Profesional 2: Organización de la producción',
        regime: WORKSHOP,
        detail: '3 hs semanales (48 hs) más 4 semanas de 15 hs en terreno (60 hs), 108 hs',
      },
      {
        name: 'Práctica Profesional 3: Diseño de Emprendimientos Gastronómicos',
        regime: WORKSHOP,
        detail: '6 hs semanales (96 hs) y 64 hs de trabajo autónomo, 160 hs',
      },
    ],
  },
];

/**
 * Correlatividades: [instancia, qué hay que tener]. Se transcriben con los nombres de la resolución
 * (algunos difieren del plan: "Química", "Panadería", "Taller de producción escrita", "Práctica 2 –
 * Producción gastronómica"; ver Q121).
 */
export const CORRELATIVIDADES: [string, string][] = [
  [
    'Elaboraciones a base de vegetales, cereales y huevos',
    'Introducción a la Gastronomía, Seguridad e higiene en la Gastronomía y Taller de primeros auxilios (en curso)',
  ],
  [
    'Elaboraciones a base de carnes',
    'Elaboraciones a base de vegetales, cereales y huevos (aprobada)',
  ],
  ['Elaboración de pizzas y pastas', 'Panadería (cursada o en curso)'],
  ['Repostería', 'Pastelería básica (cursada aprobada)'],
  ['Laboratorio de tecnología de los alimentos', 'Química (cursada aprobada)'],
  [
    'Elaboraciones de buffet',
    'Elaboraciones a base de vegetales, cereales y huevos y Elaboraciones a base de carnes (aprobadas)',
  ],
  [
    'Comercialización',
    'Principios de Economía (aprobada) e Introducción a la microempresa (cursada aprobada)',
  ],
  [
    'Cocina nacional e internacional',
    'Elaboraciones a base de vegetales, cereales y huevos y Elaboraciones a base de carnes (cursadas aprobadas)',
  ],
  ['Compras y gestión de stock', 'Elementos de Administración y Contabilidad (cursada aprobada)'],
  [
    'Organización de eventos gastronómicos',
    'Compras y gestión de stock y Servicios de catering (cursada aprobada o en curso)',
  ],
  [
    'Práctica 1 – Observación organizacional',
    'Taller de producción escrita e Introducción a la Gastronomía (cursada aprobada)',
  ],
  [
    'Práctica 2 – Producción gastronómica',
    'Práctica 1, Elaboraciones a base de vegetales, cereales y huevos y Elaboraciones a base de carnes (aprobadas); Elaboraciones de buffet y Elementos de Administración y Contabilidad (en curso)',
  ],
  [
    'Práctica 3 – Diseño de emprendimientos gastronómicos',
    'Comercialización, Herramientas de investigación, Práctica 1 y Práctica 2 (aprobadas); Compras y gestión de stock (cursada aprobada) y hasta el 25 % en curso simultáneo',
  ],
];
