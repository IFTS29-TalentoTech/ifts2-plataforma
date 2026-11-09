/**
 * Módulo `links` — enlaces de interés / accesos directos: SIU Guaraní, Aulas virtuales, Mi Argentina,
 * Tutoría (RF07). Solo ADMIN (`links:manage` / `links:delete`).
 *
 * Reglas:
 * - Los enlaces "a confirmar" (URL provisoria `*.invalid`) no se pueden hacer visibles: primero se
 *   carga la dirección real (docs/specs/08, Q6).
 * - Títulos únicos (sin distinguir mayúsculas) para evitar duplicados.
 * - DELETE manual y solo si el enlace está OCULTO (409 si está visible).
 */
import { Router, type Request } from 'express';
import {
  idParam,
  linkInput,
  linkOrderInput,
  linkListQuery,
  linkUpdateInput,
  type LinkDto,
  type LinkInput,
  type LinkOrderInput,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';

export const mountPath = '/links';
export const router = Router();

const toDto = (l: LinkDto): LinkDto => ({
  id: l.id,
  title: l.title,
  url: l.url,
  description: l.description,
  group: l.group,
  order: l.order,
  visible: l.visible,
  showHome: l.showHome,
  showStudents: l.showStudents,
  enrollment: l.enrollment,
});

/** ¿Es la dirección provisoria de un enlace pendiente de confirmar? */
function isPlaceholderUrl(raw: string): boolean {
  try {
    return new URL(raw).hostname.endsWith('.invalid');
  } catch {
    return false;
  }
}

async function assertUniqueTitle(req: Request, title: string, exceptId?: string) {
  const dup = await req.ctx.prisma.externalLink.findFirst({
    where: {
      title: { equals: title, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (dup) {
    throw errors.conflict('Ya existe un enlace con ese título.', {
      title: ['Ya existe un enlace con ese título.'],
    });
  }
}

function assertCanBeVisible(url: string, visible: boolean) {
  if (visible && isPlaceholderUrl(url)) {
    throw errors.unprocessable(
      'Falta cargar la dirección real: un enlace "a confirmar" no puede mostrarse.',
      {
        url: ['Cargá la dirección real del enlace antes de mostrarlo en el sitio.'],
      },
    );
  }
}

/** GET /links?visible= — todos los enlaces (también los ocultos), por grupo y orden. */
router.get(
  '/',
  requirePermission('links:manage'),
  validate({ query: linkListQuery }),
  async (req, res) => {
    const q = valid<z.infer<typeof linkListQuery>>(req, 'query');
    const rows = await req.ctx.prisma.externalLink.findMany({
      where: q.visible !== undefined ? { visible: q.visible } : {},
      orderBy: [{ order: 'asc' }, { title: 'asc' }],
    });
    res.json({ items: rows.map(toDto), total: rows.length });
  },
);

/** PUT /links/order — nuevo orden (ids de TODOS los enlaces). Botones Subir/Bajar del panel (ADR-039). */
router.put(
  '/order',
  requirePermission('links:manage'),
  validate({ body: linkOrderInput }),
  async (req, res) => {
    const { ids } = valid<LinkOrderInput>(req, 'body');
    await req.ctx.prisma.$transaction(async (tx) => {
      const current = await tx.externalLink.findMany({ select: { id: true } });
      const same =
        current.length === ids.length &&
        new Set(ids).size === ids.length &&
        current.every((c) => ids.includes(c.id));
      if (!same) {
        throw errors.conflict(
          'La lista cambió mientras la ordenabas. Recargá la pantalla e intentá de nuevo.',
        );
      }
      await Promise.all(
        ids.map((id, order) => tx.externalLink.update({ where: { id }, data: { order } })),
      );
      await audit.fromReq(req, { action: 'link.order', entity: 'ExternalLink' }, tx);
    });
    const rows = await req.ctx.prisma.externalLink.findMany({
      orderBy: [{ order: 'asc' }, { title: 'asc' }],
    });
    res.json({ items: rows.map(toDto), total: rows.length });
  },
);

router.get(
  '/:id',
  requirePermission('links:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const l = await req.ctx.prisma.externalLink.findUnique({ where: { id: req.valid.params.id } });
    if (!l) throw errors.notFound('No encontramos el enlace.');
    res.json(toDto(l));
  },
);

router.post(
  '/',
  requirePermission('links:manage'),
  validate({ body: linkInput }),
  async (req, res) => {
    const body = valid<LinkInput>(req, 'body');
    await assertUniqueTitle(req, body.title);
    assertCanBeVisible(body.url, body.visible);
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const l = await tx.externalLink.create({ data: body });
      await audit.fromReq(
        req,
        {
          action: 'link.create',
          entity: 'ExternalLink',
          entityId: l.id,
          detail: { title: l.title },
        },
        tx,
      );
      return l;
    });
    res.status(201).json(toDto(row));
  },
);

router.patch(
  '/:id',
  requirePermission('links:manage'),
  validate({ params: idParam, body: linkUpdateInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const body = valid<Partial<LinkInput>>(req, 'body');
    const current = await req.ctx.prisma.externalLink.findUnique({ where: { id } });
    if (!current) throw errors.notFound('No encontramos el enlace.');
    if (body.title && body.title.toLowerCase() !== current.title.toLowerCase()) {
      await assertUniqueTitle(req, body.title, id);
    }
    assertCanBeVisible(body.url ?? current.url, body.visible ?? current.visible);
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const l = await tx.externalLink.update({ where: { id }, data: body });
      await audit.fromReq(
        req,
        {
          action: 'link.update',
          entity: 'ExternalLink',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return l;
    });
    res.json(toDto(row));
  },
);

router.delete(
  '/:id',
  requirePermission('links:delete'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const current = await req.ctx.prisma.externalLink.findUnique({ where: { id } });
    if (!current) throw errors.notFound('No encontramos el enlace.');
    if (current.visible) {
      throw errors.conflict('El enlace está visible en el sitio. Ocultalo antes de eliminarlo.');
    }
    await req.ctx.prisma.$transaction(async (tx) => {
      await tx.externalLink.delete({ where: { id } });
      await audit.fromReq(
        req,
        {
          action: 'link.delete',
          entity: 'ExternalLink',
          entityId: id,
          detail: { title: current.title },
        },
        tx,
      );
    });
    res.status(204).end();
  },
);
