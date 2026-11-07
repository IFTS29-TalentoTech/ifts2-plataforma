/**
 * Moderación de publicaciones de redes (RF04, US-08, US-09, ADR-09).
 *
 * Ciclo de vida de un `SocialPost`:
 *   DETECTED --approve--> LINKED          (crea la Publication PUBLISHED, copia la imagen)
 *   DETECTED --discard--> DISCARDED --restore--> DETECTED
 *   DISCARDED --delete--> (borrado manual, auditado)       LINKED nunca se elimina (está referenciada)
 *
 * Reglas clave:
 *  - Nada de redes llega al sitio sin aprobación humana: aprobar es la ÚNICA forma de crear la publicación.
 *  - La imagen se COPIA a nuestro almacenamiento al aprobar, porque las URLs de Instagram expiran.
 *  - Aprobar exige `consentConfirmed=true` (consentimiento para imágenes de estudiantes, Ley 25.326): lo
 *    valida el esquema zod `socialApproveInput`.
 *  - Los cambios de estado usan `updateMany` condicionado al estado esperado: dos moderadores no pueden
 *    aprobar la misma publicación a la vez (el segundo recibe 409).
 */
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Prisma, SocialPost } from '@prisma/client';
import type { SocialApproveInput, SocialManualInput, SocialStatus } from '@ifts2/shared';
import type { AppContext } from '../../context';
import { AppError, errors } from '../../infra/errors';
import { MediaDownloadError } from '../../infra/media-download';
import { storeUpload } from '../../infra/storage';
import { resolveCoverSrc } from '../../lib/cover';
import { audit } from '../audit/audit.service';
import {
  publicationInclude,
  toPublicationView,
  type PublicationRow,
} from '../publications/publication.view';
import { deriveBody, deriveSummary, deriveTitle } from './caption';

type PostRow = SocialPost & {
  publication?: Pick<PublicationRow, 'id' | 'title' | 'status' | 'coverUrl'> | null;
};

const postInclude = {
  publication: { select: { id: true, title: true, status: true, coverUrl: true } },
} as const;

/** Las publicaciones cargadas a mano usan este prefijo en `externalId` (ver `createManualPost`). */
export const MANUAL_PREFIX = 'manual-';

export async function toPostView(ctx: AppContext, p: PostRow, moderatorNames: Map<string, string>) {
  return {
    id: p.id,
    platform: p.platform,
    /** 'instagram' = traída por la sincronización; 'manual' = cargada a mano (contingencia). */
    source: p.externalId.startsWith(MANUAL_PREFIX) ? ('manual' as const) : ('instagram' as const),
    externalId: p.externalId,
    permalink: p.permalink,
    caption: p.caption,
    /** Dirección ORIGINAL de la imagen (puede expirar). Una vez vinculada, usar `publication.coverSrc`. */
    mediaUrl: p.mediaUrl,
    postedAt: p.postedAt,
    status: p.status,
    detectedAt: p.detectedAt,
    moderatedAt: p.moderatedAt,
    moderatedBy: p.moderatedBy,
    moderatedByName: p.moderatedBy ? (moderatorNames.get(p.moderatedBy) ?? null) : null,
    publication: p.publication
      ? {
          id: p.publication.id,
          title: p.publication.title,
          status: p.publication.status,
          coverSrc: await resolveCoverSrc(ctx.storage, p.publication.coverUrl),
        }
      : null,
  };
}

async function moderatorNames(ctx: AppContext, rows: Array<{ moderatedBy: string | null }>) {
  const ids = [...new Set(rows.map((r) => r.moderatedBy).filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map<string, string>();
  const users = await ctx.prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Listado paginado (más nuevas primero) + conteo por estado para las pestañas del panel. */
export async function listPosts(
  ctx: AppContext,
  q: { status?: SocialStatus; source?: 'instagram' | 'manual'; page: number; pageSize: number },
) {
  // El origen no es una columna: las cargas manuales se reconocen por el prefijo de `externalId`.
  const where: Prisma.SocialPostWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.source === 'manual' ? { externalId: { startsWith: MANUAL_PREFIX } } : {}),
    ...(q.source === 'instagram' ? { NOT: { externalId: { startsWith: MANUAL_PREFIX } } } : {}),
  };
  const [total, rows, grouped] = await Promise.all([
    ctx.prisma.socialPost.count({ where }),
    ctx.prisma.socialPost.findMany({
      where,
      include: postInclude,
      orderBy: [{ postedAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    ctx.prisma.socialPost.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const names = await moderatorNames(ctx, rows);
  const counts = { DETECTED: 0, LINKED: 0, DISCARDED: 0 } satisfies Record<SocialStatus, number>;
  for (const g of grouped) counts[g.status] = g._count._all;
  return {
    items: await Promise.all(rows.map((r) => toPostView(ctx, r, names))),
    page: q.page,
    pageSize: q.pageSize,
    total,
    counts,
  };
}

async function loadPost(ctx: AppContext, id: string): Promise<PostRow> {
  const post = await ctx.prisma.socialPost.findUnique({ where: { id }, include: postInclude });
  if (!post) throw errors.notFound('No encontramos esa publicación de redes.');
  return post;
}

/** Imagen neutra para el modo demostración (las direcciones `.invalid` de FAKE_MEDIA no existen). */
async function demoPlaceholder(): Promise<Buffer> {
  return sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 224, g: 223, b: 213 } },
  })
    .png()
    .toBuffer();
}

/**
 * Copia la imagen de la publicación al almacenamiento propio y devuelve su clave. Las direcciones
 * `.invalid` (modo demostración) usan una imagen neutra generada, así el flujo completo se puede probar
 * sin cuenta real.
 */
async function copyImageToStorage(ctx: AppContext, post: SocialPost): Promise<string> {
  const isManual = post.externalId.startsWith(MANUAL_PREFIX);
  let buffer: Buffer;
  try {
    const host = new URL(post.mediaUrl).hostname;
    buffer = host.endsWith('.invalid')
      ? await demoPlaceholder()
      : await ctx.downloadImage(post.mediaUrl);
  } catch (e) {
    const detail = e instanceof MediaDownloadError ? e.message : 'No pudimos descargar la imagen.';
    const hint = isManual
      ? ' Revisá la dirección de la imagen de la publicación.'
      : ' Sincronizá de nuevo para renovar la dirección o cargá la publicación a mano.';
    // Manual: error de datos del usuario (422). Instagram: falla del servicio externo (502).
    throw isManual
      ? errors.unprocessable(`${detail}${hint}`)
      : errors.badGateway(`${detail}${hint}`);
  }
  try {
    const stored = await storeUpload(
      ctx.storage,
      { buffer, originalName: 'instagram.jpg' },
      'social',
    );
    return stored.key;
  } catch (e) {
    if (
      e instanceof AppError &&
      (e.code === 'unsupported-media-type' || e.code === 'payload-too-large')
    ) {
      throw errors.unprocessable(
        'La imagen de la publicación no se puede usar (formato no admitido o demasiado pesada).',
      );
    }
    throw e;
  }
}

/**
 * Aprueba una publicación detectada: crea la `Publication` PUBLISHED con origen INSTAGRAM, copia la
 * imagen, marca el `SocialPost` como LINKED y audita. 409 si ya estaba vinculada (o descartada).
 */
export async function approvePost(
  ctx: AppContext,
  userId: string,
  id: string,
  input: SocialApproveInput,
) {
  const post = await loadPost(ctx, id);
  if (post.status === 'LINKED') {
    throw errors.conflict(
      'Esta publicación de redes ya está vinculada a una publicación del sitio.',
    );
  }
  if (post.status === 'DISCARDED') {
    throw errors.conflict('Esta publicación está descartada. Restaurala antes de aprobarla.');
  }
  if (input.visibleUntil && input.visibleUntil.getTime() <= Date.now()) {
    throw errors.unprocessable('La fecha de fin ya pasó: elegí una fecha futura.', {
      visibleUntil: ['La fecha de fin debe ser futura.'],
    });
  }
  if (input.categoryId) {
    const cat = await ctx.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!cat || cat.kind !== 'PUBLICATION') {
      throw errors.unprocessable('La categoría elegida no existe o no es de publicaciones.', {
        categoryId: ['Elegí una categoría de publicaciones.'],
      });
    }
  }

  // Primero la imagen: si falla, no queda nada a medias (ni publicación ni cambio de estado).
  const coverKey = await copyImageToStorage(ctx, post);

  try {
    const created = await ctx.prisma.$transaction(async (tx) => {
      const claimed = await tx.socialPost.updateMany({
        where: { id, status: 'DETECTED' },
        data: { status: 'LINKED', moderatedBy: userId, moderatedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw errors.conflict('Esta publicación de redes ya fue moderada por otra persona.');
      }
      const publication = await tx.publication.create({
        data: {
          kind: 'NEWS',
          title: input.title ?? deriveTitle(post.caption),
          summary: input.summary ?? deriveSummary(post.caption),
          body: deriveBody(post.caption),
          coverUrl: coverKey,
          categoryId: input.categoryId ?? null,
          section: input.section,
          status: 'PUBLISHED',
          origin: 'INSTAGRAM',
          socialPostId: id,
          visibleFrom: input.visibleFrom ?? null,
          visibleUntil: input.visibleUntil ?? null,
          authorId: userId,
        },
        include: publicationInclude,
      });
      await audit.log(tx, {
        userId,
        action: 'social.approve',
        entity: 'SocialPost',
        entityId: id,
        // consentConfirmed queda registrado: es la constancia del consentimiento (RNF08).
        detail: { publicationId: publication.id, section: input.section, consentConfirmed: true },
      });
      await audit.log(tx, {
        userId,
        action: 'publication.create',
        entity: 'Publication',
        entityId: publication.id,
        detail: { origin: 'INSTAGRAM', status: 'PUBLISHED' },
      });
      return publication;
    });
    const fresh = await loadPost(ctx, id);
    const names = await moderatorNames(ctx, [fresh]);
    return {
      publication: await toPublicationView(ctx.storage, created),
      post: await toPostView(ctx, fresh, names),
    };
  } catch (e) {
    // La transacción falló (p. ej. 409 por carrera): no dejar una imagen huérfana en el almacenamiento.
    await ctx.storage.remove(coverKey).catch(() => undefined);
    throw e;
  }
}

/** Cambia de estado solo si está en el esperado (evita pisarse entre moderadores). */
async function transition(
  ctx: AppContext,
  userId: string,
  id: string,
  from: SocialStatus,
  to: SocialStatus,
  action: string,
  conflictMessage: string,
) {
  await loadPost(ctx, id); // 404 si no existe
  await ctx.prisma.$transaction(async (tx) => {
    const res = await tx.socialPost.updateMany({
      where: { id, status: from },
      data: { status: to, moderatedBy: userId, moderatedAt: new Date() },
    });
    if (res.count === 0) throw errors.conflict(conflictMessage);
    await audit.log(tx, { userId, action, entity: 'SocialPost', entityId: id });
  });
  const fresh = await loadPost(ctx, id);
  return toPostView(ctx, fresh, await moderatorNames(ctx, [fresh]));
}

/** Descartar: no aparece en el sitio, se puede recuperar (filtro "Descartadas"). Solo desde DETECTED. */
export function discardPost(ctx: AppContext, userId: string, id: string) {
  return transition(
    ctx,
    userId,
    id,
    'DETECTED',
    'DISCARDED',
    'social.discard',
    'Solo se pueden descartar publicaciones pendientes de moderar (esta ya fue aprobada o descartada).',
  );
}

/** Restaurar: vuelve a pendientes. Solo desde DISCARDED. */
export function restorePost(ctx: AppContext, userId: string, id: string) {
  return transition(
    ctx,
    userId,
    id,
    'DISCARDED',
    'DETECTED',
    'social.restore',
    'Solo se pueden restaurar publicaciones descartadas.',
  );
}

/** Contingencia (ADR-09): carga manual de una publicación de redes; entra como pendiente, mismo flujo. */
export async function createManualPost(ctx: AppContext, userId: string, input: SocialManualInput) {
  if (await ctx.prisma.socialPost.findFirst({ where: { permalink: input.permalink } })) {
    throw errors.conflict('Esa publicación ya está cargada.', {
      permalink: ['Ya existe una publicación con ese enlace.'],
    });
  }
  const post = await ctx.prisma.$transaction(async (tx) => {
    const created = await tx.socialPost.create({
      data: {
        platform: 'INSTAGRAM',
        externalId: `${MANUAL_PREFIX}${randomUUID()}`,
        permalink: input.permalink,
        caption: input.caption,
        mediaUrl: input.mediaUrl,
        postedAt: input.postedAt,
      },
      include: postInclude,
    });
    await audit.log(tx, {
      userId,
      action: 'social.manual',
      entity: 'SocialPost',
      entityId: created.id,
    });
    return created;
  });
  return toPostView(ctx, post, new Map());
}

/**
 * Eliminar (CRUD, ADR-07): solo publicaciones DESCARTADAS. Las pendientes se descartan primero y las
 * vinculadas están referenciadas por una publicación (409). Siempre manual, confirmada en la interfaz y auditada.
 */
export async function deletePost(ctx: AppContext, userId: string, id: string) {
  const post = await loadPost(ctx, id);
  if (post.status !== 'DISCARDED') {
    throw errors.conflict(
      post.status === 'LINKED'
        ? 'Esta publicación está vinculada a una publicación del sitio y no se puede eliminar.'
        : 'Solo se pueden eliminar publicaciones descartadas. Descartala primero.',
    );
  }
  await ctx.prisma.$transaction(async (tx) => {
    await tx.socialPost.delete({ where: { id } });
    await audit.log(tx, {
      userId,
      action: 'social.delete',
      entity: 'SocialPost',
      entityId: id,
      detail: { externalId: post.externalId },
    });
  });
}
