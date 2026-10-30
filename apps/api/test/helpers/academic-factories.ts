/**
 * Factories del bloque académico (avisos, documentos, horarios, llamados, enlaces, contenido).
 * Archivo aparte de `factories.ts` para no pisar lo existente.
 */
import { randomUUID } from 'node:crypto';
import { testPrisma } from './db';
import { createUser } from './factories';

let seq = 0;
const next = () => ++seq;

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const ago = (ms: number) => new Date(Date.now() - ms);
export const fromNow = (ms: number) => new Date(Date.now() + ms);

let cachedUser: string | null = null;
/** Id de un usuario existente para los campos `authorId`/`updatedBy`/`uploadedBy` (se recrea tras resetDb). */
export async function someUserId(): Promise<string> {
  if (cachedUser) {
    const u = await testPrisma.user.findUnique({ where: { id: cachedUser } });
    if (u) return u.id;
  }
  cachedUser = (await createUser({ role: 'BEDELIA' })).user.id;
  return cachedUser;
}

export async function createDocumentRow(
  over: Partial<{
    title: string;
    status: 'ACTIVE' | 'ARCHIVED';
    kind: 'SCHEDULE' | 'EXAM_CALENDAR' | 'RESOLUTION' | 'PLAN' | 'NOTICE_ATTACHMENT' | 'OTHER';
    cycleYear: number | null;
    resolutionCode: string | null;
    storageKey: string;
  }> = {},
) {
  const n = next();
  return testPrisma.document.create({
    data: {
      title: over.title ?? `Documento ${n}`,
      filename: `documento-${n}.pdf`,
      kind: over.kind ?? 'OTHER',
      cycleYear: over.cycleYear === undefined ? 2026 : over.cycleYear,
      resolutionCode: over.resolutionCode ?? null,
      storageKey: over.storageKey ?? `documents/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1234,
      status: over.status ?? 'ACTIVE',
      archivedAt: over.status === 'ARCHIVED' ? new Date() : null,
      uploadedBy: await someUserId(),
    },
  });
}

export async function createScheduleRow(over: {
  termId: string;
  commissionName?: string;
  documentId?: string | null;
  published?: boolean;
}) {
  return testPrisma.schedule.create({
    data: {
      termId: over.termId,
      commissionName: over.commissionName ?? `Comisión ${next()}`,
      documentId: over.documentId ?? null,
      published: over.published ?? false,
      updatedBy: await someUserId(),
    },
  });
}

export async function createExamCallRow(over: {
  termId: string;
  name?: string;
  startsOn?: Date;
  endsOn?: Date;
  published?: boolean;
  highlighted?: boolean;
  enrollmentOpen?: boolean;
  documentId?: string | null;
}) {
  return testPrisma.examCall.create({
    data: {
      termId: over.termId,
      name: over.name ?? `Llamado ${next()}`,
      startsOn: over.startsOn ?? fromNow(10 * DAY),
      endsOn: over.endsOn ?? fromNow(15 * DAY),
      published: over.published ?? false,
      highlighted: over.highlighted ?? false,
      enrollmentOpen: over.enrollmentOpen ?? false,
      documentId: over.documentId ?? null,
      updatedBy: await someUserId(),
    },
  });
}

export function createLinkRow(
  over: Partial<{ title: string; url: string; visible: boolean; order: number }> = {},
) {
  return testPrisma.externalLink.create({
    data: {
      title: over.title ?? `Enlace ${next()}`,
      url: over.url ?? 'https://ejemplo.test/destino',
      visible: over.visible ?? true,
      order: over.order ?? 0,
    },
  });
}

export function createSectionRow(
  over: Partial<{
    page: string;
    slug: string;
    title: string;
    body: string;
    visible: boolean;
    order: number;
  }> = {},
) {
  const n = next();
  return testPrisma.contentSection.create({
    data: {
      page: over.page ?? 'institucional',
      slug: over.slug ?? `seccion-${n}`,
      title: over.title ?? `Sección ${n}`,
      body: over.body ?? 'Texto de la sección.',
      visible: over.visible ?? true,
      order: over.order ?? 0,
    },
  });
}

/** Publicación con control fino de estado y vigencia (la factory original no los expone). */
export async function createPublicationAt(
  over: Partial<{
    title: string;
    status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'PAUSED';
    section: 'HOME' | 'NEWS' | 'BOTH';
    visibleFrom: Date | null;
    visibleUntil: Date | null;
    categoryId: string | null;
    createdAt: Date;
  }> = {},
) {
  const n = next();
  return testPrisma.publication.create({
    data: {
      title: over.title ?? `Novedad ${n}`,
      summary: 'Resumen de la novedad',
      body: 'Cuerpo de la novedad',
      status: over.status ?? 'PUBLISHED',
      section: over.section ?? 'BOTH',
      visibleFrom: over.visibleFrom === undefined ? null : over.visibleFrom,
      visibleUntil: over.visibleUntil === undefined ? null : over.visibleUntil,
      categoryId: over.categoryId ?? null,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
      authorId: await someUserId(),
    },
  });
}

/** Cuerpo mínimo de un PDF válido para las pruebas de carga (firma `%PDF-`). */
export const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
