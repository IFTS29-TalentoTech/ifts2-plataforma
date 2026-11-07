/**
 * Semilla idempotente. Dos modos (SEED_MODE):
 *   prod  -> roles del sistema, superadministrador inicial (desde SEED_ADMIN_EMAIL /
 *            SEED_ADMIN_PASSWORD), ajustes y enlaces
 *            reales y el contenido de las páginas estancas (plan de estudios). Los enlaces
 *            "a confirmar" quedan visible=false. NUNCA carga datos de demostración.
 *   demo  -> todo lo de prod + un usuario por rol (Rectoría, Bedelía, Comunicación), ciclos, avisos, publicaciones, documentos, llamados,
 *            integraciones en modo demostración.
 * Se puede ejecutar varias veces sin duplicar.
 *
 * Contraseña de los usuarios de demostración: DEMO_PASSWORD (abajo). El administrador usa SEED_ADMIN_PASSWORD.
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { encryptJson } from '../apps/api/src/infra/crypto';
import { FAKE_MEDIA } from '../apps/api/src/infra/instagram/fake';
import { userTransaction } from '../apps/api/src/modules/users/transaction';
import { DEFAULT_ROLE_PERMISSIONS } from '../packages/shared/src/permissions';
import { CONTENT, DEMO_TEACHERS, GALLERY, LINKS, SETTINGS, SYSTEM_ROLES } from './seed-data';

export const DEMO_PASSWORD = 'Demo-2026-ifts2';

const prisma = new PrismaClient();
const mode = (process.env.SEED_MODE ?? 'demo').toLowerCase();

const DAY = 86_400_000;
/** Fin del día en Buenos Aires (UTC-3) para `yyyy-mm-dd`. */
const endOfDayBA = (d: string) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + 3 * 3600_000 + DAY - 1);
const startOfDayBA = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() + 3 * 3600_000);
const log = (m: string) => console.log(`[seed:${mode}] ${m}`);

// ---------------------------------------------------------------- prod (y base de demo)

type SystemKey = (typeof SYSTEM_ROLES)[number]['key'];

/**
 * Roles del sistema (RF11). Idempotente y respetuosa: si el rol ya existe NO pisa su nombre ni sus
 * permisos (el Superadministrador pudo haberlos cambiado desde el panel); solo asegura isSystem.
 *
 * Decisión sobre roles eliminados: ADMIN, BEDELIA y EDITOR se pueden eliminar a mano desde el panel.
 * Para que una re-ejecución de la semilla en producción NO los resucite, en modo `prod` esos tres se
 * crean solo en el primer arranque (cuando la tabla Role está vacía). SUPERADMIN se asegura siempre
 * (es imprescindible). En modo `demo` se recrean siempre, porque los usuarios de demostración los
 * necesitan. Para revertir la decisión basta con quitar la condición `firstBoot`.
 * Devuelve el id de cada rol que existe, por clave.
 */
async function seedRoles(): Promise<Partial<Record<SystemKey, string>>> {
  const ids: Partial<Record<SystemKey, string>> = {};
  const firstBoot = (await prisma.role.count()) === 0;
  for (const r of SYSTEM_ROLES) {
    const exists = await prisma.role.findUnique({ where: { key: r.key } });
    if (!exists && r.key !== 'SUPERADMIN' && mode !== 'demo' && !firstBoot) continue;
    const perms = r.key === 'SUPERADMIN' ? [] : DEFAULT_ROLE_PERMISSIONS[r.key];
    const role = await prisma.role.upsert({
      where: { key: r.key },
      create: {
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: true,
        permissions: { create: perms.map((permission) => ({ permission })) },
      },
      update: { isSystem: true },
    });
    ids[r.key] = role.id;
  }
  log(`roles del sistema listos (${Object.keys(ids).length} de ${SYSTEM_ROLES.length})`);
  return ids;
}

/** Superadministrador inicial (RF11): en prod con cambio de clave obligatorio al primer ingreso. */
async function seedAdmin(superadminRoleId: string) {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Faltan SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crear el superadministrador inicial.',
    );
  }
  // El conteo y la creación comparten el aislamiento de A02: dos semillas no pueden decidir
  // simultáneamente que la instalación está vacía y crear dos cuentas privilegiadas.
  const passwordHash = await hash(password);
  return userTransaction(prisma, async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.active || existing.roleId !== superadminRoleId) {
        throw new Error(
          'SEED_ADMIN_EMAIL debe corresponder a un SUPERADMIN activo. La semilla no reactiva ' +
            'cuentas ni cambia roles. Consultá docs/operaciones/recuperacion-superadmin.md.',
        );
      }
      log(`SUPERADMIN activo ya existe (${email}); no se modifica la cuenta`);
      return existing;
    }
    if ((await tx.user.count()) !== 0) {
      throw new Error(
        'Ya existen usuarios: la semilla no crea otro SUPERADMIN. Configurá el correo de un ' +
          'SUPERADMIN activo o seguí el procedimiento de recuperación en ' +
          'docs/operaciones/recuperacion-superadmin.md.',
      );
    }
    const admin = await tx.user.create({
      data: {
        email,
        name: 'Superadministración',
        roleId: superadminRoleId,
        passwordHash,
        // En producción el primer ingreso obliga a cambiar la clave inicial.
        mustChangePassword: mode === 'prod',
      },
    });
    log(`superadministrador creado: ${email}`);
    return admin;
  });
}

async function seedSettingsAndLinks() {
  for (const [key, value] of Object.entries(SETTINGS)) {
    // update: {} -> no pisa lo que el cliente ya editó desde el panel
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  for (const l of LINKS) {
    const found = await prisma.externalLink.findFirst({ where: { title: l.title } });
    if (!found) await prisma.externalLink.create({ data: l });
  }
  log(`ajustes (${Object.keys(SETTINGS).length}) y enlaces (${LINKS.length}) listos`);
}

/**
 * Contenido de las páginas estancas (Institucional, La carrera, Ingreso). Es contenido REAL (plan de
 * estudios de la resolución MEGC 1202/07 y datos de la ficha), por eso va en prod y en demo.
 * Respeta lo que el cliente edite en el panel: no pisa ninguna sección ya cargada, salvo las que
 * todavía tienen el texto provisorio de versiones anteriores de la semilla ([completar] /
 * [provisorio]), que se reemplazan por el contenido real.
 */
/**
 * Galerías editables (RF09, ADR-036). Idempotente y respetuosa: solo carga las diapositivas iniciales
 * (imágenes provisorias, ADR-035) si el área NO tiene ninguna; nunca pisa lo que el instituto editó.
 */
async function seedGallery() {
  // US-30: las bases que ya tenían las diapositivas provisorias reciben su categoría provisoria, pero
  // solo las que siguen sin categoría (no se pisa lo que el instituto ya clasificó).
  for (const g of GALLERY.filter((x) => x.category)) {
    await prisma.galleryItem.updateMany({
      where: { area: g.area, image: g.image, category: '' },
      data: { category: g.category },
    });
  }
  for (const area of ['STUDENTS', 'CAREER'] as const) {
    if ((await prisma.galleryItem.count({ where: { area } })) > 0) continue;
    const items = GALLERY.filter((g) => g.area === area);
    await prisma.galleryItem.createMany({ data: items.map((g, order) => ({ ...g, order })) });
    log(`galería ${area}: ${items.length} diapositivas provisorias`);
  }
}

async function seedContent() {
  for (const s of CONTENT) {
    await prisma.contentSection.upsert({
      where: { page_slug: { page: s.page, slug: s.slug } },
      create: { ...s },
      update: {},
    });
    await prisma.contentSection.updateMany({
      where: {
        page: s.page,
        slug: s.slug,
        OR: [{ body: { contains: '[completar]' } }, { body: { contains: '[provisorio]' } }],
      },
      data: { title: s.title, body: s.body, order: s.order },
    });
  }
  log(`contenido de páginas listo (${CONTENT.length} secciones)`);
}

// ---------------------------------------------------------------- demo

async function demoUser(email: string, name: string, roleId: string) {
  return prisma.user.upsert({
    where: { email },
    create: { email, name, roleId, passwordHash: await hash(DEMO_PASSWORD) },
    // Una repetición tampoco debe reactivar, elevar ni degradar cuentas de demostración.
    update: {},
  });
}

/** Escribe un PDF mínimo en el almacenamiento local (mismo formato que LocalDiskStorage). */
async function demoPdf(key: string, title: string) {
  if ((process.env.STORAGE_PROVIDER ?? 'local') !== 'local') return 0;
  const body = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\n% ${title} (documento de demostración)\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  const file = path.resolve(process.env.STORAGE_LOCAL_DIR ?? 'uploads', key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  await writeFile(file + '.meta', 'application/pdf');
  return Buffer.byteLength(body);
}

async function demoDocument(
  d: {
    key: string;
    title: string;
    kind: 'SCHEDULE' | 'EXAM_CALENDAR' | 'RESOLUTION' | 'PLAN' | 'NOTICE_ATTACHMENT' | 'OTHER';
    category: string;
    cycleYear: number;
    termLabel?: string;
    resolutionCode?: string;
    archived?: boolean;
  },
  uploadedBy: string,
) {
  const size = (await demoPdf(d.key, d.title)) || 2048;
  const archivedAt = d.archived ? new Date(`${d.cycleYear + 1}-03-01T12:00:00Z`) : null;
  return prisma.document.upsert({
    where: { storageKey: d.key },
    create: {
      title: d.title,
      filename: `${d.key.split('/').pop()}`,
      kind: d.kind,
      category: d.category,
      cycleYear: d.cycleYear,
      termLabel: d.termLabel,
      resolutionCode: d.resolutionCode,
      storageKey: d.key,
      mimeType: 'application/pdf',
      sizeBytes: size,
      status: d.archived ? 'ARCHIVED' : 'ACTIVE',
      archivedAt,
      uploadedBy,
    },
    update: { status: d.archived ? 'ARCHIVED' : 'ACTIVE', archivedAt },
  });
}

/**
 * Plantel de DEMOSTRACIÓN (RF10): solo en modo demo y solo si la tabla está vacía (nunca pisa lo que
 * cargó el instituto). Personas ficticias, ver `DEMO_TEACHERS`.
 */
async function seedDemoTeachers() {
  if ((await prisma.teacher.count()) > 0) return;
  await prisma.teacher.createMany({ data: DEMO_TEACHERS.map((t, order) => ({ ...t, order })) });
  log(`plantel de demostración: ${DEMO_TEACHERS.length} docentes ficticios (1 oculto)`);
}

/**
 * Datos de DEMOSTRACIÓN complementarios (todos ficticios, solo modo demo): cubren cada estado y cada
 * filtro para que en la demo se pueda ver TODO en la plataforma: publicaciones borrador, programada,
 * pausada, vencida, de años anteriores y originadas en Instagram; avisos pausados, programados y para
 * cada público; llamados pasados, futuros y sin publicar; mensajes en cada estado; una cuenta
 * desactivada y movimientos de auditoría de varias personas. Idempotente: cada elemento se busca por
 * título/asunto/acción y nunca se pisa lo que el equipo haya modificado.
 */
async function seedDemoExtras(c: {
  now: number;
  editorId: string;
  bedeliaId: string;
  adminId: string;
  roles: Record<SystemKey, string>;
  cats: Record<
    'cEvento' | 'cAviso' | 'cInst' | 'cPracticas' | 'cMesas' | 'cUrgente',
    { id: string }
  >;
  termIds: { first: string; second: string };
  docCronogramaId: string;
}) {
  const { now, cats } = c;
  const day = (offset: number) => new Date(now + offset * DAY);

  // --- Publicaciones en todos los estados (RF03/RF04: la vigencia se calcula al consultar)
  const pubExtra = async (p: {
    title: string;
    summary: string;
    body?: string;
    kind?: 'NEWS' | 'EVENT';
    categoryId: string;
    section?: 'HOME' | 'NEWS' | 'BOTH';
    status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'PAUSED';
    visibleFrom?: Date;
    visibleUntil?: Date;
    eventStart?: Date;
    eventEnd?: Date;
    location?: string;
    coverUrl?: string;
    origin?: 'MANUAL' | 'INSTAGRAM';
    socialPostId?: string;
  }) => {
    if (await prisma.publication.findFirst({ where: { title: p.title } })) return;
    await prisma.publication.create({
      data: { kind: 'NEWS', section: 'BOTH', authorId: c.editorId, ...p },
    });
  };
  await pubExtra({
    title: 'Muestra de fin de cuatrimestre',
    summary: 'Evento programado de demostración: se publica solo cuando llega su fecha de inicio.',
    kind: 'EVENT',
    categoryId: cats.cEvento.id,
    status: 'SCHEDULED',
    visibleFrom: day(7),
    eventStart: day(21),
    eventEnd: day(21),
    location: 'Sede del instituto (dato de ejemplo)',
    coverUrl: '/img/provisorio/novedad-jornada.webp',
  });
  await pubExtra({
    title: 'Taller de repostería',
    summary: 'Publicación pausada de demostración: está guardada pero no se muestra en el sitio.',
    categoryId: cats.cPracticas.id,
    status: 'PAUSED',
    visibleFrom: day(-15),
    coverUrl: '/img/provisorio/novedad-practicas.webp',
  });
  await pubExtra({
    title: 'Charla de egresados',
    summary: 'Publicación vencida de demostración: sigue en el panel y en el archivo de Novedades.',
    kind: 'EVENT',
    categoryId: cats.cEvento.id,
    status: 'PUBLISHED',
    visibleFrom: startOfDayBA('2026-03-02'),
    visibleUntil: endOfDayBA('2026-04-30'),
    eventStart: startOfDayBA('2026-04-15'),
    coverUrl: '/img/provisorio/novedad-comunidad.webp',
  });
  await pubExtra({
    title: 'Apertura del ciclo lectivo 2025',
    summary: 'Ejemplo histórico del año anterior, para probar el filtro por año.',
    body: 'Texto de demostración. Contenido ficticio.',
    categoryId: cats.cInst.id,
    section: 'NEWS',
    status: 'PUBLISHED',
    visibleFrom: startOfDayBA('2025-03-10'),
    visibleUntil: endOfDayBA('2025-04-10'),
    coverUrl: '/img/provisorio/novedad-historia.webp',
  });
  await pubExtra({
    title: 'Visita a un mercado gastronómico',
    summary:
      'Salida didáctica de ejemplo con vigencia abierta, para llenar el listado de Novedades.',
    categoryId: cats.cPracticas.id,
    status: 'PUBLISHED',
    visibleFrom: day(-3),
    coverUrl: '/img/provisorio/novedad-practicas.webp',
  });

  // --- Publicaciones de Instagram en cada estado (RF04). Solo la primera vez: el equipo puede
  // moderar después sin que la semilla le deshaga el trabajo.
  const firstDemo = (await prisma.auditLog.count({ where: { action: 'seed.demo' } })) === 0;
  if (firstDemo) {
    const linked = await prisma.socialPost.findUnique({ where: { externalId: 'fake-ig-003' } });
    if (linked && linked.status === 'DETECTED') {
      await prisma.socialPost.update({
        where: { id: linked.id },
        data: { status: 'LINKED', moderatedBy: c.editorId, moderatedAt: day(-1) },
      });
      await pubExtra({
        title: 'Feliz Día del Trabajador Gastronómico',
        summary: 'Publicación aprobada desde Instagram (demostración).',
        categoryId: cats.cInst.id,
        status: 'PUBLISHED',
        visibleFrom: day(-1),
        origin: 'INSTAGRAM',
        socialPostId: linked.id,
        coverUrl: '/img/provisorio/novedad-comunidad.webp',
      });
    }
    await prisma.socialPost.updateMany({
      where: { externalId: 'fake-ig-002', status: 'DETECTED' },
      data: { status: 'DISCARDED', moderatedBy: c.editorId, moderatedAt: day(-2) },
    });
    // fake-ig-001 queda DETECTED: es la que se modera en vivo durante la demo.
  }

  // --- Avisos: pausado, programado y uno para cada público
  const noticeExtra = async (n: {
    title: string;
    body: string;
    categoryId: string;
    audience: 'ALL' | 'STUDENTS' | 'ASPIRANTS' | 'GRADUATES';
    status?: 'ACTIVE' | 'PAUSED';
    visibleFrom: Date;
    visibleUntil?: Date;
    attachmentId?: string;
  }) => {
    if (await prisma.notice.findFirst({ where: { title: n.title } })) return;
    await prisma.notice.create({ data: { authorId: c.bedeliaId, ...n } });
  };
  await noticeExtra({
    title: 'Aviso general para toda la comunidad',
    body: 'Aviso de demostración dirigido a todos los públicos.',
    categoryId: cats.cAviso.id,
    audience: 'ALL',
    visibleFrom: day(-2),
    visibleUntil: day(30),
  });
  await noticeExtra({
    title: 'Charla informativa para aspirantes',
    body: 'Aviso de demostración para quienes quieren ingresar a la tecnicatura. Se ve en Ingreso.',
    categoryId: cats.cAviso.id,
    audience: 'ASPIRANTS',
    visibleFrom: day(-1),
    visibleUntil: day(45),
  });
  await noticeExtra({
    title: 'Encuentro de egresados',
    body: 'Aviso de demostración para graduados.',
    categoryId: cats.cAviso.id,
    audience: 'GRADUATES',
    visibleFrom: day(-1),
    visibleUntil: day(60),
  });
  await noticeExtra({
    title: 'Cambio de aula (aviso pausado)',
    body: 'Aviso pausado de demostración: existe en el panel pero no se muestra en el sitio.',
    categoryId: cats.cMesas.id,
    audience: 'STUDENTS',
    status: 'PAUSED',
    visibleFrom: day(-4),
    visibleUntil: day(10),
  });
  await noticeExtra({
    title: 'Apertura de inscripción a cursada (programado)',
    body: 'Aviso programado de demostración: empieza a verse en el futuro.',
    categoryId: cats.cMesas.id,
    audience: 'STUDENTS',
    visibleFrom: day(12),
    visibleUntil: day(40),
    attachmentId: c.docCronogramaId,
  });

  // --- Llamados a examen: del ciclo anterior, próximo sin destacar y sin publicar
  const callExtra = async (e: {
    termId: string;
    name: string;
    startsOn: Date;
    endsOn: Date;
    published: boolean;
    enrollmentOpen?: boolean;
    notes?: string;
  }) => {
    if (await prisma.examCall.findFirst({ where: { termId: e.termId, name: e.name } })) return;
    await prisma.examCall.create({ data: { updatedBy: c.bedeliaId, ...e } });
  };
  await callExtra({
    termId: c.termIds.first,
    name: 'Turno de Julio 2026',
    startsOn: startOfDayBA('2026-07-06'),
    endsOn: endOfDayBA('2026-07-17'),
    published: true,
    notes: 'Llamado del ciclo anterior (no se ve en el sitio; sí en el archivo del panel).',
  });
  await callExtra({
    termId: c.termIds.second,
    name: 'Turno de Febrero 2027',
    startsOn: startOfDayBA('2027-02-08'),
    endsOn: endOfDayBA('2027-02-19'),
    published: true,
  });
  await callExtra({
    termId: c.termIds.second,
    name: 'Turno de Marzo 2027 (borrador)',
    startsOn: startOfDayBA('2027-03-01'),
    endsOn: endOfDayBA('2027-03-12'),
    published: false,
    notes: 'Llamado sin publicar, para mostrar el estado borrador.',
  });

  // --- Mensajes de contacto en cada estado (la bandeja tiene filtros por estado)
  const msgExtra = async (m: {
    name: string;
    email: string;
    subject: string;
    message: string;
    status: 'NEW' | 'READ' | 'ANSWERED';
    mailSent?: boolean;
  }) => {
    if (await prisma.contactMessage.findFirst({ where: { subject: m.subject } })) return;
    await prisma.contactMessage.create({ data: { consent: true, ...m } });
  };
  await msgExtra({
    name: 'Persona Ficticia Uno',
    email: 'ficticia.uno@example.com',
    subject: '¿Hasta cuándo puedo inscribirme?',
    message: 'Mensaje de demostración sin leer.',
    status: 'NEW',
  });
  await msgExtra({
    name: 'Persona Ficticia Dos',
    email: 'ficticia.dos@example.com',
    subject: 'Consulta por equivalencias',
    message: 'Mensaje de demostración ya leído.',
    status: 'READ',
    mailSent: true,
  });
  await msgExtra({
    name: 'Persona Ficticia Tres',
    email: 'ficticia.tres@example.com',
    subject: 'Horarios de la comisión única',
    message: 'Mensaje de demostración respondido.',
    status: 'ANSWERED',
    mailSent: true,
  });

  // --- Una cuenta desactivada (la lista de usuarios muestra el estado)
  const inactiveEmail = 'exeditor@ifts2.local';
  if (!(await prisma.user.findUnique({ where: { email: inactiveEmail } }))) {
    await prisma.user.create({
      data: {
        email: inactiveEmail,
        name: 'Ex editora de prueba (desactivada)',
        roleId: c.roles.EDITOR,
        active: false,
        passwordHash: await hash(DEMO_PASSWORD),
      },
    });
  }

  // --- Enlace oculto (lo ve el panel, no el sitio)
  if (!(await prisma.externalLink.findFirst({ where: { title: 'Enlace oculto de ejemplo' } }))) {
    await prisma.externalLink.create({
      data: {
        title: 'Enlace oculto de ejemplo',
        url: 'https://example.com/oculto',
        description: 'Enlace de demostración con visibilidad desactivada.',
        group: 'academico',
        order: 99,
        visible: false,
      },
    });
  }

  // --- Auditoría con movimientos de varias personas (solo una vez)
  if ((await prisma.auditLog.count({ where: { action: 'seed.demo.muestra' } })) === 0) {
    const entries: [string, string, string][] = [
      [c.editorId, 'publication.publish', 'Publication'],
      [c.editorId, 'social.link', 'SocialPost'],
      [c.editorId, 'social.discard', 'SocialPost'],
      [c.bedeliaId, 'notice.create', 'Notice'],
      [c.bedeliaId, 'notice.pause', 'Notice'],
      [c.bedeliaId, 'schedule.update', 'Schedule'],
      [c.bedeliaId, 'examCall.create', 'ExamCall'],
      [c.adminId, 'term.setPublic', 'AcademicTerm'],
      [c.adminId, 'user.deactivate', 'User'],
    ];
    await prisma.auditLog.createMany({
      data: entries.map(([userId, action, entity], i) => ({
        userId,
        action,
        entity,
        detail: { demo: true },
        at: new Date(now - (i + 1) * 3 * 3_600_000),
      })),
    });
    await prisma.auditLog.create({
      data: { userId: c.adminId, action: 'seed.demo.muestra', entity: 'System' },
    });
  }
  log('datos de demostración complementarios listos');
}

async function seedDemo(adminId: string, roles: Record<SystemKey, string>) {
  // Nombres de PERSONA (no de rol): en la lista de usuarios el rol se muestra aparte y, si la persona
  // se llamara igual que su rol, no se distinguiría una cosa de la otra.
  await demoUser('direccion@ifts2.local', 'Directora de prueba', roles.ADMIN);
  const bedelia = await demoUser('bedelia@ifts2.local', 'Bedel de prueba', roles.BEDELIA);
  const editor = await demoUser('editor@ifts2.local', 'Editora de prueba', roles.EDITOR);
  log(
    'usuarios de demostración: admin (superadministrador) / direccion@ / bedelia@ / editor@ifts2.local',
  );

  await seedDemoTeachers();

  // Ajustes de demostración
  await prisma.siteSetting.upsert({
    where: { key: 'instagram_hashtag' },
    create: { key: 'instagram_hashtag', value: '#ifts2web' },
    update: {},
  });

  // Categorías
  const cat = async (name: string, kind: string) =>
    prisma.category.upsert({
      where: { name_kind: { name, kind } },
      create: { name, kind },
      update: {},
    });
  const [cEvento, cAviso, cInst, cPracticas] = await Promise.all([
    cat('Evento', 'PUBLICATION'),
    cat('Aviso', 'PUBLICATION'),
    cat('Institucional', 'PUBLICATION'),
    cat('Prácticas profesionales', 'PUBLICATION'),
  ]);
  const [cMesas, cUrgente] = await Promise.all([
    cat('Mesas de examen', 'NOTICE'),
    cat('Urgente / Documentación', 'NOTICE'),
    cat('Cursada', 'NOTICE'),
    cat('Inscripciones', 'NOTICE'),
  ]);

  // Ciclos: 2026-2.º público; 2026-1.º anterior. Un solo publicCurrent (índice parcial en la base).
  const term = (year: number, kind: 'FIRST' | 'SECOND', startsOn: string, endsOn: string) =>
    prisma.academicTerm.upsert({
      where: { year_kind: { year, kind } },
      create: {
        year,
        kind,
        startsOn: startOfDayBA(startsOn),
        endsOn: endOfDayBA(endsOn),
        publicCurrent: false,
      },
      update: {},
    });
  const first = await term(2026, 'FIRST', '2026-03-09', '2026-07-31');
  const second = await term(2026, 'SECOND', '2026-08-03', '2026-12-18');
  await prisma.$transaction([
    prisma.academicTerm.updateMany({
      where: { publicCurrent: true, NOT: { id: second.id } },
      data: { publicCurrent: false },
    }),
    prisma.academicTerm.update({ where: { id: second.id }, data: { publicCurrent: true } }),
  ]);

  // Documentos
  const docCronograma = await demoDocument(
    {
      key: 'seed/cronograma-mesas-diciembre-2026.pdf',
      title: 'Cronograma de mesas — Turno extraordinario de Diciembre 2026',
      kind: 'EXAM_CALENDAR',
      category: 'Mesas Examen',
      cycleYear: 2026,
      termLabel: '2.° Cuat.',
    },
    bedelia.id,
  );
  const docHorariosAB = await demoDocument(
    {
      key: 'seed/horarios-2026-2-comision-ab.pdf',
      title: 'Horarios 2.° cuatrimestre 2026 — Comisión A y B',
      kind: 'SCHEDULE',
      category: 'Cursada',
      cycleYear: 2026,
      termLabel: '2.° Cuat.',
    },
    bedelia.id,
  );
  const docHorariosUnica = await demoDocument(
    {
      key: 'seed/horarios-2026-2-comision-unica.pdf',
      title: 'Horarios 2.° cuatrimestre 2026 — Comisión Única',
      kind: 'SCHEDULE',
      category: 'Cursada',
      cycleYear: 2026,
      termLabel: '2.° Cuat.',
    },
    bedelia.id,
  );
  const docHorarios1 = await demoDocument(
    {
      key: 'seed/horarios-2026-1-comision-ab.pdf',
      title: 'Horarios 1.° cuatrimestre 2026 — Comisión A y B',
      kind: 'SCHEDULE',
      category: 'Cursada',
      cycleYear: 2026,
      termLabel: '1.° Cuat.',
      archived: true,
    },
    bedelia.id,
  );
  await demoDocument(
    {
      key: 'seed/calendario-mesas-diciembre-2025.pdf',
      title: 'Calendario de mesas de examen — Diciembre 2025',
      kind: 'EXAM_CALENDAR',
      category: 'Mesas Examen',
      cycleYear: 2025,
      termLabel: '2.° Cuat.',
      archived: true,
    },
    bedelia.id,
  );
  await demoDocument(
    {
      key: 'seed/horarios-2025-1.pdf',
      title: 'Horarios 1.° cuatrimestre 2025',
      kind: 'SCHEDULE',
      category: 'Cursada',
      cycleYear: 2025,
      termLabel: '1.° Cuat.',
      archived: true,
    },
    bedelia.id,
  );
  await demoDocument(
    {
      key: 'seed/calendario-mesas-diciembre-2024.pdf',
      title: 'Calendario de mesas de examen — Diciembre 2024',
      kind: 'EXAM_CALENDAR',
      category: 'Mesas Examen',
      cycleYear: 2024,
      termLabel: '2.° Cuat.',
      archived: true,
    },
    bedelia.id,
  );
  await demoDocument(
    {
      key: 'seed/resolucion-megc-1202-07.pdf',
      title: 'Marco normativo y plan de carrera (Res. MEGC 1202/07)',
      kind: 'RESOLUTION',
      category: 'Normativa',
      cycleYear: 2024,
      resolutionCode: 'MEGC 1202/07',
      archived: true,
    },
    bedelia.id,
  );

  // Horarios por comisión
  const schedule = async (
    termId: string,
    commissionName: string,
    documentId: string | null,
    published: boolean,
  ) => {
    const found = await prisma.schedule.findFirst({ where: { termId, commissionName } });
    if (found) return found;
    return prisma.schedule.create({
      data: { termId, commissionName, documentId, published, updatedBy: bedelia.id },
    });
  };
  await schedule(second.id, 'Comisión A y B', docHorariosAB.id, true);
  await schedule(second.id, 'Comisión Única', docHorariosUnica.id, true);
  await schedule(second.id, 'Prácticas Finales', null, false);
  await schedule(first.id, 'Comisión A y B', docHorarios1.id, true); // ciclo anterior: no se ve en el sitio

  // Llamado a examen (próximo, destacado, con inscripción abierta)
  const callName = 'Turno extraordinario de Diciembre 2026';
  const call = await prisma.examCall.findFirst({ where: { termId: second.id, name: callName } });
  const callData = {
    termId: second.id,
    name: callName,
    startsOn: startOfDayBA('2026-12-07'),
    endsOn: endOfDayBA('2026-12-18'),
    enrollmentOpen: true,
    highlighted: true,
    documentId: docCronograma.id,
    published: true,
    updatedBy: bedelia.id,
  };
  if (call) await prisma.examCall.update({ where: { id: call.id }, data: callData });
  else await prisma.examCall.create({ data: callData });
  await prisma.siteSetting.update({
    where: { key: 'exam_enrollment_open' },
    data: { value: 'true' },
  });

  // Avisos: vigente (hasta el 25/11/2026), urgente (vence en 6 días) y vencido
  const notice = async (n: {
    title: string;
    body: string;
    categoryId: string;
    audience?: 'ALL' | 'STUDENTS' | 'ASPIRANTS' | 'GRADUATES';
    urgent?: boolean;
    highlighted?: boolean;
    visibleFrom: Date;
    visibleUntil: Date;
    attachmentId?: string;
  }) => {
    const data = {
      audience: 'STUDENTS' as const,
      urgent: false,
      highlighted: false,
      status: 'ACTIVE' as const,
      authorId: bedelia.id,
      ...n,
    };
    const found = await prisma.notice.findFirst({ where: { title: n.title } });
    if (found) await prisma.notice.update({ where: { id: found.id }, data });
    else await prisma.notice.create({ data });
  };
  const now = Date.now();
  await notice({
    title: 'Inscripción al turno extraordinario de Diciembre 2026',
    body: 'Está abierta la inscripción a las mesas del turno extraordinario. Consultá el cronograma adjunto y anotate desde SIU Guaraní.',
    categoryId: cMesas.id,
    highlighted: true,
    visibleFrom: new Date(now - 5 * DAY),
    visibleUntil: endOfDayBA('2026-11-25'),
    attachmentId: docCronograma.id,
  });
  await notice({
    title: 'Reentrega de Libreta Sanitaria y Apto Físico',
    body: 'Quienes tengan la documentación vencida deben renovarla y presentarla en Bedelía.',
    categoryId: cUrgente.id,
    urgent: true,
    visibleFrom: new Date(now - 20 * DAY),
    visibleUntil: new Date(endOfDayBA(new Date(now + 6 * DAY).toISOString().slice(0, 10))),
  });
  await notice({
    title: 'Entrega de trabajos prácticos del 1.° cuatrimestre',
    body: 'Aviso vencido de demostración: sigue existiendo en el panel (filtro "Vencidos") y puede reactivarse o eliminarse.',
    categoryId: cMesas.id,
    visibleFrom: startOfDayBA('2026-06-01'),
    visibleUntil: endOfDayBA('2026-07-31'),
  });

  // Publicaciones sociales detectadas (3) y publicaciones del sitio
  for (const m of FAKE_MEDIA) {
    await prisma.socialPost.upsert({
      where: { externalId: m.id },
      create: {
        externalId: m.id,
        permalink: m.permalink,
        caption: m.caption,
        mediaUrl: m.mediaUrl,
        postedAt: new Date(m.timestamp),
      },
      update: {},
    });
  }
  const pub = async (p: {
    title: string;
    summary: string;
    kind?: 'NEWS' | 'EVENT';
    categoryId: string;
    section?: 'HOME' | 'NEWS' | 'BOTH';
    status?: 'DRAFT' | 'PUBLISHED' | 'PAUSED';
    /** Ruta de una imagen provisoria de la web (ver ADR-035); no pisa una portada ya cargada. */
    coverUrl?: string;
  }) => {
    const found = await prisma.publication.findFirst({ where: { title: p.title } });
    if (found) {
      if (!found.coverUrl && p.coverUrl) {
        await prisma.publication.update({
          where: { id: found.id },
          data: { coverUrl: p.coverUrl },
        });
      }
      return;
    }
    await prisma.publication.create({
      data: {
        kind: 'NEWS',
        section: 'BOTH',
        status: 'PUBLISHED',
        visibleFrom: new Date(now - 10 * DAY),
        authorId: editor.id,
        ...p,
      },
    });
  };
  await pub({
    title: 'Jornada gastronómica',
    summary: 'Actividades de las prácticas profesionalizantes. Imagen pendiente de autorización.',
    kind: 'EVENT',
    categoryId: cEvento.id,
    coverUrl: '/img/provisorio/novedad-comunidad.webp',
  });
  await pub({
    title: 'Avisos académicos',
    summary: 'Consultá las fechas y los comunicados del cuatrimestre.',
    categoryId: cAviso.id,
    section: 'HOME',
    coverUrl: '/img/provisorio/novedad-avisos.webp',
  });
  await pub({
    title: 'Comunidad IFTS',
    summary: 'Conocé las experiencias de nuestros estudiantes.',
    categoryId: cInst.id,
    coverUrl: '/img/provisorio/novedad-practicas.webp',
  });
  await pub({
    title: 'Mateada Patria 2025',
    summary: 'Ejemplo histórico: la celebración del 25 de mayo con toda la comunidad.',
    categoryId: cInst.id,
    section: 'NEWS',
    coverUrl: '/img/provisorio/novedad-historia.webp',
  });
  await pub({
    title: 'Práctica Profesional II: nueva edición',
    summary: 'Borrador de demostración sin publicar.',
    categoryId: cPracticas.id,
    status: 'DRAFT',
    coverUrl: '/img/provisorio/novedad-jornada.webp',
  });

  // Un mensaje de contacto de ejemplo
  if ((await prisma.contactMessage.count()) === 0) {
    await prisma.contactMessage.create({
      data: {
        name: 'Persona de Ejemplo',
        email: 'ejemplo@example.com',
        subject: 'Consulta de ingreso',
        message: 'Mensaje de demostración.',
        consent: true,
      },
    });
  }

  await seedDemoExtras({
    now,
    editorId: editor.id,
    bedeliaId: bedelia.id,
    adminId,
    roles,
    cats: { cEvento, cAviso, cInst, cPracticas, cMesas, cUrgente },
    termIds: { first: first.id, second: second.id },
    docCronogramaId: docCronograma.id,
  });

  // Integraciones: Instagram en modo demostración y sin credenciales (el cliente las carga desde el panel)
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length === 32) {
    await prisma.integrationConfig.upsert({
      where: { key: 'instagram' },
      create: {
        key: 'instagram',
        valueEnc: encryptJson({ mode: 'demo' }, key),
        updatedBy: adminId,
      },
      update: {},
    });
  } else {
    log(
      'APP_ENCRYPTION_KEY no válida: se omite IntegrationConfig (la API usa modo demostración igual)',
    );
  }

  await prisma.auditLog.create({
    data: { userId: adminId, action: 'seed.demo', entity: 'System', detail: { mode: 'demo' } },
  });
  log('datos de demostración listos');
}

async function main() {
  if (mode !== 'prod' && mode !== 'demo') throw new Error('SEED_MODE debe ser "prod" o "demo".');
  if (mode === 'demo' && process.env.NODE_ENV === 'production') {
    throw new Error('La semilla demo nunca se carga en producción (NODE_ENV=production).');
  }
  const roles = await seedRoles();
  const admin = await seedAdmin(roles.SUPERADMIN!);
  await seedSettingsAndLinks();
  await seedContent();
  await seedGallery();
  if (mode === 'demo') await seedDemo(admin.id, roles as Record<SystemKey, string>);
  log('listo');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
