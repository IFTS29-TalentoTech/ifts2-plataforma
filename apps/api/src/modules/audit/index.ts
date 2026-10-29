import { Router } from 'express';
import { paginationQuery } from '@ifts2/shared';
import { z } from 'zod';
import { pageArgs, toPage } from '../../lib/pagination';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';

export const mountPath = '/audit';
export const router = Router();

const query = paginationQuery.extend({
  entity: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(60).optional(),
  userId: z.string().uuid('El usuario no es válido.').optional(),
});

/** GET /audit?entity=&page= (solo ADMIN). */
router.get('/', requirePermission('audit:read'), validate({ query }), async (req, res) => {
  const q = valid<z.infer<typeof query>>(req, 'query');
  const where = {
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
  };
  const [total, rows] = await Promise.all([
    req.ctx.prisma.auditLog.count({ where }),
    req.ctx.prisma.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      ...pageArgs(q),
      include: { user: { select: { id: true, name: true, role: true } } },
    }),
  ]);
  res.json(
    toPage(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        detail: r.detail,
        at: r.at,
        user: r.user,
      })),
      total,
      q,
    ),
  );
});
