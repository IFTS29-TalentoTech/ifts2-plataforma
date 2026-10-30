/**
 * Módulo `notices` — avisos académicos / cartelera oficial (RF03, RF06; US-11, US-36).
 * Permisos: ADMIN y BEDELIA (`notices:manage`, `notices:delete`). Ver README.md del módulo.
 *
 * Decisiones:
 * - Vigencia: se guarda ACTIVE | PAUSED y la fecha de fin; "vencido" se calcula al consultar.
 * - Eliminación: manual y solo si está pausado o vencido; si está vigente responde 409.
 * - Toda mutación queda en AuditLog (sin datos personales: solo ids y títulos).
 */
import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  idParam,
  noticeCreateInput,
  noticeListQuery,
  noticeResumeInput,
  noticeUpdateInput,
  type NoticeCreateInput,
  type NoticeUpdateInput,
  type NoticeViewStatus,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { assertAttachableDocument } from '../../lib/documents';
import { pageArgs, toPage } from '../../lib/pagination';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import {
  assertNoticeCategory,
  assertWindow,
  canDeleteNotice,
  noticeInclude,
  toNoticeDto,
  viewStatusOf,
  viewStatusWhere,
} from './notices.service';

export const mountPath = '/notices';
export const router = Router();

const NOT_FOUND = 'No encontramos el aviso.';

/** GET /notices?status=ACTIVE|PAUSED|EXPIRED|ALL&audience=&page=&pageSize= */
router.get(
  '/',
  requirePermission('notices:manage'),
  validate({ query: noticeListQuery }),
  async (req, res) => {
    const q = valid<z.infer<typeof noticeListQuery>>(req, 'query');
    const now = new Date();
    const where: Prisma.NoticeWhereInput = {
      ...viewStatusWhere(q.status, now),
      ...(q.audience ? { audience: q.audience } : {}),
    };
    const audienceWhere: Prisma.NoticeWhereInput = q.audience ? { audience: q.audience } : {};
    const count = (view: NoticeViewStatus) =>
      req.ctx.prisma.notice.count({ where: { ...viewStatusWhere(view, now), ...audienceWhere } });
    const [total, rows, all, active, paused, expired] = await Promise.all([
      req.ctx.prisma.notice.count({ where }),
      req.ctx.prisma.notice.findMany({
        where,
        include: noticeInclude,
        // Urgentes arriba, después lo más nuevo (mismo criterio que el sitio público).
        orderBy: [{ urgent: 'desc' }, { visibleFrom: 'desc' }, { createdAt: 'desc' }],
        ...pageArgs(q),
      }),
      count('ALL'),
      count('ACTIVE'),
      count('PAUSED'),
      count('EXPIRED'),
    ]);
    // `counts` alimenta los filtros del panel sin traer todos los avisos (ya no hace falta pageSize=100).
    res.json({
      ...toPage(
        rows.map((n) => toNoticeDto(n, now)),
        total,
        q,
      ),
      counts: { ALL: all, ACTIVE: active, PAUSED: paused, EXPIRED: expired },
    });
  },
);

/** POST /notices — crea un aviso ACTIVO (vigente desde ahora si no se indica `visibleFrom`). */
router.post(
  '/',
  requirePermission('notices:manage'),
  validate({ body: noticeCreateInput }),
  async (req, res) => {
    const body = valid<NoticeCreateInput>(req, 'body');
    const { prisma } = req.ctx;
    const now = new Date();
    const from = body.visibleFrom ?? now;
    assertWindow(from, body.visibleUntil);
    if (body.visibleUntil && body.visibleUntil.getTime() <= now.getTime()) {
      throw errors.unprocessable('La fecha de fin ya pasó: el aviso nacería vencido.', {
        visibleUntil: ['La fecha de fin ya pasó. Elegí una fecha futura.'],
      });
    }
    await assertNoticeCategory(prisma, body.categoryId);
    await assertAttachableDocument(prisma, body.attachmentId, 'attachmentId');

    const notice = await prisma.$transaction(async (tx) => {
      const n = await tx.notice.create({
        data: {
          title: body.title,
          body: body.body,
          categoryId: body.categoryId ?? null,
          audience: body.audience,
          urgent: body.urgent,
          highlighted: body.highlighted,
          visibleFrom: from,
          visibleUntil: body.visibleUntil ?? null,
          attachmentId: body.attachmentId ?? null,
          authorId: req.auth!.user.id,
        },
        include: noticeInclude,
      });
      await audit.fromReq(
        req,
        {
          action: 'notice.create',
          entity: 'Notice',
          entityId: n.id,
          detail: { title: n.title, urgent: n.urgent },
        },
        tx,
      );
      return n;
    });
    res.status(201).json(toNoticeDto(notice, now));
  },
);

async function findNotice(req: Request, id: string) {
  const n = await req.ctx.prisma.notice.findUnique({ where: { id }, include: noticeInclude });
  if (!n) throw errors.notFound(NOT_FOUND);
  return n;
}

router.get(
  '/:id',
  requirePermission('notices:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    res.json(toNoticeDto(await findNotice(req, req.valid.params.id)));
  },
);

/** PATCH /notices/:id — edita campos; la ventana de vigencia se valida contra los valores ya guardados. */
router.patch(
  '/:id',
  requirePermission('notices:manage'),
  validate({ params: idParam, body: noticeUpdateInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const body = valid<NoticeUpdateInput>(req, 'body');
    const { prisma } = req.ctx;
    const current = await findNotice(req, id);

    const from = body.visibleFrom ?? current.visibleFrom; // visibleFrom no admite null
    const until = body.visibleUntil !== undefined ? body.visibleUntil : current.visibleUntil;
    assertWindow(from, until);
    if (body.categoryId !== undefined) await assertNoticeCategory(prisma, body.categoryId);
    if (body.attachmentId !== undefined && body.attachmentId !== current.attachmentId) {
      await assertAttachableDocument(prisma, body.attachmentId, 'attachmentId');
    }

    const data: Prisma.NoticeUncheckedUpdateInput = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.audience !== undefined ? { audience: body.audience } : {}),
      ...(body.urgent !== undefined ? { urgent: body.urgent } : {}),
      ...(body.highlighted !== undefined ? { highlighted: body.highlighted } : {}),
      ...(body.visibleFrom ? { visibleFrom: body.visibleFrom } : {}),
      ...(body.visibleUntil !== undefined ? { visibleUntil: body.visibleUntil } : {}),
      ...(body.attachmentId !== undefined ? { attachmentId: body.attachmentId } : {}),
    };
    const updated = await prisma.$transaction(async (tx) => {
      const n = await tx.notice.update({ where: { id }, data, include: noticeInclude });
      await audit.fromReq(
        req,
        {
          action: 'notice.update',
          entity: 'Notice',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return n;
    });
    res.json(toNoticeDto(updated));
  },
);

/** POST /notices/:id/pause — saca el aviso del sitio sin perderlo. 409 si ya estaba pausado. */
router.post(
  '/:id/pause',
  requirePermission('notices:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await findNotice(req, id);
    if (current.status === 'PAUSED') throw errors.conflict('El aviso ya está pausado.');
    const updated = await req.ctx.prisma.$transaction(async (tx) => {
      const n = await tx.notice.update({
        where: { id },
        data: { status: 'PAUSED' },
        include: noticeInclude,
      });
      await audit.fromReq(req, { action: 'notice.pause', entity: 'Notice', entityId: id }, tx);
      return n;
    });
    res.json(toNoticeDto(updated));
  },
);

/**
 * POST /notices/:id/resume — reanuda un aviso pausado o reactiva uno vencido (RF03).
 * Body opcional `{ visibleUntil }`: obligatorio y futuro si el aviso ya venció.
 */
router.post(
  '/:id/resume',
  requirePermission('notices:manage'),
  validate({ params: idParam, body: noticeResumeInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const body = valid<{ visibleUntil?: Date | null }>(req, 'body');
    const now = new Date();
    const current = await findNotice(req, id);
    const view = viewStatusOf(current, now);
    if (view === 'ACTIVE') throw errors.conflict('El aviso ya está vigente.');

    const newUntil = body.visibleUntil ?? undefined;
    if (newUntil && newUntil.getTime() <= now.getTime()) {
      throw errors.unprocessable('La nueva fecha de fin ya pasó.', {
        visibleUntil: ['La nueva fecha de fin ya pasó. Elegí una fecha futura.'],
      });
    }
    if (newUntil) assertWindow(current.visibleFrom, newUntil);
    // Un aviso vencido sin nueva fecha de fin volvería a vencer al instante.
    if (view === 'EXPIRED' && !newUntil) {
      throw errors.unprocessable('El aviso está vencido: indicá una nueva fecha de fin.', {
        visibleUntil: ['El aviso está vencido. Indicá una nueva fecha de fin para reactivarlo.'],
      });
    }
    // Pausado con la vigencia ya terminada: tampoco se puede reanudar sin nueva fecha.
    if (isExpiredWhilePaused(current, now) && !newUntil) {
      throw errors.unprocessable('La vigencia del aviso terminó: indicá una nueva fecha de fin.', {
        visibleUntil: ['La vigencia terminó. Indicá una nueva fecha de fin para reanudarlo.'],
      });
    }
    const updated = await req.ctx.prisma.$transaction(async (tx) => {
      const n = await tx.notice.update({
        where: { id },
        data: { status: 'ACTIVE', ...(newUntil ? { visibleUntil: newUntil } : {}) },
        include: noticeInclude,
      });
      await audit.fromReq(
        req,
        {
          action: view === 'EXPIRED' ? 'notice.reactivate' : 'notice.resume',
          entity: 'Notice',
          entityId: id,
          detail: newUntil ? { visibleUntil: newUntil.toISOString() } : undefined,
        },
        tx,
      );
      return n;
    });
    res.json(toNoticeDto(updated, now));
  },
);

function isExpiredWhilePaused(n: { status: string; visibleUntil: Date | null }, now: Date) {
  return n.status === 'PAUSED' && !!n.visibleUntil && now.getTime() >= n.visibleUntil.getTime();
}

/**
 * DELETE /notices/:id — eliminación MANUAL (la UI pide confirmación). Solo avisos pausados o
 * vencidos; uno vigente responde 409. Queda en AuditLog con quién y cuándo (RF03).
 */
router.delete(
  '/:id',
  requirePermission('notices:delete'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await findNotice(req, id);
    if (!canDeleteNotice(current, new Date())) {
      throw errors.conflict('No se puede eliminar un aviso vigente. Pausalo o esperá a que venza.');
    }
    await req.ctx.prisma.$transaction(async (tx) => {
      await tx.notice.delete({ where: { id } });
      await audit.fromReq(
        req,
        {
          action: 'notice.delete',
          entity: 'Notice',
          entityId: id,
          detail: { title: current.title },
        },
        tx,
      );
    });
    res.status(204).end();
  },
);
