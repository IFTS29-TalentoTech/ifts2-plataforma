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
import {
  InstagramApiError,
  instagramShortcode,
  normalizeInstagramPermalink,
  type InstagramMedia,
} from '../../infra/instagram';
import { MediaDownloadError } from '../../infra/media-download';
import { looksLikeHtml, storeUpload } from '../../infra/storage';
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

/** Causa por la que no se pudo usar la imagen: la interfaz ofrece "Publicar sin imagen" ante cualquiera. */
export type ImageProblem = 'download' | 'page' | 'format' | 'size' | 'missing';

/** Error 422/502 con `imageProblem`: la interfaz lo reconoce y propone subir otra imagen o publicar sin ella. */
function imageError(kind: ImageProblem, status: 'unprocessable' | 'bad-gateway', detail: string) {
  return new AppError(
    status,
    status === 'unprocessable'
      ? 'No se puede realizar la acción'
      : 'Servicio externo no disponible',
    detail,
    undefined,
    { imageProblem: kind },
  );
}

/**
 * Copia la imagen de la publicación al almacenamiento propio y devuelve su clave. Las direcciones
 * `.invalid` (modo demostración) usan una imagen neutra generada, así el flujo completo se puede probar
 * sin cuenta real.
 *
 * Cada causa de fallo tiene su mensaje y su `imageProblem` (descarga, página web en vez de imagen,
 * formato, peso): quien modera sabe qué hacer y puede publicar sin imagen (RNF03: Instagram o el
 * almacenamiento no bloquean la publicación).
 */
async function copyImageToStorage(ctx: AppContext, post: SocialPost): Promise<string> {
  const isManual = post.externalId.startsWith(MANUAL_PREFIX);
  if (!post.mediaUrl) {
    // Carga manual por enlace sin cuenta conectada (ADR-045): no hay imagen que copiar.
    throw imageError(
      'missing',
      'unprocessable',
      'Esta publicación no tiene imagen. Subí una desde tu equipo o publicala sin imagen.',
    );
  }
  let buffer: Buffer;
  try {
    const host = new URL(post.mediaUrl).hostname;
    buffer = host.endsWith('.invalid')
      ? await demoPlaceholder()
      : await ctx.downloadImage(post.mediaUrl);
  } catch (e) {
    const detail = e instanceof MediaDownloadError ? e.message : 'No pudimos descargar la imagen.';
    const tooBig = e instanceof MediaDownloadError && /pesa demasiado/.test(e.message);
    const hint = tooBig
      ? ' Subí una imagen más liviana o publicá sin imagen.'
      : isManual
        ? ' Subí la imagen desde tu equipo o publicá sin imagen.'
        : ' Sincronizá de nuevo para renovar la dirección, cargá la publicación a mano o publicá sin imagen.';
    // Manual: error de datos del usuario (422). Instagram: falla del servicio externo (502).
    throw imageError(
      tooBig ? 'size' : 'download',
      isManual || tooBig ? 'unprocessable' : 'bad-gateway',
      `${detail}${hint}`,
    );
  }
  if (looksLikeHtml(buffer)) {
    throw imageError(
      'page',
      'unprocessable',
      'La dirección que cargaste es una página web, no una imagen. Subí la imagen desde tu equipo o publicá sin imagen.',
    );
  }
  try {
    const stored = await storeUpload(
      ctx.storage,
      { buffer, originalName: 'instagram.jpg' },
      'social',
    );
    return stored.key;
  } catch (e) {
    if (e instanceof AppError && e.code === 'unsupported-media-type') {
      throw imageError(
        'format',
        'unprocessable',
        'La imagen de la publicación no se puede usar: no es un formato admitido (JPG, PNG o WebP) o está dañada. Subí otra imagen o publicá sin imagen.',
      );
    }
    if (e instanceof AppError && e.code === 'payload-too-large') {
      throw imageError(
        'size',
        'unprocessable',
        'La imagen de la publicación pesa demasiado (máximo 5 MB). Subí una más liviana o publicá sin imagen.',
      );
    }
    throw e;
  }
}

/**
 * Aprueba una publicación detectada: crea la `Publication` PUBLISHED con origen INSTAGRAM, copia la
 * imagen, marca el `SocialPost` como LINKED y audita. 409 si ya estaba vinculada (o descartada).
 *
 * Orden y compensación (auditoría A10):
 * 1. Se copia la imagen ANTES de la transacción: si falla, no queda nada a medias.
 * 2. Si la transacción falla, se borra la imagen copiada, pero SOLO si la publicación no quedó
 *    guardada. Una confirmación ambigua (se corta la conexión al confirmar) puede haber guardado
 *    igual: se consulta la base antes de borrar y, si no se puede verificar, se deja el archivo.
 *    Mejor un archivo huérfano que una publicación con la portada rota.
 * 3. Una vez confirmada, la imagen ya pertenece a la publicación: un error al armar la respuesta
 *    (relecturas, URL firmada) nunca la borra.
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
  // `withoutImage`: decisión explícita de quien modera cuando la imagen no se pudo usar (RNF03).
  const coverKey = input.withoutImage ? null : await copyImageToStorage(ctx, post);

  let created: PublicationRow;
  try {
    created = await ctx.prisma.$transaction(async (tx) => {
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
        detail: {
          publicationId: publication.id,
          section: input.section,
          consentConfirmed: true,
          ...(input.withoutImage ? { withoutImage: true } : {}),
        },
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
  } catch (e) {
    // La transacción falló (p. ej. 409 por carrera): no dejar una imagen huérfana... salvo que la
    // publicación haya quedado guardada igual (confirmación ambigua). Ante la duda, no se borra.
    if (coverKey) {
      const saved = await ctx.prisma.publication
        .count({ where: { coverUrl: coverKey } })
        .catch(() => 1);
      if (saved === 0) await ctx.storage.remove(coverKey).catch(() => undefined);
    }
    throw e;
  }

  // Confirmada: de acá en adelante la imagen es de la publicación y no se toca.
  const fresh = await loadPost(ctx, id);
  const names = await moderatorNames(ctx, [fresh]);
  return {
    publication: await toPublicationView(ctx.storage, created),
    post: await toPostView(ctx, fresh, names),
  };
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

/** Cómo se resolvieron los datos de una carga manual (lo muestra la interfaz). */
export interface ManualResolution {
  /** `instagram`: la API encontró la publicación y trajo los datos; `none`: se usó lo que se cargó a mano. */
  source: 'instagram' | 'none';
  /** ¿La publicación quedó con imagen? Si no, al aprobar se sube una desde el equipo o se publica sin imagen. */
  imageFound: boolean;
  /** Por qué no se pudo resolver sola (cuenta sin conectar, no encontrada entre las recientes, Meta falló). */
  reason?: string;
}

/**
 * Busca la publicación en la cuenta conectada (ADR-045). Nunca falla: si no se puede (sin cuenta, no está entre
 * las recientes, Meta respondió un error), devuelve el motivo y la carga sigue con lo escrito a mano.
 */
async function resolveFromInstagram(
  ctx: AppContext,
  permalink: string,
): Promise<{ media: InstagramMedia | null; reason?: string }> {
  const client = await ctx.getInstagramClient();
  if (client.kind !== 'graph') {
    return {
      media: null,
      reason: 'La cuenta de Instagram no está conectada, así que la imagen no se pudo traer sola.',
    };
  }
  try {
    const media = await client.findMediaByPermalink(permalink);
    return media
      ? { media }
      : {
          media: null,
          reason:
            'No encontramos esa publicación entre las últimas de la cuenta conectada (puede ser de otra cuenta o muy antigua).',
        };
  } catch (e) {
    ctx.logger.warn(
      { detail: e instanceof InstagramApiError ? (e.detail ?? e.message) : 'error desconocido' },
      'no se pudo buscar la publicación por enlace en Instagram',
    );
    return {
      media: null,
      reason: e instanceof InstagramApiError ? e.message : 'No pudimos consultar Instagram.',
    };
  }
}

/**
 * Contingencia (ADR-09, ADR-45): carga manual de una publicación de redes; entra como pendiente, mismo flujo.
 * Alcanza con el enlace de la publicación: se normaliza (sin `?igsh=`, `/reel/` o `/p/`) y, si la cuenta está
 * conectada, se resuelve la leyenda, la fecha y la imagen con la API oficial (nunca raspando instagram.com).
 * Lo escrito a mano manda sobre lo resuelto.
 */
export async function createManualPost(ctx: AppContext, userId: string, input: SocialManualInput) {
  const permalink = normalizeInstagramPermalink(input.permalink);
  const code = instagramShortcode(permalink);
  // Misma publicación aunque la hayan cargado con otra forma del enlace (o ya la haya traído la sincronización).
  const candidates = await ctx.prisma.socialPost.findMany({
    where: code ? { permalink: { contains: code } } : { permalink },
    select: { permalink: true },
  });
  if (candidates.some((c) => (code ? instagramShortcode(c.permalink) === code : true))) {
    throw errors.conflict('Esa publicación ya está cargada.', {
      permalink: ['Ya existe una publicación con ese enlace.'],
    });
  }

  const found = code
    ? await resolveFromInstagram(ctx, permalink)
    : { media: null as InstagramMedia | null };
  const media = found.media;
  const caption = input.caption || media?.caption || '';
  if (!caption && !media) {
    throw errors.validation('Escribí la leyenda de la publicación.', {
      caption: ['La leyenda es obligatoria cuando no se puede traer sola desde Instagram.'],
    });
  }
  // Un solo campo (ADR-045): si NO es un enlace de publicación de Instagram, se toma como la dirección directa de
  // una imagen de otro sitio (con los mensajes por causa del ADR-043 al aprobar si no resulta ser una imagen).
  const mediaUrl = input.mediaUrl || media?.mediaUrl || (code ? '' : permalink);
  // Si la API la encontró, se usa su id: así la sincronización no la duplica después.
  const externalId = media ? media.id : `${MANUAL_PREFIX}${randomUUID()}`;
  if (media && (await ctx.prisma.socialPost.findUnique({ where: { externalId } }))) {
    throw errors.conflict('Esa publicación ya está cargada.', {
      permalink: ['Ya existe una publicación con ese enlace.'],
    });
  }
  const post = await ctx.prisma.$transaction(async (tx) => {
    const created = await tx.socialPost.create({
      data: {
        platform: 'INSTAGRAM',
        externalId,
        permalink: media?.permalink ?? permalink,
        caption,
        mediaUrl,
        postedAt: input.postedAt ?? (media ? new Date(media.timestamp) : new Date()),
      },
      include: postInclude,
    });
    await audit.log(tx, {
      userId,
      action: 'social.manual',
      entity: 'SocialPost',
      entityId: created.id,
      detail: { resolved: media ? 'instagram' : 'none', withImage: !!mediaUrl },
    });
    return created;
  });
  const resolution: ManualResolution = {
    source: media ? 'instagram' : 'none',
    imageFound: !!mediaUrl,
    ...(media ? {} : found.reason ? { reason: found.reason } : {}),
  };
  return { ...(await toPostView(ctx, post, new Map())), resolution };
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
