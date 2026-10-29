import type { Role } from '@ifts2/shared';
import { hashPassword } from '../../src/lib/password';
import { testPrisma } from './db';

export const TEST_PASSWORD = 'Prueba-12345';
let seq = 0;
const next = () => ++seq;

export async function createUser(
  over: Partial<{
    email: string;
    name: string;
    role: Role;
    password: string;
    active: boolean;
    mustChangePassword: boolean;
  }> = {},
) {
  const n = next();
  const password = over.password ?? TEST_PASSWORD;
  const user = await testPrisma.user.create({
    data: {
      email: over.email ?? `usuario${n}@prueba.local`,
      name: over.name ?? `Usuario ${n}`,
      role: over.role ?? 'EDITOR',
      active: over.active ?? true,
      mustChangePassword: over.mustChangePassword ?? false,
      passwordHash: await hashPassword(password),
    },
  });
  return { user, password };
}

export function createCategory(over: Partial<{ name: string; kind: string }> = {}) {
  return testPrisma.category.create({
    data: { name: over.name ?? `Categoría ${next()}`, kind: over.kind ?? 'NOTICE' },
  });
}

export function createTerm(
  over: Partial<{
    year: number;
    kind: 'FIRST' | 'SECOND' | 'EXTRAORDINARY';
    publicCurrent: boolean;
  }> = {},
) {
  return testPrisma.academicTerm.create({
    data: {
      year: over.year ?? 2026,
      kind: over.kind ?? 'SECOND',
      publicCurrent: over.publicCurrent ?? false,
    },
  });
}

export async function createNotice(
  over: Partial<{
    title: string;
    body: string;
    status: 'ACTIVE' | 'PAUSED';
    visibleFrom: Date;
    visibleUntil: Date | null;
    urgent: boolean;
    authorId: string;
  }> = {},
) {
  const authorId = over.authorId ?? (await createUser({ role: 'BEDELIA' })).user.id;
  return testPrisma.notice.create({
    data: {
      title: over.title ?? `Aviso ${next()}`,
      body: over.body ?? 'Texto del aviso',
      status: over.status ?? 'ACTIVE',
      visibleFrom: over.visibleFrom ?? new Date(Date.now() - 86_400_000),
      visibleUntil: over.visibleUntil === undefined ? null : over.visibleUntil,
      urgent: over.urgent ?? false,
      authorId,
    },
  });
}

export async function createPublication(
  over: Partial<{
    title: string;
    status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'PAUSED';
    section: 'HOME' | 'NEWS' | 'BOTH';
    authorId: string;
  }> = {},
) {
  const authorId = over.authorId ?? (await createUser({ role: 'EDITOR' })).user.id;
  return testPrisma.publication.create({
    data: {
      title: over.title ?? `Publicación ${next()}`,
      summary: 'Resumen',
      status: over.status ?? 'PUBLISHED',
      section: over.section ?? 'BOTH',
      authorId,
    },
  });
}
