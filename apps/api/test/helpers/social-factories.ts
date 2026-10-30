/**
 * Factories de los módulos categories / publications / social / dashboard.
 * Están en un archivo aparte (no en factories.ts) para no pisar las de otros módulos.
 */
import type { SocialStatus } from '@ifts2/shared';
import { testPrisma } from './db';
import { createUser } from './factories';

let seq = 0;
const next = () => ++seq;

export function setSetting(key: string, value: string) {
  return testPrisma.siteSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export function createSocialPostRow(
  over: Partial<{
    externalId: string;
    caption: string;
    mediaUrl: string;
    status: SocialStatus;
    permalink: string;
    postedAt: Date;
  }> = {},
) {
  const n = next();
  return testPrisma.socialPost.create({
    data: {
      externalId: over.externalId ?? `ig-test-${n}`,
      permalink: over.permalink ?? `https://www.instagram.com/p/test${n}/`,
      caption: over.caption ?? `Jornada de prueba ${n} #ifts2web`,
      mediaUrl: over.mediaUrl ?? `https://scontent.cdninstagram.com/img/test${n}.jpg`,
      postedAt: over.postedAt ?? new Date(Date.UTC(2026, 9, 1 + (n % 25))),
      status: over.status ?? 'DETECTED',
    },
  });
}

export async function createPublicationRow(
  over: Partial<{
    title: string;
    status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'PAUSED';
    origin: 'MANUAL' | 'INSTAGRAM';
    visibleFrom: Date | null;
    visibleUntil: Date | null;
    categoryId: string | null;
    coverUrl: string | null;
    socialPostId: string | null;
    authorId: string;
  }> = {},
) {
  const authorId = over.authorId ?? (await createUser({ role: 'EDITOR' })).user.id;
  return testPrisma.publication.create({
    data: {
      title: over.title ?? `Publicación ${next()}`,
      summary: 'Resumen de prueba',
      status: over.status ?? 'DRAFT',
      origin: over.origin ?? 'MANUAL',
      visibleFrom: over.visibleFrom ?? null,
      visibleUntil: over.visibleUntil ?? null,
      categoryId: over.categoryId ?? null,
      coverUrl: over.coverUrl ?? null,
      socialPostId: over.socialPostId ?? null,
      authorId,
    },
  });
}

export function createTermRow(
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
      publicCurrent: over.publicCurrent ?? true,
    },
  });
}

export function createExamCallRow(
  termId: string,
  over: Partial<{ name: string; startsOn: Date; endsOn: Date; published: boolean }> = {},
) {
  return testPrisma.examCall.create({
    data: {
      termId,
      name: over.name ?? `Llamado ${next()}`,
      startsOn: over.startsOn ?? new Date(Date.now() + 10 * 86_400_000),
      endsOn: over.endsOn ?? new Date(Date.now() + 12 * 86_400_000),
      published: over.published ?? true,
      updatedBy: 'test',
    },
  });
}
