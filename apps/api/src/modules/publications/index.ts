/**
 * Módulo `publications` — Novedades y eventos del sitio (RF03, US-08 a US-10).
 *
 * Estados guardados: DRAFT, SCHEDULED, PUBLISHED, PAUSED. Lo que ve un visitante NO depende del estado
 * solo: se calcula al consultar con `isPublicationVisible` (estado + ventana `visibleFrom`/`visibleUntil`),
 * sin tareas programadas que oculten nada (ADR-07). "Vencida" no es un estado: es `expired: true`.
 *
 * Transiciones (cualquier otra devuelve 409):
 *   publish     DRAFT | SCHEDULED          -> PUBLISHED
 *   schedule    DRAFT | PAUSED             -> SCHEDULED (con fecha de inicio futura)
 *   pause       PUBLISHED | SCHEDULED      -> PAUSED     (sale de circulación sin perderse)
 *   reactivate  PAUSED | vencida           -> PUBLISHED  (exige que la vigencia resultante siga abierta)
 *
 * Eliminación (CRUD, ADR-07): `DELETE /:id` es siempre MANUAL, confirmada en la interfaz y auditada. Solo
 * si está en borrador, pausada o vencida; si está vigente (o programada) responde 409. Si la publicación
 * venía de Instagram, la publicación de redes vuelve a "pendiente" para poder aprobarla o descartarla.
 *
 * Permisos: `publications:manage` y `publications:delete` (EDITOR y ADMIN; BEDELIA no).
 */
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  idParam,
  publicationCreateInput,
  publicationListQuery,
  publicationReactivateInput,
  publicationScheduleInput,
  publicationUpdateInput,
  type PublicationCreateInput,
  type PublicationUpdateInput,
} from '@ifts2/shared';
import { z } from 'zod';
import type { AppContext } from '../../context';
import { errors } from '../../infra/errors';
import { storeUpload } from '../../infra/storage';
import { isStorageKey } from '../../lib/cover';
import { pageArgs, toPage } from '../../lib/pagination';
import { requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import {
  isExpired,
  publicationInclude,
  toPublicationView,
  type PublicationRow,
} from './publication.view';

export const mountPath = '/publications';
export const router = Router();

const manage = requirePermission('publications:manage');

async function load(ctx: AppContext, id: string): Promise<PublicationRow> {
  const p = await ctx.prisma.publication.findUnique({ where: { id }, include: publicationInclude });
  if (!p) throw errors.notFound('No encontramos la publicación.');
  return p;
}

/** La categoría debe existir y ser de publicaciones (si no, 422 con el campo señalado). */
async function assertCategory(ctx: AppContext, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const cat = await ctx.prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat || cat.kind !== 'PUBLICATION') {
    throw errors.unprocessable('La categoría elegida no existe o no es de publicaciones.', {
      categoryId: ['Elegí una categoría de publicaciones.'],
    });
  }
}

/**
 * `coverUrl` por el cuerpo solo admite direcciones web completas (o repetir la actual). Las claves del
 * almacenamiento se asignan únicamente subiendo el archivo (`POST /:id/cover`) o al aprobar una
 * publicación de Instagram: así nadie puede apuntar la portada a un archivo interno ajeno.
 */
function assertCoverUrl(next: string | null | undefined, current?: string | null) {
  if (!next || next === current) return;
  if (!/^https?:\/\//i.test(next)) {
    throw errors.validation(
      'La imagen de portada debe ser una dirección web completa (http:// o https://) o un archivo subido.',
      { coverUrl: ['Usá una dirección web completa o subí la imagen como archivo.'] },
    );
  }
}

/** Borra del almacenamiento la portada anterior si era una imagen propia (sin fallar si no existe). */
async function removeStoredCover(ctx: AppContext, coverUrl: string | null | undefined) {
  if (isStorageKey(coverUrl)) await ctx.storage.remove(coverUrl).catch(() => undefined);
}

function assertWindow(from: Date | null | undefined, until: Date | null | undefined) {
  if (from && until && until.getTime() <= from.getTime()) {
    throw errors.unprocessable('La fecha de fin debe ser posterior a la fecha de inicio.', {
      visibleUntil: ['La fecha de fin debe ser posterior a la fecha de inicio.'],
    });
  }
}

const conflictState = (action: string, p: PublicationRow, hint = '') =>
  errors.conflict(
    `No se puede ${action} una publicación en estado ${STATE_LABEL[p.status]}.${hint}`,
  );

const STATE_LABEL = {
  DRAFT: 'borrador',
  SCHEDULED: 'programada',
  PUBLISHED: 'publicada',
  PAUSED: 'pausada',
} as const;

// ---------------- lectura ----------------

router.get('/', manage, validate({ query: publicationListQuery }), async (req, res) => {
  const q = valid<z.infer<typeof publicationListQuery>>(req, 'query');
  const where: Prisma.PublicationWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.origin ? { origin: q.origin } : {}),
    ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const [total, rows] = await Promise.all([
    req.ctx.prisma.publication.count({ where }),
    req.ctx.prisma.publication.findMany({
      where,
      include: publicationInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...pageArgs(q),
    }),
  ]);
  const now = new Date();
  res.json(
    toPage(
      await Promise.all(rows.map((r) => toPublicationView(req.ctx.storage, r, now))),
      total,
      q,
    ),
  );
});

router.get('/:id', manage, validate({ params: idParam }), async (req, res) => {
  res.json(await toPublicationView(req.ctx.storage, await load(req.ctx, req.valid.params.id)));
});

// ---------------- alta y edición ----------------

/** Crea una publicación MANUAL en borrador (se publica o programa con las acciones de abajo). */
router.post('/', manage, validate({ body: publicationCreateInput }), async (req, res) => {
  const body = valid<PublicationCreateInput>(req, 'body');
  await assertCategory(req.ctx, body.categoryId);
  assertCoverUrl(body.coverUrl);
  const created = await req.ctx.prisma.$transaction(async (tx) => {
    const p = await tx.publication.create({
      data: { ...body, status: 'DRAFT', origin: 'MANUAL', authorId: req.auth!.user.id },
      include: publicationInclude,
    });
    await audit.fromReq(
      req,
      {
        action: 'publication.create',
        entity: 'Publication',
        entityId: p.id,
        detail: { origin: 'MANUAL' },
      },
      tx,
    );
    return p;
  });
  res.status(201).json(await toPublicationView(req.ctx.storage, created));
});

router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: publicationUpdateInput }),
  async (req, res) => {
    const body = valid<PublicationUpdateInput>(req, 'body');
    const current = await load(req.ctx, req.valid.params.id);
    await assertCategory(req.ctx, body.categoryId);
    assertCoverUrl(body.coverUrl, current.coverUrl);
    // La ventana se valida mezclando lo enviado con lo guardado.
    assertWindow(
      body.visibleFrom !== undefined ? body.visibleFrom : current.visibleFrom,
      body.visibleUntil !== undefined ? body.visibleUntil : current.visibleUntil,
    );
    const updated = await req.ctx.prisma.$transaction(async (tx) => {
      const p = await tx.publication.update({
        where: { id: current.id },
        data: body,
        include: publicationInclude,
      });
      await audit.fromReq(
        req,
        {
          action: 'publication.update',
          entity: 'Publication',
          entityId: current.id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return p;
    });
    if (body.coverUrl !== undefined && body.coverUrl !== current.coverUrl) {
      await removeStoredCover(req.ctx, current.coverUrl);
    }
    res.json(await toPublicationView(req.ctx.storage, updated));
  },
);

/** Sube la imagen de portada (multipart, campo `file`): JPG/PNG/WebP, se reduce a 1600 px y se guarda como WebP. */
router.post(
  '/:id/cover',
  manage,
  validate({ params: idParam }),
  uploadSingle(),
  async (req, res) => {
    if (!req.file)
      throw errors.validation('Elegí una imagen para subir.', { file: ['Falta la imagen.'] });
    const current = await load(req.ctx, req.valid.params.id);
    const stored = await storeUpload(
      req.ctx.storage,
      { buffer: req.file.buffer, originalName: req.file.originalname },
      'covers',
    );
    if (stored.mimeType === 'application/pdf') {
      await req.ctx.storage.remove(stored.key).catch(() => undefined);
      throw errors.unsupported('La portada debe ser una imagen (JPG, PNG o WebP).');
    }
    const updated = await req.ctx.prisma.$transaction(async (tx) => {
      const p = await tx.publication.update({
        where: { id: current.id },
        data: { coverUrl: stored.key },
        include: publicationInclude,
      });
      await audit.fromReq(
        req,
        { action: 'publication.cover', entity: 'Publication', entityId: current.id },
        tx,
      );
      return p;
    });
    await removeStoredCover(req.ctx, current.coverUrl);
    res.json(await toPublicationView(req.ctx.storage, updated));
  },
);

// ---------------- cambios de estado ----------------

/** Ejecuta un cambio de estado auditado y devuelve la vista actualizada. */
async function changeState(
  req: import('express').Request,
  id: string,
  data: Prisma.PublicationUpdateInput,
  action: string,
  from: string,
) {
  const updated = await req.ctx.prisma.$transaction(async (tx) => {
    const p = await tx.publication.update({ where: { id }, data, include: publicationInclude });
    await audit.fromReq(
      req,
      { action, entity: 'Publication', entityId: id, detail: { from, to: p.status } },
      tx,
    );
    return p;
  });
  return toPublicationView(req.ctx.storage, updated);
}

/** Publicar ahora (o dejar lista para su fecha de inicio si ya la tiene). Desde borrador o programada. */
router.post('/:id/publish', manage, validate({ params: idParam }), async (req, res) => {
  const p = await load(req.ctx, req.valid.params.id);
  if (p.status !== 'DRAFT' && p.status !== 'SCHEDULED') {
    throw conflictState(
      'publicar',
      p,
      p.status === 'PAUSED' ? ' Usá "reactivar" para volver a publicarla.' : '',
    );
  }
  if (isExpired(p)) {
    throw errors.unprocessable('La fecha de fin ya pasó: editá la vigencia antes de publicarla.', {
      visibleUntil: ['La fecha de fin ya pasó.'],
    });
  }
  res.json(await changeState(req, p.id, { status: 'PUBLISHED' }, 'publication.publish', p.status));
});

/** Pausar: sale de circulación sin perderse (nunca se borra). */
router.post('/:id/pause', manage, validate({ params: idParam }), async (req, res) => {
  const p = await load(req.ctx, req.valid.params.id);
  if (p.status !== 'PUBLISHED' && p.status !== 'SCHEDULED') throw conflictState('pausar', p);
  res.json(await changeState(req, p.id, { status: 'PAUSED' }, 'publication.pause', p.status));
});

/** Programar: se mostrará desde `visibleFrom` (futura) hasta `visibleUntil` (opcional). */
router.post(
  '/:id/schedule',
  manage,
  validate({ params: idParam, body: publicationScheduleInput }),
  async (req, res) => {
    const body = valid<z.infer<typeof publicationScheduleInput>>(req, 'body');
    const p = await load(req.ctx, req.valid.params.id);
    if (p.status !== 'DRAFT' && p.status !== 'PAUSED') throw conflictState('programar', p);
    if (body.visibleFrom.getTime() <= Date.now()) {
      throw errors.unprocessable(
        'Para programar elegí una fecha de inicio futura. Si querés mostrarla ya, usá "publicar".',
        { visibleFrom: ['La fecha de inicio debe ser futura.'] },
      );
    }
    const until = body.visibleUntil !== undefined ? body.visibleUntil : p.visibleUntil;
    assertWindow(body.visibleFrom, until);
    res.json(
      await changeState(
        req,
        p.id,
        { status: 'SCHEDULED', visibleFrom: body.visibleFrom, visibleUntil: until },
        'publication.schedule',
        p.status,
      ),
    );
  },
);

/**
 * Reactivar una pausada o vencida con NUEVA vigencia. La vigencia resultante debe seguir abierta (sin fecha
 * de fin o con fin futuro): una vencida sin nueva fecha de fin se rechaza (422), así nunca queda "publicada pero invisible".
 */
router.post(
  '/:id/reactivate',
  manage,
  validate({ params: idParam, body: publicationReactivateInput }),
  async (req, res) => {
    const body = valid<z.infer<typeof publicationReactivateInput>>(req, 'body');
    const p = await load(req.ctx, req.valid.params.id);
    const eligible = p.status === 'PAUSED' || (p.status !== 'DRAFT' && isExpired(p));
    if (!eligible) {
      throw conflictState(
        'reactivar',
        p,
        p.status === 'DRAFT' ? ' Usá "publicar".' : ' Solo se reactivan las pausadas o vencidas.',
      );
    }
    const from = body.visibleFrom !== undefined ? body.visibleFrom : p.visibleFrom;
    const until = body.visibleUntil !== undefined ? body.visibleUntil : p.visibleUntil;
    if (until && until.getTime() <= Date.now()) {
      throw errors.unprocessable('Indicá una nueva fecha de fin futura para reactivarla.', {
        visibleUntil: ['La fecha de fin debe ser futura.'],
      });
    }
    assertWindow(from, until);
    res.json(
      await changeState(
        req,
        p.id,
        { status: 'PUBLISHED', visibleFrom: from, visibleUntil: until },
        'publication.reactivate',
        p.status,
      ),
    );
  },
);

// ---------------- eliminación manual ----------------

router.delete(
  '/:id',
  requirePermission('publications:delete'),
  validate({ params: idParam }),
  async (req, res) => {
    const p = await load(req.ctx, req.valid.params.id);
    const deletable = p.status === 'DRAFT' || p.status === 'PAUSED' || isExpired(p);
    if (!deletable) {
      throw errors.conflict(
        p.status === 'SCHEDULED'
          ? 'No se puede eliminar una publicación programada. Pausala primero.'
          : 'No se puede eliminar una publicación vigente. Pausala primero.',
      );
    }
    await req.ctx.prisma.$transaction(async (tx) => {
      await tx.publication.delete({ where: { id: p.id } });
      // Si venía de Instagram, la publicación de redes vuelve a pendiente (se puede aprobar de nuevo o descartar).
      if (p.socialPostId) {
        await tx.socialPost.updateMany({
          where: { id: p.socialPostId, status: 'LINKED' },
          data: { status: 'DETECTED', moderatedBy: null, moderatedAt: null },
        });
      }
      await audit.fromReq(
        req,
        {
          action: 'publication.delete',
          entity: 'Publication',
          entityId: p.id,
          detail: { status: p.status, origin: p.origin },
        },
        tx,
      );
    });
    await removeStoredCover(req.ctx, p.coverUrl);
    res.status(204).end();
  },
);
