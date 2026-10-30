/**
 * Módulo `exam-calls` — llamados a examen / mesas (RF06). Permisos: ADMIN y BEDELIA.
 *
 * Reglas:
 * - Nacen SIN publicar. El sitio público solo muestra los `published` del ciclo `publicCurrent`
 *   (`isExamCallVisible` de @ifts2/shared).
 * - `highlighted` (casilla "destacar", reunión del 06/10) resalta el llamado como próximo evento
 *   hasta que termina; `enrollmentOpen` indica si hay inscripción abierta.
 * - El archivo (cronograma) es opcional y debe ser un Document ACTIVO.
 * - DELETE manual: solo si NO está publicado o su ciclo ya no es el público (409 si no).
 */
import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  examCallCreateInput,
  examCallListQuery,
  examCallUpdateInput,
  idParam,
  isExamCallVisible,
  type ExamCallCreateInput,
  type ExamCallDto,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { assertAttachableDocument, documentRefSelect, toDocumentRef } from '../../lib/documents';
import { pageArgs, toPage } from '../../lib/pagination';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { toTermRef } from '../terms/terms.service';

export const mountPath = '/exam-calls';
export const router = Router();

const include = {
  term: true,
  document: { select: documentRefSelect },
} satisfies Prisma.ExamCallInclude;
type Row = Prisma.ExamCallGetPayload<{ include: typeof include }>;

function toDto(c: Row): ExamCallDto {
  return {
    id: c.id,
    termId: c.termId,
    term: toTermRef(c.term),
    name: c.name,
    startsOn: c.startsOn.toISOString(),
    endsOn: c.endsOn.toISOString(),
    enrollmentOpen: c.enrollmentOpen,
    highlighted: c.highlighted,
    documentId: c.documentId,
    document: toDocumentRef(c.document),
    notes: c.notes,
    published: c.published,
    visibleNow: isExamCallVisible(c, c.term),
    updatedBy: c.updatedBy,
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function find(req: Request, id: string): Promise<Row> {
  const c = await req.ctx.prisma.examCall.findUnique({ where: { id }, include });
  if (!c) throw errors.notFound('No encontramos el llamado a examen.');
  return c;
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

async function assertUniqueName(req: Request, termId: string, name: string, exceptId?: string) {
  const dup = await req.ctx.prisma.examCall.findFirst({
    where: {
      termId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (dup) {
    throw errors.conflict('Ya existe un llamado con ese nombre en este ciclo.', {
      name: ['Ya existe un llamado con ese nombre en este ciclo.'],
    });
  }
}

/** GET /exam-calls?termId=&published=&page= — por fecha de inicio ascendente. */
router.get(
  '/',
  requirePermission('examCalls:manage'),
  validate({ query: examCallListQuery }),
  async (req, res) => {
    const q = valid<z.infer<typeof examCallListQuery>>(req, 'query');
    const where: Prisma.ExamCallWhereInput = {
      ...(q.termId ? { termId: q.termId } : {}),
      ...(q.published !== undefined ? { published: q.published } : {}),
    };
    const [total, rows] = await Promise.all([
      req.ctx.prisma.examCall.count({ where }),
      req.ctx.prisma.examCall.findMany({
        where,
        include,
        orderBy: [{ startsOn: 'asc' }, { id: 'asc' }],
        ...pageArgs(q),
      }),
    ]);
    res.json(toPage(rows.map(toDto), total, q));
  },
);

router.get(
  '/:id',
  requirePermission('examCalls:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    res.json(toDto(await find(req, req.valid.params.id)));
  },
);

router.post(
  '/',
  requirePermission('examCalls:manage'),
  validate({ body: examCallCreateInput }),
  async (req, res) => {
    const body = valid<ExamCallCreateInput>(req, 'body');
    await assertTerm(req, body.termId);
    await assertUniqueName(req, body.termId, body.name);
    await assertAttachableDocument(req.ctx.prisma, body.documentId, 'documentId');
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const c = await tx.examCall.create({
        data: {
          termId: body.termId,
          name: body.name,
          startsOn: body.startsOn,
          endsOn: body.endsOn,
          enrollmentOpen: body.enrollmentOpen,
          highlighted: body.highlighted,
          documentId: body.documentId ?? null,
          notes: body.notes ?? null,
          updatedBy: req.auth!.user.id,
        },
        include,
      });
      await audit.fromReq(
        req,
        {
          action: 'exam-call.create',
          entity: 'ExamCall',
          entityId: c.id,
          detail: { termId: c.termId, name: c.name },
        },
        tx,
      );
      return c;
    });
    res.status(201).json(toDto(row));
  },
);

router.patch(
  '/:id',
  requirePermission('examCalls:manage'),
  validate({ params: idParam, body: examCallUpdateInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const body = valid<Partial<Omit<ExamCallCreateInput, 'termId'>>>(req, 'body');
    const current = await find(req, id);
    const startsOn = body.startsOn ?? current.startsOn;
    const endsOn = body.endsOn ?? current.endsOn;
    if (endsOn.getTime() < startsOn.getTime()) {
      throw errors.unprocessable('La fecha de fin no puede ser anterior a la de inicio.', {
        endsOn: ['La fecha de fin no puede ser anterior a la de inicio.'],
      });
    }
    if (body.name && body.name.toLowerCase() !== current.name.toLowerCase()) {
      await assertUniqueName(req, current.termId, body.name, id);
    }
    if (body.documentId !== undefined && body.documentId !== current.documentId) {
      await assertAttachableDocument(req.ctx.prisma, body.documentId, 'documentId');
    }
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const c = await tx.examCall.update({
        where: { id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          startsOn,
          endsOn,
          ...(body.enrollmentOpen !== undefined ? { enrollmentOpen: body.enrollmentOpen } : {}),
          ...(body.highlighted !== undefined ? { highlighted: body.highlighted } : {}),
          ...(body.documentId !== undefined ? { documentId: body.documentId } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          updatedBy: req.auth!.user.id,
        },
        include,
      });
      await audit.fromReq(
        req,
        {
          action: 'exam-call.update',
          entity: 'ExamCall',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return c;
    });
    res.json(toDto(row));
  },
);

router.post(
  '/:id/publish',
  requirePermission('examCalls:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await find(req, id);
    if (current.published) throw errors.conflict('El llamado ya está publicado.');
    if (current.document?.status === 'ARCHIVED') {
      throw errors.unprocessable(
        'El archivo del llamado está archivado. Restauralo antes de publicar.',
        {
          documentId: ['El archivo está archivado. Restauralo antes de publicar.'],
        },
      );
    }
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const c = await tx.examCall.update({
        where: { id },
        data: { published: true, updatedBy: req.auth!.user.id },
        include,
      });
      await audit.fromReq(
        req,
        { action: 'exam-call.publish', entity: 'ExamCall', entityId: id },
        tx,
      );
      return c;
    });
    res.json(toDto(row));
  },
);

router.post(
  '/:id/unpublish',
  requirePermission('examCalls:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await find(req, id);
    if (!current.published) throw errors.conflict('El llamado no está publicado.');
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const c = await tx.examCall.update({
        where: { id },
        data: { published: false, updatedBy: req.auth!.user.id },
        include,
      });
      await audit.fromReq(
        req,
        { action: 'exam-call.unpublish', entity: 'ExamCall', entityId: id },
        tx,
      );
      return c;
    });
    res.json(toDto(row));
  },
);

/** DELETE /exam-calls/:id — manual; 409 si hoy se muestra en el sitio (publicado y de ciclo público). */
router.delete(
  '/:id',
  requirePermission('examCalls:delete'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await find(req, id);
    if (isExamCallVisible(current, current.term)) {
      throw errors.conflict(
        'El llamado está publicado en el ciclo público. Despublicalo antes de eliminarlo.',
      );
    }
    await req.ctx.prisma.$transaction(async (tx) => {
      await tx.examCall.delete({ where: { id } });
      await audit.fromReq(
        req,
        {
          action: 'exam-call.delete',
          entity: 'ExamCall',
          entityId: id,
          detail: { name: current.name },
        },
        tx,
      );
    });
    res.status(204).end();
  },
);
