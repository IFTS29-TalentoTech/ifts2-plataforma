/**
 * Módulo `categories` — categorías de publicaciones, avisos y galería.
 *
 * Reglas:
 *  - Únicas por (nombre, tipo), sin distinguir mayúsculas: "Eventos" y "eventos" son duplicado (409).
 *  - Se pueden renombrar, pero NO cambiar de tipo (las publicaciones/avisos que ya las usan dependen del tipo).
 *  - Se eliminan solo si ninguna publicación ni aviso las referencia (409 con la cantidad de usos).
 *    Es una eliminación manual, confirmada en la interfaz y auditada (ADR-07).
 * Permiso: `categories:manage` (ADMIN, BEDELIA y EDITOR).
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  categoryInput,
  categoryListQuery,
  categoryUpdateInput,
  idParam,
  type CategoryInput,
  type CategoryKind,
  type CategoryUpdateInput,
} from '@ifts2/shared';
import { errors } from '../../infra/errors';
import { pageArgs, toPage } from '../../lib/pagination';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';

export const mountPath = '/categories';
export const router = Router();

const manage = requirePermission('categories:manage');
// Los selectores de autoría necesitan leer el catálogo sin poder administrarlo.
const read = requireAnyPermission(
  'categories:manage',
  'publications:manage',
  'social:moderate',
  'notices:manage',
);

const DUP = { name: ['Ya existe una categoría con ese nombre en este tipo.'] };

type CategoryWithUsage = Prisma.CategoryGetPayload<{
  include: { _count: { select: { publications: true; notices: true } } };
}>;

const withUsage = { _count: { select: { publications: true, notices: true } } } as const;

/** `usageCount` permite al panel deshabilitar "Eliminar" en las categorías en uso. */
function view(c: CategoryWithUsage) {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind as CategoryKind,
    usageCount: c._count.publications + c._count.notices,
  };
}

async function nameTaken(
  db: Prisma.TransactionClient | import('@prisma/client').PrismaClient,
  name: string,
  kind: string,
  exceptId?: string,
) {
  return !!(await db.category.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      kind,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  }));
}

router.get('/', read, validate({ query: categoryListQuery }), async (req, res) => {
  const q = valid<{ kind?: CategoryKind; page: number; pageSize: number }>(req, 'query');
  const where: Prisma.CategoryWhereInput = q.kind ? { kind: q.kind } : {};
  const [total, rows] = await Promise.all([
    req.ctx.prisma.category.count({ where }),
    req.ctx.prisma.category.findMany({
      where,
      include: withUsage,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      ...pageArgs(q),
    }),
  ]);
  res.json(toPage(rows.map(view), total, q));
});

router.post('/', manage, validate({ body: categoryInput }), async (req, res) => {
  const body = valid<CategoryInput>(req, 'body');
  const { prisma } = req.ctx;
  if (await nameTaken(prisma, body.name, body.kind)) {
    throw errors.conflict('Ya existe una categoría con ese nombre.', DUP);
  }
  try {
    const created = await prisma.$transaction(async (tx) => {
      const c = await tx.category.create({ data: body, include: withUsage });
      await audit.fromReq(
        req,
        { action: 'category.create', entity: 'Category', entityId: c.id, detail: { kind: c.kind } },
        tx,
      );
      return c;
    });
    res.status(201).json(view(created));
  } catch (e) {
    // Carrera entre dos altas iguales: la restricción única de la base gana.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw errors.conflict('Ya existe una categoría con ese nombre.', DUP);
    }
    throw e;
  }
});

router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: categoryUpdateInput }),
  async (req, res) => {
    const { id } = req.valid.params as { id: string };
    const body = valid<CategoryUpdateInput>(req, 'body');
    const { prisma } = req.ctx;
    const current = await prisma.category.findUnique({ where: { id } });
    if (!current) throw errors.notFound('No encontramos la categoría.');
    if (await nameTaken(prisma, body.name, current.kind, id)) {
      throw errors.conflict('Ya existe una categoría con ese nombre.', DUP);
    }
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.category.update({
          where: { id },
          data: { name: body.name },
          include: withUsage,
        });
        await audit.fromReq(
          req,
          {
            action: 'category.update',
            entity: 'Category',
            entityId: id,
            detail: { fields: ['name'] },
          },
          tx,
        );
        return c;
      });
      res.json(view(updated));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw errors.conflict('Ya existe una categoría con ese nombre.', DUP);
      }
      throw e;
    }
  },
);

router.delete('/:id', manage, validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params as { id: string };
  const { prisma } = req.ctx;
  const current = await prisma.category.findUnique({ where: { id }, include: withUsage });
  if (!current) throw errors.notFound('No encontramos la categoría.');
  const used = current._count.publications + current._count.notices;
  if (used > 0) {
    throw errors.conflict(
      `No se puede eliminar: la categoría está en uso (${used} ${used === 1 ? 'elemento' : 'elementos'}). Cambiá la categoría de esos elementos primero.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.category.delete({ where: { id } });
    await audit.fromReq(
      req,
      {
        action: 'category.delete',
        entity: 'Category',
        entityId: id,
        detail: { kind: current.kind },
      },
      tx,
    );
  });
  res.status(204).end();
});
