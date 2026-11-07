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
import { DEFAULT_ROLE_PERMISSIONS } from '../packages/shared/src/permissions';
import { CONTENT, LINKS, SETTINGS, SYSTEM_ROLES } from './seed-data';

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
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    log(`superadministrador ya existe (${email}); no se modifican su clave ni su rol`);
    return existing;
  }
  const admin = await prisma.user.create({
    data: {
      email,
      name: 'Superadministración',
      roleId: superadminRoleId,
      passwordHash: await hash(password),
      // En producción el primer ingreso obliga a cambiar la clave inicial.
      mustChangePassword: mode === 'prod',
    },
  });
  log(`superadministrador creado: ${email}`);
  return admin;
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
    update: { name, roleId, active: true },
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

async function seedDemo(adminId: string, roles: Record<SystemKey, string>) {
  await demoUser('direccion@ifts2.local', 'Rectoría / Dirección (demo)', roles.ADMIN);
  const bedelia = await demoUser('bedelia@ifts2.local', 'Bedelía Académica (demo)', roles.BEDELIA);
  const editor = await demoUser('editor@ifts2.local', 'Comunicación (demo)', roles.EDITOR);
  log(
    'usuarios de demostración: admin (superadministrador) / direccion@ / bedelia@ / editor@ifts2.local',
  );

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
  }) => {
    const found = await prisma.publication.findFirst({ where: { title: p.title } });
    if (found) return;
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
  });
  await pub({
    title: 'Avisos académicos',
    summary: 'Consultá las fechas y los comunicados del cuatrimestre.',
    categoryId: cAviso.id,
    section: 'HOME',
  });
  await pub({
    title: 'Comunidad IFTS',
    summary: 'Conocé las experiencias de nuestros estudiantes.',
    categoryId: cInst.id,
  });
  await pub({
    title: 'Mateada Patria 2025',
    summary: 'Ejemplo histórico: la celebración del 25 de mayo con toda la comunidad.',
    categoryId: cInst.id,
    section: 'NEWS',
  });
  await pub({
    title: 'Práctica Profesional II: nueva edición',
    summary: 'Borrador de demostración sin publicar.',
    categoryId: cPracticas.id,
    status: 'DRAFT',
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
  if (mode === 'demo') await seedDemo(admin.id, roles as Record<SystemKey, string>);
  log('listo');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
