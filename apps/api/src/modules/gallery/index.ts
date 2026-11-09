/**
 * Módulo `gallery` — galerías de fotos con nombre del sitio público (RF09, ADR-036, ADR-041). El
 * administrador crea las galerías que quiera y después las agrega a cualquier página como una sección
 * (`ContentSection` de tipo GALLERY, desde "Páginas del sitio"). Permiso `gallery:manage` (ADMIN y EDITOR
 * por defecto; el Superadministrador lo ajusta en "Roles y permisos").
 *
 * Reglas:
 * - Hasta 10 fotos por galería (Q10, 422 al pasarse).
 * - La imagen se sube como archivo (campo `file`): JPG/PNG/WebP, máx. 5 MB, tipo por firma del archivo,
 *   se reduce a 1600 px y se guarda como WebP con clave aleatoria (ADR-08, `storeUpload`).
 * - Reordenar = mandar los ids de TODAS las fotos de la galería en el orden deseado (`PUT /:id/order`).
 * - Eliminar es manual (la interfaz pide confirmación), queda en AuditLog y borra también los archivos
 *   propios. Una galería que está en una página NO se puede eliminar: primero se la quita de la página
 *   (409 con el nombre de la página), así el sitio nunca queda con una sección rota.
 * - Toda mutación audita. La lectura pública viaja dentro de `/public/content/:page` (módulo `public`).
 */
import { Router, type Request } from 'express';
import {
  GALLERY_MAX_PER_AREA,
  galleryCreateFields,
  galleryNameInput,
  galleryOrderInput,
  galleryUpdateInput,
  idParam,
  type GalleryNameInput,
  type GalleryOrderInput,
  type GalleryUpdateInput,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { storeUpload } from '../../infra/storage';
import { requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import {
  listGalleries,
  removeStoredImage,
  toGalleryDto,
  toGalleryItemDto,
} from './gallery.service';

export const mountPath = '/gallery';
export const router = Router();

const manage = requirePermission('gallery:manage');
const itemParam = z.object({ itemId: z.string().uuid('La foto no es válida.') });

/** Nombres legibles de las páginas, para los mensajes de "está en uso". */
const PAGE_NAMES: Record<string, string> = {
  institucional: 'Institucional',
  carrera: 'La carrera',
  estudiantes: 'Estudiantes',
  ingreso: 'Ingreso',
  inscripciones: 'Inscripciones',
};

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

async function loadGalleryDto(req: Request, id: string) {
  const row = (await listGalleries(req.ctx)).find((g) => g.id === id);
  if (!row) throw errors.notFound('No encontramos la galería.');
  return toGalleryDto(req.ctx, row);
}

/** GET /gallery — todas las galerías con sus fotos y las páginas donde se muestran. */
router.get('/', manage, async (req, res) => {
  const rows = await listGalleries(req.ctx);
  res.json({
    galleries: await Promise.all(rows.map((r) => toGalleryDto(req.ctx, r))),
    max: GALLERY_MAX_PER_AREA,
  });
});

/** POST /gallery `{ name }` — crea una galería vacía (al final). */
router.post('/', manage, validate({ body: galleryNameInput }), async (req, res) => {
  const { name } = valid<GalleryNameInput>(req, 'body');
  const row = await req.ctx.prisma.$transaction(async (tx) => {
    const last = await tx.gallery.aggregate({ _max: { order: true } });
    const created = await tx.gallery.create({ data: { name, order: (last._max.order ?? -1) + 1 } });
    await audit.fromReq(
      req,
      { action: 'gallery.create', entity: 'Gallery', entityId: created.id, detail: { name } },
      tx,
    );
    return created;
  });
  res.status(201).json(await loadGalleryDto(req, row.id));
});

/** PATCH /gallery/:id `{ name }` — renombra (no cambia el título de las secciones ya creadas). */
router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: galleryNameInput }),
  async (req, res) => {
    const { name } = valid<GalleryNameInput>(req, 'body');
    const id = req.valid.params.id;
    await req.ctx.prisma.$transaction(async (tx) => {
      if (!(await tx.gallery.findUnique({ where: { id } }))) {
        throw errors.notFound('No encontramos la galería.');
      }
      await tx.gallery.update({ where: { id }, data: { name } });
      await audit.fromReq(
        req,
        { action: 'gallery.rename', entity: 'Gallery', entityId: id, detail: { name } },
        tx,
      );
    });
    res.json(await loadGalleryDto(req, id));
  },
);

/** DELETE /gallery/:id — manual y auditado; no se puede si está en alguna página. */
router.delete('/:id', manage, validate({ params: idParam }), async (req, res) => {
  const id = req.valid.params.id;
  const images = await req.ctx.prisma.$transaction(async (tx) => {
    const current = await tx.gallery.findUnique({
      where: { id },
      include: { items: true, sections: { select: { page: true } } },
    });
    if (!current) throw errors.notFound('No encontramos la galería.');
    if (current.sections.length > 0) {
      const where = [...new Set(current.sections.map((s) => PAGE_NAMES[s.page] ?? s.page))];
      throw errors.conflict(
        `Esta galería se muestra en: ${where.join(', ')}. Quitala de esa página (en "Páginas del sitio") antes de eliminarla.`,
      );
    }
    await tx.gallery.delete({ where: { id } }); // las fotos se eliminan en cascada
    await audit.fromReq(
      req,
      {
        action: 'gallery.delete',
        entity: 'Gallery',
        entityId: id,
        detail: { name: current.name, photos: current.items.length },
      },
      tx,
    );
    return current.items.map((i) => i.image);
  });
  await Promise.all(images.map((image) => removeStoredImage(req.ctx, image)));
  res.status(204).end();
});

/** POST /gallery/:id/items (multipart: `file` + `title`, `caption`, `alt`, `category`) — agrega al final. */
router.post(
  '/:id/items',
  manage,
  validate({ params: idParam }),
  uploadSingle(),
  async (req, res) => {
    const galleryId = req.valid.params.id;
    const parsed = galleryCreateFields.safeParse(req.body ?? {});
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const i of parsed.error.issues) {
        (fieldErrors[String(i.path[0] ?? 'form')] ??= []).push(i.message);
      }
      throw errors.validation('Revisá los datos de la foto.', fieldErrors);
    }
    const fields = parsed.data;
    if (!(await req.ctx.prisma.gallery.findUnique({ where: { id: galleryId } }))) {
      throw errors.notFound('No encontramos la galería.');
    }
    const key = await storeImage(req);
    try {
      const row = await req.ctx.prisma.$transaction(async (tx) => {
        const count = await tx.galleryItem.count({ where: { galleryId } });
        if (count >= GALLERY_MAX_PER_AREA) {
          throw errors.unprocessable(
            `Esta galería ya tiene el máximo de ${GALLERY_MAX_PER_AREA} fotos. Eliminá una para sumar otra.`,
          );
        }
        const last = await tx.galleryItem.aggregate({
          where: { galleryId },
          _max: { order: true },
        });
        const created = await tx.galleryItem.create({
          data: { ...fields, galleryId, image: key, order: (last._max.order ?? -1) + 1 },
        });
        await audit.fromReq(
          req,
          {
            action: 'gallery.item.create',
            entity: 'GalleryItem',
            entityId: created.id,
            detail: { galleryId, title: created.title },
          },
          tx,
        );
        return created;
      });
      res.status(201).json(await toGalleryItemDto(req.ctx, row));
    } catch (e) {
      await removeStoredImage(req.ctx, key); // no quedó referenciada: no dejar el archivo huérfano
      throw e;
    }
  },
);

/** PUT /gallery/:id/order — nuevo orden de las fotos (ids de TODAS las de la galería). */
router.put(
  '/:id/order',
  manage,
  validate({ params: idParam, body: galleryOrderInput }),
  async (req, res) => {
    const body = valid<GalleryOrderInput>(req, 'body');
    const galleryId = req.valid.params.id;
    await req.ctx.prisma.$transaction(async (tx) => {
      const current = await tx.galleryItem.findMany({
        where: { galleryId },
        select: { id: true },
      });
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
        { action: 'gallery.order', entity: 'Gallery', entityId: galleryId },
        tx,
      );
    });
    res.json(await loadGalleryDto(req, galleryId));
  },
);

/** PATCH /gallery/items/:itemId — título, descripción, texto alternativo y categoría. */
router.patch(
  '/items/:itemId',
  manage,
  validate({ params: itemParam, body: galleryUpdateInput }),
  async (req, res) => {
    const body = valid<GalleryUpdateInput>(req, 'body');
    const id = req.valid.params.itemId as string;
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const current = await tx.galleryItem.findUnique({ where: { id } });
      if (!current) throw errors.notFound('No encontramos la foto.');
      const updated = await tx.galleryItem.update({ where: { id }, data: body });
      await audit.fromReq(
        req,
        {
          action: 'gallery.item.update',
          entity: 'GalleryItem',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return updated;
    });
    res.json(await toGalleryItemDto(req.ctx, row));
  },
);

/** POST /gallery/items/:itemId/image (multipart `file`) — reemplaza la foto. */
router.post(
  '/items/:itemId/image',
  manage,
  validate({ params: itemParam }),
  uploadSingle(),
  async (req, res) => {
    const id = req.valid.params.itemId as string;
    const existing = await req.ctx.prisma.galleryItem.findUnique({ where: { id } });
    if (!existing) throw errors.notFound('No encontramos la foto.');
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
      res.json(await toGalleryItemDto(req.ctx, row));
    } catch (e) {
      await removeStoredImage(req.ctx, key);
      throw e;
    }
  },
);

/** DELETE /gallery/items/:itemId — manual y auditado; renumera las que quedan. */
router.delete('/items/:itemId', manage, validate({ params: itemParam }), async (req, res) => {
  const id = req.valid.params.itemId as string;
  const removed = await req.ctx.prisma.$transaction(async (tx) => {
    const current = await tx.galleryItem.findUnique({ where: { id } });
    if (!current) throw errors.notFound('No encontramos la foto.');
    await tx.galleryItem.delete({ where: { id } });
    const rest = await tx.galleryItem.findMany({
      where: { galleryId: current.galleryId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    await Promise.all(
      rest.map((r, order) => tx.galleryItem.update({ where: { id: r.id }, data: { order } })),
    );
    await audit.fromReq(
      req,
      {
        action: 'gallery.item.delete',
        entity: 'GalleryItem',
        entityId: id,
        detail: { galleryId: current.galleryId, title: current.title },
      },
      tx,
    );
    return current;
  });
  await removeStoredImage(req.ctx, removed.image);
  res.status(204).end();
});
