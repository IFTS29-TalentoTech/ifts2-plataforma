/**
 * Módulo `gallery` — galerías editables del sitio público (RF09, ADR-036): el carrusel "Vida en la
 * cocina" de Estudiantes (`STUDENTS`) y las fotos de La carrera (`CAREER`). Permiso `gallery:manage`
 * (ADMIN y EDITOR por defecto; el Superadministrador lo ajusta en "Roles y permisos").
 *
 * Reglas:
 * - Hasta 10 diapositivas por galería (Q10, 422 al pasarse).
 * - La imagen se sube como archivo (campo `file`): JPG/PNG/WebP, máx. 5 MB, tipo por firma del archivo,
 *   se reduce a 1600 px y se guarda como WebP con clave aleatoria (ADR-08, `storeUpload`).
 * - Reordenar = mandar los ids de TODAS las diapositivas del área en el orden deseado (`PUT /order`).
 * - DELETE es manual (la interfaz pide confirmación), queda en AuditLog (`gallery.delete`) y borra
 *   también el archivo si era nuestro. Una galería sin diapositivas es válida: la web vuelve a los
 *   ajustes `student_gallery` / `career_image` (respaldo, ADR-036).
 * - Toda mutación audita; las lecturas públicas están en `/public/gallery` (módulo `public`).
 */
import { Router, type Request } from 'express';
import {
  GALLERY_MAX_PER_AREA,
  galleryCreateFields,
  galleryListQuery,
  galleryOrderInput,
  galleryUpdateInput,
  idParam,
  type GalleryOrderInput,
  type GalleryUpdateInput,
} from '@ifts2/shared';
import type { GalleryArea } from '@prisma/client';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { storeUpload } from '../../infra/storage';
import { requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { listGallery, removeStoredImage, toGalleryDto } from './gallery.service';

export const mountPath = '/gallery';
export const router = Router();

const manage = requirePermission('gallery:manage');

/** Sube y valida la imagen del pedido; si no es una imagen, descarta lo subido (415). */
async function storeImage(req: Request): Promise<string> {
  if (!req.file) {
    throw errors.validation('Elegí una imagen para subir.', { file: ['Falta la imagen.'] });
  }
  const stored = await storeUpload(
    req.ctx.storage,
    { buffer: req.file.buffer, originalName: req.file.originalname },
    'gallery',
  );
  if (stored.mimeType === 'application/pdf') {
    await req.ctx.storage.remove(stored.key).catch(() => undefined);
    throw errors.unsupported('La foto debe ser una imagen (JPG, PNG o WebP).');
  }
  return stored.key;
}

/** GET /gallery?area= — diapositivas (de un área o de las dos) con su URL de imagen lista. */
router.get('/', manage, validate({ query: galleryListQuery }), async (req, res) => {
  const { area } = valid<z.infer<typeof galleryListQuery>>(req, 'query');
  const rows = await listGallery(req.ctx, area);
  res.json({
    items: await Promise.all(rows.map((r) => toGalleryDto(req.ctx, r))),
    max: GALLERY_MAX_PER_AREA,
  });
});

/** POST /gallery (multipart: `file` + `area`, `title`, `caption`, `alt`) — agrega al final. */
router.post('/', manage, uploadSingle(), async (req, res) => {
  const parsed = galleryCreateFields.safeParse(req.body ?? {});
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) {
      (fieldErrors[String(i.path[0] ?? 'form')] ??= []).push(i.message);
    }
    throw errors.validation('Revisá los datos de la diapositiva.', fieldErrors);
  }
  const fields = parsed.data;
  const key = await storeImage(req);
  try {
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const count = await tx.galleryItem.count({ where: { area: fields.area } });
      if (count >= GALLERY_MAX_PER_AREA) {
        throw errors.unprocessable(
          `Esta galería ya tiene el máximo de ${GALLERY_MAX_PER_AREA} diapositivas. Eliminá una para sumar otra.`,
        );
      }
      const last = await tx.galleryItem.aggregate({
        where: { area: fields.area },
        _max: { order: true },
      });
      const created = await tx.galleryItem.create({
        data: { ...fields, image: key, order: (last._max.order ?? -1) + 1 },
      });
      await audit.fromReq(
        req,
        {
          action: 'gallery.create',
          entity: 'GalleryItem',
          entityId: created.id,
          detail: { area: created.area, title: created.title },
        },
        tx,
      );
      return created;
    });
    res.status(201).json(await toGalleryDto(req.ctx, row));
  } catch (e) {
    await removeStoredImage(req.ctx, key); // no quedó referenciada: no dejar el archivo huérfano
    throw e;
  }
});

/** PUT /gallery/order — nuevo orden de un área (ids de TODAS sus diapositivas). */
router.put('/order', manage, validate({ body: galleryOrderInput }), async (req, res) => {
  const body = valid<GalleryOrderInput>(req, 'body');
  const area = body.area as GalleryArea;
  const rows = await req.ctx.prisma.$transaction(async (tx) => {
    const current = await tx.galleryItem.findMany({ where: { area }, select: { id: true } });
    const same =
      current.length === body.ids.length &&
      new Set(body.ids).size === body.ids.length &&
      current.every((c) => body.ids.includes(c.id));
    if (!same) {
      throw errors.conflict(
        'La galería cambió mientras la ordenabas. Recargá la pantalla e intentá de nuevo.',
      );
    }
    await Promise.all(
      body.ids.map((id, order) => tx.galleryItem.update({ where: { id }, data: { order } })),
    );
    await audit.fromReq(
      req,
      { action: 'gallery.order', entity: 'GalleryItem', detail: { area } },
      tx,
    );
    return tx.galleryItem.findMany({ where: { area }, orderBy: { order: 'asc' } });
  });
  res.json({ items: await Promise.all(rows.map((r) => toGalleryDto(req.ctx, r))) });
});

/** PATCH /gallery/:id — título, descripción y texto alternativo. */
router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: galleryUpdateInput }),
  async (req, res) => {
    const body = valid<GalleryUpdateInput>(req, 'body');
    const id = req.valid.params.id;
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const current = await tx.galleryItem.findUnique({ where: { id } });
      if (!current) throw errors.notFound('No encontramos la diapositiva.');
      const updated = await tx.galleryItem.update({ where: { id }, data: body });
      await audit.fromReq(
        req,
        {
          action: 'gallery.update',
          entity: 'GalleryItem',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return updated;
    });
    res.json(await toGalleryDto(req.ctx, row));
  },
);

/** POST /gallery/:id/image (multipart `file`) — reemplaza la foto de una diapositiva. */
router.post(
  '/:id/image',
  manage,
  validate({ params: idParam }),
  uploadSingle(),
  async (req, res) => {
    const id = req.valid.params.id;
    const existing = await req.ctx.prisma.galleryItem.findUnique({ where: { id } });
    if (!existing) throw errors.notFound('No encontramos la diapositiva.');
    const key = await storeImage(req);
    try {
      const row = await req.ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.galleryItem.update({ where: { id }, data: { image: key } });
        await audit.fromReq(
          req,
          { action: 'gallery.image', entity: 'GalleryItem', entityId: id },
          tx,
        );
        return updated;
      });
      await removeStoredImage(req.ctx, existing.image); // confirmado: la foto anterior ya no se usa
      res.json(await toGalleryDto(req.ctx, row));
    } catch (e) {
      await removeStoredImage(req.ctx, key);
      throw e;
    }
  },
);

/** DELETE /gallery/:id — manual y auditado; renumera las que quedan. */
router.delete('/:id', manage, validate({ params: idParam }), async (req, res) => {
  const id = req.valid.params.id;
  const removed = await req.ctx.prisma.$transaction(async (tx) => {
    const current = await tx.galleryItem.findUnique({ where: { id } });
    if (!current) throw errors.notFound('No encontramos la diapositiva.');
    await tx.galleryItem.delete({ where: { id } });
    const rest = await tx.galleryItem.findMany({
      where: { area: current.area },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    await Promise.all(
      rest.map((r, order) => tx.galleryItem.update({ where: { id: r.id }, data: { order } })),
    );
    await audit.fromReq(
      req,
      {
        action: 'gallery.delete',
        entity: 'GalleryItem',
        entityId: id,
        detail: { area: current.area, title: current.title },
      },
      tx,
    );
    return current;
  });
  await removeStoredImage(req.ctx, removed.image);
  res.status(204).end();
});
