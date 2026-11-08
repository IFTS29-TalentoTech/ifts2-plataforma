/**
 * Módulo `documents` — archivo documental y adjuntos (RF03; US-16, US-17, US-18). ADMIN y BEDELIA.
 *
 * Flujo de carga: `uploadSingle()` (multipart, campo `file`) -> `storeUpload()` (tipo por firma del
 * archivo, 10 MB PDF / 5 MB imagen, imágenes a WebP 1600 px, clave aleatoria) -> fila `Document`.
 * La clave de almacenamiento nunca sale en una respuesta: se descarga con `GET /:id/file` (URL firmada).
 *
 * Si el almacenamiento falla al subir se responde 502 y no queda ninguna fila a medias; si falla
 * la base después de guardar el archivo, el archivo se borra para no dejar basura.
 */
import { Router, type Request } from 'express';
import { AppError, errors } from '../../infra/errors';
import {
  documentArchiveInput,
  documentListQuery,
  documentMetaInput,
  documentUpdateInput,
  idParam,
  type DocumentArchiveInput,
  type DocumentMetaInput,
  type DocumentUpdateInput,
} from '@ifts2/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { storeUpload } from '../../infra/storage';
import { pageArgs, toPage } from '../../lib/pagination';
import { requirePermission } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import {
  findReferences,
  searchWhere,
  toDocumentDetailDto,
  toDocumentDto,
  usageCount,
} from './documents.service';

export const mountPath = '/documents';
export const router = Router();

async function findDoc(req: Request, id: string) {
  const d = await req.ctx.prisma.document.findUnique({ where: { id }, include: usageCount });
  if (!d) throw errors.notFound('No encontramos el documento.');
  return d;
}

/** GET /documents?q=&kind=&cycleYear=&status=&page= — más nuevos primero. */
router.get(
  '/',
  requirePermission('documents:manage'),
  validate({ query: documentListQuery }),
  async (req, res) => {
    const q = valid<z.infer<typeof documentListQuery>>(req, 'query');
    const where: Prisma.DocumentWhereInput = {
      ...(q.q ? searchWhere(q.q) : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.cycleYear ? { cycleYear: q.cycleYear } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [total, rows] = await Promise.all([
      req.ctx.prisma.document.count({ where }),
      req.ctx.prisma.document.findMany({
        where,
        include: usageCount,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(q),
      }),
    ]);
    res.json(toPage(rows.map(toDocumentDto), total, q));
  },
);

/**
 * POST /documents (multipart/form-data): campo `file` + metadatos como campos de texto
 * (`title`, `kind`, `category`, `cycleYear`, `termLabel`, `resolutionCode`).
 */
router.post(
  '/',
  requirePermission('documents:manage'),
  uploadSingle(),
  validate({ body: documentMetaInput }),
  async (req, res) => {
    const meta = valid<DocumentMetaInput>(req, 'body');
    if (!req.file) {
      throw errors.validation('Adjuntá un archivo (PDF, JPG, PNG o WebP).', {
        file: ['Adjuntá un archivo (PDF, JPG, PNG o WebP).'],
      });
    }
    const { prisma, storage } = req.ctx;
    let stored;
    try {
      stored = await storeUpload(
        storage,
        { buffer: req.file.buffer, originalName: req.file.originalname },
        'documents',
      );
    } catch (e) {
      if (e instanceof AppError) throw e; // tipo no permitido (415) o archivo grande (413)
      req.ctx.logger.error(
        { err: (e as Error).message },
        'falló el almacenamiento al subir un documento',
      );
      throw errors.badGateway('No pudimos guardar el archivo. Intentá de nuevo en unos minutos.');
    }
    try {
      const doc = await prisma.$transaction(async (tx) => {
        const d = await tx.document.create({
          data: {
            title: meta.title,
            filename: stored.filename,
            kind: meta.kind,
            category: meta.category,
            cycleYear: meta.cycleYear,
            termLabel: meta.termLabel,
            resolutionCode: meta.resolutionCode,
            storageKey: stored.key,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            uploadedBy: req.auth!.user.id,
          },
          include: usageCount,
        });
        await audit.fromReq(
          req,
          {
            action: 'document.create',
            entity: 'Document',
            entityId: d.id,
            detail: { title: d.title, kind: d.kind, sizeBytes: d.sizeBytes },
          },
          tx,
        );
        return d;
      });
      res.status(201).json(toDocumentDto(doc));
    } catch (e) {
      await storage.remove(stored.key).catch(() => undefined); // sin huérfanos
      throw e;
    }
  },
);

/** GET /documents/:id — detalle con las referencias (qué avisos, horarios o llamados lo usan). */
router.get(
  '/:id',
  requirePermission('documents:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const doc = await findDoc(req, req.valid.params.id);
    res.json(toDocumentDetailDto(doc, await findReferences(req.ctx.prisma, doc.id)));
  },
);

/** GET /documents/:id/file — `{ url, filename, mimeType }` con URL firmada de corta duración. */
router.get(
  '/:id/file',
  requirePermission('documents:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const doc = await req.ctx.prisma.document.findUnique({ where: { id: req.valid.params.id } });
    if (!doc) throw errors.notFound('No encontramos el documento.');
    try {
      const url = await req.ctx.storage.getSignedUrl(doc.storageKey);
      res.json({ url, filename: doc.filename, mimeType: doc.mimeType });
    } catch {
      throw errors.badGateway('No pudimos generar el enlace de descarga. Intentá de nuevo.');
    }
  },
);

/** PATCH /documents/:id — solo metadatos; el archivo no se reemplaza (se sube otro documento). */
router.patch(
  '/:id',
  requirePermission('documents:manage'),
  validate({ params: idParam, body: documentUpdateInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const body = valid<DocumentUpdateInput>(req, 'body');
    await findDoc(req, id);
    const doc = await req.ctx.prisma.$transaction(async (tx) => {
      const d = await tx.document.update({
        where: { id },
        data: body,
        include: usageCount,
      });
      await audit.fromReq(
        req,
        {
          action: 'document.update',
          entity: 'Document',
          entityId: id,
          detail: { fields: Object.keys(body) },
        },
        tx,
      );
      return d;
    });
    res.json(toDocumentDto(doc));
  },
);

/**
 * POST /documents/:id/archive  body opcional `{ force: true }`.
 * Si el documento está adjunto a algo que hoy se ve en el sitio responde 409 con
 * `requiresConfirmation: true` y `references`; la UI muestra el aviso y reintenta con `force: true`.
 * El adjunto sigue enlazado (el contenido visible no se rompe); solo sale del Archivo activo.
 */
router.post(
  '/:id/archive',
  requirePermission('documents:manage'),
  validate({ params: idParam, body: documentArchiveInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const { force } = valid<DocumentArchiveInput>(req, 'body');
    const doc = await findDoc(req, id);
    if (doc.status === 'ARCHIVED') throw errors.conflict('El documento ya está archivado.');
    const refs = await findReferences(req.ctx.prisma, id);
    const visible = refs.filter((r) => r.visible);
    if (visible.length > 0 && !force) {
      throw new AppError(
        'conflict',
        'Conflicto',
        'El documento está adjunto a contenido que hoy se ve en el sitio. Confirmá para archivarlo igual.',
        undefined,
        { requiresConfirmation: true, references: visible },
      );
    }
    const updated = await req.ctx.prisma.$transaction(async (tx) => {
      const d = await tx.document.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
        include: usageCount,
      });
      await audit.fromReq(
        req,
        {
          action: 'document.archive',
          entity: 'Document',
          entityId: id,
          detail: { forced: visible.length > 0, visibleReferences: visible.length },
        },
        tx,
      );
      return d;
    });
    res.json(toDocumentDto(updated));
  },
);

/** POST /documents/:id/restore — vuelve a ACTIVE y registra `restoredAt` (conserva `archivedAt` como historial). */
router.post(
  '/:id/restore',
  requirePermission('documents:manage'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const doc = await findDoc(req, id);
    if (doc.status !== 'ARCHIVED') throw errors.conflict('El documento no está archivado.');
    const updated = await req.ctx.prisma.$transaction(async (tx) => {
      const d = await tx.document.update({
        where: { id },
        data: { status: 'ACTIVE', restoredAt: new Date() },
        include: usageCount,
      });
      await audit.fromReq(
        req,
        { action: 'document.restore', entity: 'Document', entityId: id },
        tx,
      );
      return d;
    });
    res.json(toDocumentDto(updated));
  },
);

/**
 * DELETE /documents/:id — manual (la UI confirma). Solo documentos ARCHIVADOS y sin ninguna
 * referencia de avisos, horarios o llamados (409 en caso contrario). Borra también el archivo
 * del almacenamiento; si eso falla, el registro igual se elimina y queda un aviso en el log.
 */
router.delete(
  '/:id',
  requirePermission('documents:delete'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const doc = await findDoc(req, id);
    if (doc.status !== 'ARCHIVED') {
      throw errors.conflict('Solo se pueden eliminar documentos archivados. Archivalo primero.');
    }
    const refs = await findReferences(req.ctx.prisma, id);
    if (refs.length > 0) {
      throw new AppError(
        'conflict',
        'Conflicto',
        'El documento está adjunto a avisos, horarios o llamados. Quitalo de ahí antes de eliminarlo.',
        undefined,
        { references: refs },
      );
    }
    try {
      await req.ctx.prisma.$transaction(async (tx) => {
        await tx.document.delete({ where: { id } });
        await audit.fromReq(
          req,
          {
            action: 'document.delete',
            entity: 'Document',
            entityId: id,
            detail: { title: doc.title },
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw errors.conflict(
          'El archivo fue adjuntado durante la operación. Recargá y revisá sus referencias antes de eliminarlo.',
        );
      }
      throw error;
    }
    await req.ctx.storage.remove(doc.storageKey).catch((e: Error) => {
      req.ctx.logger.warn(
        { err: e.message, documentId: id },
        'no se pudo borrar el archivo del almacenamiento',
      );
    });
    res.status(204).end();
  },
);
