/**
 * Módulo `content` — secciones editables de las páginas estancas: Institucional, La carrera,
 * Estudiantes, Ingreso e Inscripciones (RF01, RF02, ADR-041). Solo ADMIN (`content:manage` / `content:delete`).
 *
 * Una sección es de TEXTO (título + Markdown) o de GALERÍA (muestra una galería con nombre, `galleryId`).
 * Quien edita no escribe identificadores: `POST /content/:page` genera el `slug` a partir del título.
 *
 * El texto es "Markdown acotado": se SANITIZA al guardar (sin HTML crudo, sin imágenes, sin enlaces
 * `javascript:`; ver lib/markdown.ts) y otra vez al publicar en `/public/content/:page`.
 *
 * Secciones y bloques FIJOS (ADR-042): las que trae el sitio (ver `FIXED_SECTIONS` y `PAGE_LAYOUT` en
 * @ifts2/shared) se pueden mostrar, ocultar y editar, pero NO eliminar (si se eliminaran no podrían
 * recrearse). El encabezado de cada página siempre se muestra. Los demás bloques fijos (Avisos,
 * Contacto, Accesos…) se ocultan con `PUT /content/blocks/:blockId`, que guarda la lista en el ajuste
 * `hidden_blocks`; la web pública la lee al consultar (sin tareas programadas).
 *
 * Eliminar (`DELETE /content/:page/:slug`) es manual, solo para secciones AGREGADAS por una persona y
 * solo si están OCULTAS (`visible=false`): una sección visible se oculta primero. Interpretación de
 * "solo secciones no estáticas" de 04-api.md (registrada en docs/specs/09-preguntas-abiertas.md).
 */
import { Router } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  blockIdParams,
  contentOrderInput,
  contentPageParams,
  contentSectionInput,
  contentSectionParams,
  contentVisibleInput,
  isFixedSection,
  isHeaderSection,
  parseHiddenBlocks,
  type ContentOrderInput,
  type ContentPage,
  type ContentSectionKind,
  type ContentSectionDto,
  type ContentSectionInput,
  type ContentVisibleInput,
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
  kind: string;
  galleryId: string | null;
}): ContentSectionDto {
  return { ...s, page: s.page as ContentPage, kind: s.kind as ContentSectionKind };
}

/** "Cómo ingresar" -> "como-ingresar" (minúsculas, sin tildes, con guiones). */
function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  // "order" es la ruta de reordenar (PUT /content/:page/order): no puede ser un identificador.
  return !base || base === 'order' ? `seccion-${base || 'nueva'}` : base;
}

/** Lista de bloques ocultos (ajuste `hidden_blocks`). */
async function readHidden(tx: Prisma.TransactionClient | PrismaClient): Promise<string[]> {
  const row = await tx.siteSetting.findUnique({ where: { key: 'hidden_blocks' } });
  return parseHiddenBlocks(row?.value);
}

type Tx = Prisma.TransactionClient;

/** Datos a guardar según el tipo; una galería debe existir. Una sección de galería no lleva texto obligatorio. */
async function sectionData(tx: Tx, body: ContentSectionInput) {
  if (body.kind === 'GALLERY') {
    if (!(await tx.gallery.findUnique({ where: { id: body.galleryId! } }))) {
      throw errors.unprocessable('La galería elegida ya no existe.', {
        galleryId: ['Elegí otra galería.'],
      });
    }
  }
  return {
    title: body.title,
    body: sanitizeMarkdown(body.body),
    order: body.order,
    visible: body.visible,
    kind: body.kind,
    galleryId: body.kind === 'GALLERY' ? body.galleryId! : null,
  };
}

/**
 * PUT /content/blocks/:blockId — muestra u oculta un bloque fijo de una página (ADR-042). Idempotente.
 * Debe registrarse ANTES de las rutas `/:page/...` para que "blocks" no se tome como una página.
 */
router.put(
  '/blocks/:blockId',
  requirePermission('content:manage'),
  validate({ params: blockIdParams, body: contentVisibleInput }),
  async (req, res) => {
    const { blockId } = req.valid.params as { blockId: string };
    const { visible } = valid<ContentVisibleInput>(req, 'body');
    const hidden = await req.ctx.prisma.$transaction(async (tx) => {
      const current = await readHidden(tx);
      const next = visible
        ? current.filter((id) => id !== blockId)
        : [...new Set([...current, blockId])];
      const value = JSON.stringify(next);
      await tx.siteSetting.upsert({
        where: { key: 'hidden_blocks' },
        create: { key: 'hidden_blocks', value },
        update: { value },
      });
      await audit.fromReq(
        req,
        { action: 'content.block', entity: 'SiteSetting', detail: { blockId, visible } },
        tx,
      );
      return next;
    });
    res.json({ hidden });
  },
);

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
    res.json({
      page: req.valid.params.page,
      items: rows.map(toDto),
      // Bloques fijos ocultos (Avisos, Contacto…): el panel los muestra con su interruptor (ADR-042).
      hidden: await readHidden(req.ctx.prisma),
    });
  },
);

/**
 * POST /content/:page — crea una sección nueva (texto o galería); el `slug` se genera del título y se
 * hace único con un sufijo si ya existe. 201.
 */
router.post(
  '/:page',
  requirePermission('content:manage'),
  validate({ params: contentPageParams, body: contentSectionInput }),
  async (req, res) => {
    const page = req.valid.params.page as string;
    const body = valid<ContentSectionInput>(req, 'body');
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const data = await sectionData(tx, body);
      const base = slugify(body.title);
      let slug = base;
      for (
        let n = 2;
        await tx.contentSection.findUnique({ where: { page_slug: { page, slug } } });
        n++
      ) {
        slug = `${base}-${n}`;
      }
      const r = await tx.contentSection.create({ data: { page, slug, ...data } });
      await audit.fromReq(
        req,
        {
          action: 'content.create',
          entity: 'ContentSection',
          entityId: r.id,
          detail: { page, slug, kind: r.kind },
        },
        tx,
      );
      return r;
    });
    res.status(201).json(toDto(row));
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
 * PUT /content/:page/order — nuevo orden de un grupo de secciones (por ejemplo las tarjetas de texto o las
 * galerías de la página). Se reparten entre ellas los mismos números de posición que ya tenían, así el
 * resto de la página no se mueve. El encabezado no se mueve: es siempre la primera.
 */
router.put(
  '/:page/order',
  requirePermission('content:manage'),
  validate({ params: contentPageParams, body: contentOrderInput }),
  async (req, res) => {
    const page = req.valid.params.page as string;
    const { slugs } = valid<ContentOrderInput>(req, 'body');
    await req.ctx.prisma.$transaction(async (tx) => {
      const rows = await tx.contentSection.findMany({ where: { page, slug: { in: slugs } } });
      if (rows.length !== slugs.length || new Set(slugs).size !== slugs.length) {
        throw errors.conflict(
          'Las secciones cambiaron mientras las ordenabas. Recargá la pantalla e intentá de nuevo.',
        );
      }
      if (slugs.some((sl) => isHeaderSection(page, sl))) {
        throw errors.unprocessable('El encabezado de la página no se puede mover.');
      }
      // Los mismos números de posición, de menor a mayor, repartidos en el orden nuevo. Si hubiera
      // posiciones repetidas se desempata para que el orden quede estrictamente creciente.
      const slots = rows.map((r) => r.order).sort((a, b) => a - b);
      for (let i = 1; i < slots.length; i++) slots[i] = Math.max(slots[i]!, slots[i - 1]! + 1);
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      await Promise.all(
        slugs.map((sl, i) =>
          tx.contentSection.update({
            where: { id: bySlug.get(sl)!.id },
            data: { order: slots[i]! },
          }),
        ),
      );
      await audit.fromReq(
        req,
        { action: 'content.order', entity: 'ContentSection', detail: { page, slugs } },
        tx,
      );
    });
    res.status(204).end();
  },
);

/**
 * PATCH /content/:page/:slug — muestra u oculta una sección sin tocar su texto (el interruptor del panel).
 * El encabezado de la página no se puede ocultar.
 */
router.patch(
  '/:page/:slug',
  requirePermission('content:manage'),
  validate({ params: contentSectionParams, body: contentVisibleInput }),
  async (req, res) => {
    const { page, slug } = req.valid.params as { page: string; slug: string };
    const { visible } = valid<ContentVisibleInput>(req, 'body');
    if (!visible && isHeaderSection(page, slug)) {
      throw errors.conflict('El encabezado de la página siempre se muestra: no se puede ocultar.');
    }
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const current = await tx.contentSection.findUnique({ where: { page_slug: { page, slug } } });
      if (!current) throw errors.notFound('No encontramos la sección.');
      const updated = await tx.contentSection.update({
        where: { id: current.id },
        data: { visible },
      });
      await audit.fromReq(
        req,
        {
          action: 'content.visibility',
          entity: 'ContentSection',
          entityId: current.id,
          detail: { page, slug, visible },
        },
        tx,
      );
      return updated;
    });
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
    try {
      const { row, created } = await req.ctx.prisma.$transaction(async (tx) => {
        const data = await sectionData(tx, body);
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
            detail: { page, slug, kind: r.kind },
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
    if (isFixedSection(page, slug)) {
      throw errors.conflict(
        'Esta sección es parte de la página y no se puede eliminar. Si no la querés, ocultala.',
      );
    }
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
