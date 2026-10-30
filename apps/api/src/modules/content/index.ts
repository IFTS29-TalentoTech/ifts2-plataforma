/**
 * Módulo `content` — secciones editables de las páginas estancas: Institucional, La carrera e
 * Ingreso (RF01, RF02). Solo ADMIN (`content:manage` / `content:delete`).
 *
 * El texto es "Markdown acotado": se SANITIZA al guardar (sin HTML crudo, sin imágenes, sin enlaces
 * `javascript:`; ver lib/markdown.ts) y otra vez al publicar en `/public/content/:page`.
 *
 * Eliminar (`DELETE /content/:page/:slug`) es manual y solo para secciones OCULTAS (`visible=false`):
 * una sección visible se oculta primero. Interpretación de "solo secciones no estáticas" de 04-api.md
 * (registrada en docs/specs/09-preguntas-abiertas.md).
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  contentPageParams,
  contentSectionInput,
  contentSectionParams,
  type ContentPage,
  type ContentSectionDto,
  type ContentSectionInput,
} from '@ifts2/shared';
import { errors } from '../../infra/errors';
import { sanitizeMarkdown } from '../../lib/markdown';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';

export const mountPath = '/content';
export const router = Router();

function toDto(s: {
  id: string;
  page: string;
  slug: string;
  title: string;
  body: string;
  order: number;
  visible: boolean;
}): ContentSectionDto {
  return { ...s, page: s.page as ContentPage };
}

/** GET /content/:page — todas las secciones de la página (también las ocultas), en orden. */
router.get(
  '/:page',
  requirePermission('content:manage'),
  validate({ params: contentPageParams }),
  async (req, res) => {
    const rows = await req.ctx.prisma.contentSection.findMany({
      where: { page: req.valid.params.page },
      orderBy: [{ order: 'asc' }, { slug: 'asc' }],
    });
    res.json({ page: req.valid.params.page, items: rows.map(toDto) });
  },
);

router.get(
  '/:page/:slug',
  requirePermission('content:manage'),
  validate({ params: contentSectionParams }),
  async (req, res) => {
    const { page, slug } = req.valid.params as { page: string; slug: string };
    const row = await req.ctx.prisma.contentSection.findUnique({
      where: { page_slug: { page, slug } },
    });
    if (!row) throw errors.notFound('No encontramos la sección.');
    res.json(toDto(row));
  },
);

/**
 * PUT /content/:page/:slug — crea la sección si no existe (201) o la reemplaza (200).
 * Body: `{ title, body, order?, visible? }`.
 */
router.put(
  '/:page/:slug',
  requirePermission('content:manage'),
  validate({ params: contentSectionParams, body: contentSectionInput }),
  async (req, res) => {
    const { page, slug } = req.valid.params as { page: string; slug: string };
    const body = valid<ContentSectionInput>(req, 'body');
    const data = {
      title: body.title,
      body: sanitizeMarkdown(body.body),
      order: body.order,
      visible: body.visible,
    };
    try {
      const { row, created } = await req.ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.contentSection.findUnique({
          where: { page_slug: { page, slug } },
        });
        const r = existing
          ? await tx.contentSection.update({ where: { id: existing.id }, data })
          : await tx.contentSection.create({ data: { page, slug, ...data } });
        await audit.fromReq(
          req,
          {
            action: existing ? 'content.update' : 'content.create',
            entity: 'ContentSection',
            entityId: r.id,
            detail: { page, slug },
          },
          tx,
        );
        return { row: r, created: !existing };
      });
      res.status(created ? 201 : 200).json(toDto(row));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw errors.conflict('Otra persona creó esta sección al mismo tiempo. Reintentá.');
      }
      throw e;
    }
  },
);

router.delete(
  '/:page/:slug',
  requirePermission('content:delete'),
  validate({ params: contentSectionParams }),
  async (req, res) => {
    const { page, slug } = req.valid.params as { page: string; slug: string };
    const row = await req.ctx.prisma.contentSection.findUnique({
      where: { page_slug: { page, slug } },
    });
    if (!row) throw errors.notFound('No encontramos la sección.');
    if (row.visible) {
      throw errors.conflict('La sección está visible en el sitio. Ocultala antes de eliminarla.');
    }
    await req.ctx.prisma.$transaction(async (tx) => {
      await tx.contentSection.delete({ where: { id: row.id } });
      await audit.fromReq(
        req,
        {
          action: 'content.delete',
          entity: 'ContentSection',
          entityId: row.id,
          detail: { page, slug },
        },
        tx,
      );
    });
    res.status(204).end();
  },
);
