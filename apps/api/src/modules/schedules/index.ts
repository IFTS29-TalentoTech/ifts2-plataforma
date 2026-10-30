/**
 * Módulo `schedules` — horarios de cursada por comisión, con la grilla como archivo adjunto (RF06,
 * reunión del 06/10: "calendario cargado por archivo"). Permisos: ADMIN y BEDELIA.
 *
 * Reglas:
 * - Un horario nace SIN publicar. El sitio público solo muestra horarios `published` de su ciclo
 *   `publicCurrent` (`isScheduleVisible` de @ifts2/shared).
 * - Para publicar hace falta el archivo de la grilla (sin archivo no hay nada que mostrar).
 * - No se repite el nombre de comisión dentro de un ciclo.
 * - DELETE manual: solo si NO está publicado o si su ciclo ya no es el público (409 si no).
 */
import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  idParam,
  isScheduleVisible,
  scheduleCreateInput,
  scheduleListQuery,
  scheduleUpdateInput,
  type ScheduleCreateInput,
  type ScheduleDto,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { assertAttachableDocument, documentRefSelect, toDocumentRef } from '../../lib/documents';
import { pageArgs, toPage } from '../../lib/pagination';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { toTermRef } from '../terms/terms.service';

export const mountPath = '/schedules';
export const router = Router();

const include = {
  term: true,
  document: { select: documentRefSelect },
} satisfies Prisma.ScheduleInclude;
type Row = Prisma.ScheduleGetPayload<{ include: typeof include }>;

function toDto(s: Row): ScheduleDto {
  return {
    id: s.id,
    termId: s.termId,
    term: toTermRef(s.term),
    commissionName: s.commissionName,
    documentId: s.documentId,
    document: toDocumentRef(s.document),
    notes: s.notes,
    published: s.published,
    visibleNow: isScheduleVisible(s, s.term),
    updatedBy: s.updatedBy,
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function find(req: Request, id: string): Promise<Row> {
  const s = await req.ctx.prisma.schedule.findUnique({ where: { id }, include });
  if (!s) throw errors.notFound('No encontramos el horario.');
  return s;
}

async function assertTerm(req: Request, termId: string) {
  if (
    !(await req.ctx.prisma.academicTerm.findUnique({ where: { id: termId }, select: { id: true } }))
  ) {
    throw errors.unprocessable('El ciclo elegido no existe.', {
      termId: ['El ciclo elegido no existe.'],
    });
  }
}

async function assertUniqueCommission(
  req: Request,
  termId: string,
  name: string,
  exceptId?: string,
) {
  const dup = await req.ctx.prisma.schedule.findFirst({
    where: {
      termId,
      commissionName: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (dup) {
    throw errors.conflict('Ya existe un horario con ese nombre de comisión en este ciclo.', {
      commissionName: ['Ya existe un horario con ese nombre de comisión en este ciclo.'],
    });
  }
}

/** GET /schedules?termId=&published=&page= — sin `termId` lista todos los ciclos. */
router.get(
  '/',
  requirePermission('schedules:manage'),
  validate({ query: scheduleListQuery }),
  async (req, res) => {
    const q = valid<z.infer<typeof scheduleListQuery>>(req, 'query');
    const where: Prisma.ScheduleWhereInput = {
      ...(q.termId ? { termId: q.termId } : {}),
      ...(q.published !== undefined ? { published: q.published } : {}),
    };
    const [total, rows] = await Promise.all([
      req.ctx.prisma.schedule.count({ where }),
      req.ctx.prisma.schedule.findMany({
        where,
        include,
        orderBy: [{ commissionName: 'asc' }, { id: 'asc' }],
        ...pageArgs(q),
      }),
    ]);
    res.json(toPage(rows.map(toDto), total, q));
  },
);

router.get(
  '/:id',
  requirePermission('schedules:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    res.json(toDto(await find(req, req.valid.params.id)));
  },
);

router.post(
  '/',
  requirePermission('schedules:manage'),
  validate({ body: scheduleCreateInput }),
  async (req, res) => {
    const body = valid<ScheduleCreateInput>(req, 'body');
    await assertTerm(req, body.termId);
    await assertUniqueCommission(req, body.termId, body.commissionName);
    await assertAttachableDocument(req.ctx.prisma, body.documentId, 'documentId');
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const s = await tx.schedule.create({
        data: {
          termId: body.termId,
          commissionName: body.commissionName,
          documentId: body.documentId ?? null,
          notes: body.notes ?? null,
          updatedBy: req.auth!.user.id,
        },
        include,
      });
      await audit.fromReq(
        req,
        {
          action: 'schedule.create',
          entity: 'Schedule',
          entityId: s.id,
          detail: { termId: s.termId, commissionName: s.commissionName },
        },
        tx,
      );
      return s;
    });
    res.status(201).json(toDto(row));
  },
);

router.patch(
  '/:id',
  requirePermission('schedules:manage'),
  validate({ params: idParam, body: scheduleUpdateInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const body = valid<Partial<ScheduleCreateInput>>(req, 'body');
    const current = await find(req, id);
    const termId = body.termId ?? current.termId;
    if (body.termId && body.termId !== current.termId) await assertTerm(req, body.termId);
    const name = body.commissionName ?? current.commissionName;
    if (body.termId !== undefined || body.commissionName !== undefined) {
      await assertUniqueCommission(req, termId, name, id);
    }
    if (body.documentId !== undefined && body.documentId !== current.documentId) {
      await assertAttachableDocument(req.ctx.prisma, body.documentId, 'documentId');
    }
    // Un horario publicado no puede quedarse sin archivo.
    if (current.published && body.documentId === null) {
      throw errors.unprocessable('El horario está publicado: no podés quitarle el archivo.', {
        documentId: ['El horario está publicado. Despublicalo antes de quitar el archivo.'],
      });
    }
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const s = await tx.schedule.update({
        where: { id },
        data: {
          ...(body.termId ? { termId: body.termId } : {}),
          ...(body.commissionName ? { commissionName: body.commissionName } : {}),
          ...(body.documentId !== undefined ? { documentId: body.documentId } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          updatedBy: req.auth!.user.id,
        },
        include,
      });
      await audit.fromReq(
        req,
        {
          action: 'schedule.update',
          entity: 'Schedule',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return s;
    });
    res.json(toDto(row));
  },
);

/** POST /schedules/:id/publish — lo hace visible (si su ciclo es el público). Requiere archivo. */
router.post(
  '/:id/publish',
  requirePermission('schedules:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await find(req, id);
    if (current.published) throw errors.conflict('El horario ya está publicado.');
    if (!current.documentId) {
      throw errors.unprocessable('Adjuntá el archivo de la grilla antes de publicar el horario.', {
        documentId: ['Adjuntá el archivo de la grilla antes de publicar.'],
      });
    }
    if (current.document?.status === 'ARCHIVED') {
      throw errors.unprocessable(
        'El archivo de la grilla está archivado. Restauralo antes de publicar.',
        {
          documentId: ['El archivo está archivado. Restauralo antes de publicar.'],
        },
      );
    }
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const s = await tx.schedule.update({
        where: { id },
        data: { published: true, updatedBy: req.auth!.user.id },
        include,
      });
      await audit.fromReq(
        req,
        { action: 'schedule.publish', entity: 'Schedule', entityId: id },
        tx,
      );
      return s;
    });
    res.json(toDto(row));
  },
);

router.post(
  '/:id/unpublish',
  requirePermission('schedules:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await find(req, id);
    if (!current.published) throw errors.conflict('El horario no está publicado.');
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const s = await tx.schedule.update({
        where: { id },
        data: { published: false, updatedBy: req.auth!.user.id },
        include,
      });
      await audit.fromReq(
        req,
        { action: 'schedule.unpublish', entity: 'Schedule', entityId: id },
        tx,
      );
      return s;
    });
    res.json(toDto(row));
  },
);

/**
 * DELETE /schedules/:id — manual y confirmado en la UI. Solo si no se está mostrando hoy
 * (no publicado, o publicado en un ciclo que ya no es el público). 409 si está visible.
 */
router.delete(
  '/:id',
  requirePermission('schedules:delete'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await find(req, id);
    if (isScheduleVisible(current, current.term)) {
      throw errors.conflict(
        'El horario está publicado en el ciclo público. Despublicalo antes de eliminarlo.',
      );
    }
    await req.ctx.prisma.$transaction(async (tx) => {
      await tx.schedule.delete({ where: { id } });
      await audit.fromReq(
        req,
        {
          action: 'schedule.delete',
          entity: 'Schedule',
          entityId: id,
          detail: { commissionName: current.commissionName },
        },
        tx,
      );
    });
    res.status(204).end();
  },
);
