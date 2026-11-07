/**
 * Módulo `teachers` — plantel docente y materias a cargo (RF10, US-29, ADR-037). Permiso
 * `teachers:manage` (ADMIN y EDITOR por defecto; el Superadministrador lo ajusta en "Roles y permisos").
 *
 * Reglas:
 * - Baja lógica: `visible=false` oculta a la persona del sitio sin borrarla (ADR-07: nada se borra solo).
 * - DELETE es manual (la interfaz pide confirmación), queda en AuditLog (`teachers.delete`) y solo
 *   procede si la persona está OCULTA (409 si sigue visible): primero se la saca del sitio.
 * - Foto opcional: archivo JPG/PNG/WebP (máx. 5 MB, tipo por firma, 1600 px → WebP) con clave
 *   aleatoria (ADR-08, `storeUpload`). Es un dato personal (Ley 25.326): la interfaz recuerda el
 *   consentimiento. Se borra el archivo al reemplazarla, quitarla o eliminar a la persona.
 * - Reordenar = mandar los ids de TODAS las personas en el orden deseado (`PUT /order`).
 * - Toda mutación audita; la lectura pública está en `/public/teachers` (módulo `public`).
 */
import { Router } from 'express';
import {
  idParam,
  teacherInput,
  teacherOrderInput,
  teacherUpdateInput,
  type TeacherInput,
  type TeacherOrderInput,
  type TeacherUpdateInput,
} from '@ifts2/shared';
import { errors } from '../../infra/errors';
import { storeUpload } from '../../infra/storage';
import { requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { removeStoredImage } from '../gallery/gallery.service';
import { listTeachers, toTeacherDto } from './teachers.service';

export const mountPath = '/teachers';
export const router = Router();

const manage = requirePermission('teachers:manage');

/** GET /teachers — todo el plantel (visible y oculto) con la URL de la foto lista. */
router.get('/', manage, async (req, res) => {
  const rows = await listTeachers(req.ctx);
  res.json({ items: await Promise.all(rows.map((r) => toTeacherDto(req.ctx, r))) });
});

/** POST /teachers — alta (JSON). Se agrega al final; la foto se sube aparte (`POST /:id/photo`). */
router.post('/', manage, validate({ body: teacherInput }), async (req, res) => {
  const body = valid<TeacherInput>(req, 'body');
  const row = await req.ctx.prisma.$transaction(async (tx) => {
    const last = await tx.teacher.aggregate({ _max: { order: true } });
    const created = await tx.teacher.create({
      data: { ...body, order: (last._max.order ?? -1) + 1 },
    });
    await audit.fromReq(
      req,
      {
        action: 'teachers.create',
        entity: 'Teacher',
        entityId: created.id,
        detail: { name: created.name, visible: created.visible },
      },
      tx,
    );
    return created;
  });
  res.status(201).json(await toTeacherDto(req.ctx, row));
});

/** PUT /teachers/order — nuevo orden (ids de TODAS las personas). */
router.put('/order', manage, validate({ body: teacherOrderInput }), async (req, res) => {
  const body = valid<TeacherOrderInput>(req, 'body');
  const rows = await req.ctx.prisma.$transaction(async (tx) => {
    const current = await tx.teacher.findMany({ select: { id: true } });
    const same =
      current.length === body.ids.length &&
      new Set(body.ids).size === body.ids.length &&
      current.every((c) => body.ids.includes(c.id));
    if (!same) {
      throw errors.conflict(
        'El plantel cambió mientras lo ordenabas. Recargá la pantalla e intentá de nuevo.',
      );
    }
    await Promise.all(
      body.ids.map((id, order) => tx.teacher.update({ where: { id }, data: { order } })),
    );
    await audit.fromReq(req, { action: 'teachers.order', entity: 'Teacher' }, tx);
    return tx.teacher.findMany({ orderBy: { order: 'asc' } });
  });
  res.json({ items: await Promise.all(rows.map((r) => toTeacherDto(req.ctx, r))) });
});

/** PATCH /teachers/:id — nombre, cargo, materias y visibilidad (ocultar/mostrar = baja lógica). */
router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: teacherUpdateInput }),
  async (req, res) => {
    const body = valid<TeacherUpdateInput>(req, 'body');
    const id = req.valid.params.id;
    const row = await req.ctx.prisma.$transaction(async (tx) => {
      const current = await tx.teacher.findUnique({ where: { id } });
      if (!current) throw errors.notFound('No encontramos a la persona.');
      const updated = await tx.teacher.update({ where: { id }, data: body });
      await audit.fromReq(
        req,
        {
          action: 'teachers.update',
          entity: 'Teacher',
          entityId: id,
          detail: { fields: Object.keys(body), name: updated.name },
        },
        tx,
      );
      return updated;
    });
    res.json(await toTeacherDto(req.ctx, row));
  },
);

/** POST /teachers/:id/photo (multipart `file`) — sube o reemplaza la foto. */
router.post(
  '/:id/photo',
  manage,
  validate({ params: idParam }),
  uploadSingle(),
  async (req, res) => {
    const id = req.valid.params.id;
    const existing = await req.ctx.prisma.teacher.findUnique({ where: { id } });
    if (!existing) throw errors.notFound('No encontramos a la persona.');
    if (!req.file) {
      throw errors.validation('Elegí una foto para subir.', { file: ['Falta la foto.'] });
    }
    const stored = await storeUpload(
      req.ctx.storage,
      { buffer: req.file.buffer, originalName: req.file.originalname },
      'teachers',
    );
    if (stored.mimeType === 'application/pdf') {
      await req.ctx.storage.remove(stored.key).catch(() => undefined);
      throw errors.unsupported('La foto debe ser una imagen (JPG, PNG o WebP).');
    }
    try {
      const row = await req.ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.teacher.update({ where: { id }, data: { photo: stored.key } });
        await audit.fromReq(req, { action: 'teachers.photo', entity: 'Teacher', entityId: id }, tx);
        return updated;
      });
      await removeStoredImage(req.ctx, existing.photo); // confirmado: la foto anterior ya no se usa
      res.json(await toTeacherDto(req.ctx, row));
    } catch (e) {
      await removeStoredImage(req.ctx, stored.key); // no quedó referenciada: sin archivo huérfano
      throw e;
    }
  },
);

/** DELETE /teachers/:id/photo — quita la foto (la persona sigue en el plantel, sin foto). */
router.delete('/:id/photo', manage, validate({ params: idParam }), async (req, res) => {
  const id = req.valid.params.id;
  const { row, previous } = await req.ctx.prisma.$transaction(async (tx) => {
    const current = await tx.teacher.findUnique({ where: { id } });
    if (!current) throw errors.notFound('No encontramos a la persona.');
    const updated = await tx.teacher.update({ where: { id }, data: { photo: '' } });
    await audit.fromReq(
      req,
      { action: 'teachers.photo', entity: 'Teacher', entityId: id, detail: { removed: true } },
      tx,
    );
    return { row: updated, previous: current.photo };
  });
  await removeStoredImage(req.ctx, previous);
  res.json(await toTeacherDto(req.ctx, row));
});

/** DELETE /teachers/:id — manual y auditado; solo si la persona está oculta (409 si sigue visible). */
router.delete('/:id', manage, validate({ params: idParam }), async (req, res) => {
  const id = req.valid.params.id;
  const removed = await req.ctx.prisma.$transaction(async (tx) => {
    const current = await tx.teacher.findUnique({ where: { id } });
    if (!current) throw errors.notFound('No encontramos a la persona.');
    if (current.visible) {
      throw errors.conflict(
        'Primero ocultá a la persona del sitio. Solo se pueden eliminar las que están ocultas.',
      );
    }
    await tx.teacher.delete({ where: { id } });
    const rest = await tx.teacher.findMany({ orderBy: { order: 'asc' }, select: { id: true } });
    await Promise.all(
      rest.map((r, order) => tx.teacher.update({ where: { id: r.id }, data: { order } })),
    );
    await audit.fromReq(
      req,
      {
        action: 'teachers.delete',
        entity: 'Teacher',
        entityId: id,
        detail: { name: current.name },
      },
      tx,
    );
    return current;
  });
  await removeStoredImage(req.ctx, removed.photo);
  res.status(204).end();
});
