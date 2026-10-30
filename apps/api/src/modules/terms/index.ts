/**
 * Módulo `terms` — ciclos lectivos (RF06). Cada ciclo es un año + período (1.º, 2.º, extraordinario).
 * - Listar/crear/editar fechas: ADMIN y BEDELIA (`terms:manage`).
 * - Cambiar el ciclo público (`PUT /terms/:id/public-current`): solo ADMIN (`terms:setPublic`).
 * Nunca se eliminan ciclos (los horarios y llamados históricos cuelgan de ellos).
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  idParam,
  termCreateInput,
  termListQuery,
  termUpdateInput,
  type TermCreateInput,
  type TermUpdateInput,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { pageArgs, toPage } from '../../lib/pagination';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { setPublicTerm, toTermDto } from './terms.service';

export const mountPath = '/terms';
export const router = Router();

const withCounts = { _count: { select: { schedules: true, examCalls: true } } } as const;
const DUPLICATE = {
  year: ['Ya existe un ciclo con ese año y período.'],
  kind: ['Ya existe un ciclo con ese año y período.'],
};

/** GET /terms — más nuevos primero; el ciclo público se reconoce por `publicCurrent`. */
router.get(
  '/',
  requirePermission('terms:manage'),
  validate({ query: termListQuery }),
  async (req, res) => {
    const q = valid<z.infer<typeof termListQuery>>(req, 'query');
    const [total, rows] = await Promise.all([
      req.ctx.prisma.academicTerm.count(),
      req.ctx.prisma.academicTerm.findMany({
        include: withCounts,
        orderBy: [{ year: 'desc' }, { kind: 'desc' }],
        ...pageArgs(q),
      }),
    ]);
    res.json(toPage(rows.map(toTermDto), total, q));
  },
);

router.get(
  '/:id',
  requirePermission('terms:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const t = await req.ctx.prisma.academicTerm.findUnique({
      where: { id: req.valid.params.id },
      include: withCounts,
    });
    if (!t) throw errors.notFound('No encontramos el ciclo.');
    res.json(toTermDto(t));
  },
);

/** POST /terms — año + período únicos (409 con `errors.year`/`errors.kind` si se repite). Nace NO público. */
router.post(
  '/',
  requirePermission('terms:manage'),
  validate({ body: termCreateInput }),
  async (req, res) => {
    const body = valid<TermCreateInput>(req, 'body');
    const { prisma } = req.ctx;
    if (
      await prisma.academicTerm.findUnique({
        where: { year_kind: { year: body.year, kind: body.kind } },
      })
    ) {
      throw errors.conflict('Ya existe un ciclo con ese año y período.', DUPLICATE);
    }
    try {
      const term = await prisma.$transaction(async (tx) => {
        const t = await tx.academicTerm.create({
          data: {
            year: body.year,
            kind: body.kind,
            startsOn: body.startsOn ?? null,
            endsOn: body.endsOn ?? null,
          },
          include: withCounts,
        });
        await audit.fromReq(
          req,
          {
            action: 'term.create',
            entity: 'AcademicTerm',
            entityId: t.id,
            detail: { year: t.year, kind: t.kind },
          },
          tx,
        );
        return t;
      });
      res.status(201).json(toTermDto(term));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw errors.conflict('Ya existe un ciclo con ese año y período.', DUPLICATE);
      }
      throw e;
    }
  },
);

/** PATCH /terms/:id — solo fechas de inicio y fin. */
router.patch(
  '/:id',
  requirePermission('terms:manage'),
  validate({ params: idParam, body: termUpdateInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const body = valid<TermUpdateInput>(req, 'body');
    const { prisma } = req.ctx;
    const current = await prisma.academicTerm.findUnique({ where: { id } });
    if (!current) throw errors.notFound('No encontramos el ciclo.');
    const startsOn = body.startsOn !== undefined ? body.startsOn : current.startsOn;
    const endsOn = body.endsOn !== undefined ? body.endsOn : current.endsOn;
    if (startsOn && endsOn && endsOn.getTime() <= startsOn.getTime()) {
      throw errors.unprocessable('La fecha de fin debe ser posterior a la fecha de inicio.', {
        endsOn: ['La fecha de fin debe ser posterior a la fecha de inicio.'],
      });
    }
    const term = await prisma.$transaction(async (tx) => {
      const t = await tx.academicTerm.update({
        where: { id },
        data: { startsOn, endsOn },
        include: withCounts,
      });
      await audit.fromReq(
        req,
        {
          action: 'term.update',
          entity: 'AcademicTerm',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return t;
    });
    res.json(toTermDto(term));
  },
);

/**
 * PUT /terms/:id/public-current — "Cambiar el ciclo público" (con confirmación en la UI).
 * Deja EXACTAMENTE un ciclo público: el sitio pasa a mostrar los horarios y llamados publicados
 * del nuevo; los del anterior quedan solo en el panel (RF06). Es idempotente (200 si ya era el público).
 */
router.put(
  '/:id/public-current',
  requirePermission('terms:setPublic'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    try {
      const result = await req.ctx.prisma.$transaction(async (tx) => {
        const r = await setPublicTerm(tx, id);
        if (r.changed) {
          await audit.fromReq(
            req,
            {
              action: 'term.set-public',
              entity: 'AcademicTerm',
              entityId: id,
              detail: { previousTermIds: r.previousIds },
            },
            tx,
          );
        }
        return r;
      });
      res.json(toTermDto(result.term));
    } catch (e) {
      // Dos administradores cambiaron el ciclo a la vez: el índice único parcial frenó a uno.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw errors.conflict('Otra persona cambió el ciclo público al mismo tiempo. Reintentá.');
      }
      throw e;
    }
  },
);
