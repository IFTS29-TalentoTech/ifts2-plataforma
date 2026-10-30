/**
 * Módulo `contact` — formulario de contacto (RF08, RNF08; prioridad Should).
 *
 * Se monta en la RAÍZ de la API porque expone dos grupos de rutas:
 *   POST /public/contact              (sin sesión)
 *   GET/PATCH/DELETE /contact-messages (panel: ADMIN y BEDELIA; borrar solo ADMIN)
 * Por eso no usa `router.use(...)`: cada ruta declara su propio permiso.
 *
 * Reglas del envío público:
 * 1. Anti-spam: campo señuelo (honeypot) `website` + límite de frecuencia por IP (`ctx.limiters.contact`).
 *    Un bot que completa el señuelo recibe 201 igual (no se entera) y no se guarda nada.
 * 2. RNF08 / Ley 25.326: el consentimiento es obligatorio (lo valida `contactInput`).
 * 3. El mensaje se GUARDA SIEMPRE primero; recién después se intenta enviar el correo. Si el correo
 *    falla (o no hay destino configurado) el mensaje se conserva con `mailSent=false` y se responde 201.
 * 4. Privacidad: ni el correo ni el mensaje se escriben en logs ni en la auditoría.
 */
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  contactInput,
  contactListQuery,
  contactStatusInput,
  idParam,
  type ContactInput,
  type ContactMessageDto,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { pageArgs, toPage } from '../../lib/pagination';
import { readRawSettings } from '../../lib/settings';
import { requirePermission } from '../../middleware/auth';
import { valid, validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';

export const mountPath = '/';
export const router = Router();

function toDto(m: {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactMessageDto['status'];
  consent: boolean;
  receivedAt: Date;
  mailSent: boolean;
}): ContactMessageDto {
  return { ...m, receivedAt: m.receivedAt.toISOString() };
}

/** Quita saltos de línea del asunto: evita inyección de encabezados en el correo. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** POST /public/contact -> 201 `{ received: true }`. */
router.post(
  '/public/contact',
  (req, res, next) => {
    // Señuelo: los humanos no ven este campo; los bots lo completan.
    const trap = (req.body as Record<string, unknown> | undefined)?.website;
    if (typeof trap === 'string' && trap.trim() !== '') {
      res.status(201).json({ received: true });
      return;
    }
    next();
  },
  (req, res, next) => req.ctx.limiters.contact(req, res, next),
  validate({ body: contactInput }),
  async (req, res) => {
    const input = valid<ContactInput>(req, 'body');
    const { prisma, logger } = req.ctx;

    // (3) Guardar primero.
    const saved = await prisma.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        consent: true,
      },
    });

    // Intentar el correo; cualquier falla se absorbe (RNF03).
    try {
      const { mailer, contactTo } = await req.ctx.getMailer();
      // Destino: lo configurado en el panel/entorno o, si no hay, el correo institucional de los ajustes.
      const to = contactTo ?? (await readRawSettings(prisma)).email_institutional ?? null;
      if (to) {
        await mailer.send({
          to,
          subject: `[Contacto web] ${oneLine(input.subject)}`,
          text: `Nombre: ${oneLine(input.name)}\nCorreo: ${input.email}\n\n${input.message}`,
          replyTo: input.email,
        });
        await prisma.contactMessage.update({ where: { id: saved.id }, data: { mailSent: true } });
      } else {
        logger.warn(
          'contacto: no hay correo de destino configurado; el mensaje quedó solo en el panel',
        );
      }
    } catch (e) {
      logger.warn(
        { err: (e as Error).message },
        'contacto: falló el envío del correo; el mensaje se conservó',
      );
    }
    res.status(201).json({ received: true });
  },
);

/** GET /contact-messages?status=&q=&page= — los más nuevos primero. */
router.get(
  '/contact-messages',
  requirePermission('contact:read'),
  validate({ query: contactListQuery }),
  async (req, res) => {
    const q = valid<z.infer<typeof contactListQuery>>(req, 'query');
    const where: Prisma.ContactMessageWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { subject: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      req.ctx.prisma.contactMessage.count({ where }),
      req.ctx.prisma.contactMessage.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        ...pageArgs(q),
      }),
    ]);
    res.json(toPage(rows.map(toDto), total, q));
  },
);

router.get(
  '/contact-messages/:id',
  requirePermission('contact:read'),
  validate({ params: idParam }),
  async (req, res) => {
    const m = await req.ctx.prisma.contactMessage.findUnique({
      where: { id: req.valid.params.id },
    });
    if (!m) throw errors.notFound('No encontramos el mensaje.');
    res.json(toDto(m));
  },
);

/** PATCH /contact-messages/:id `{ status: 'NEW' | 'READ' | 'ANSWERED' }`. */
router.patch(
  '/contact-messages/:id',
  requirePermission('contact:read'),
  validate({ params: idParam, body: contactStatusInput }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const { status } = valid<z.infer<typeof contactStatusInput>>(req, 'body');
    if (
      !(await req.ctx.prisma.contactMessage.findUnique({ where: { id }, select: { id: true } }))
    ) {
      throw errors.notFound('No encontramos el mensaje.');
    }
    const m = await req.ctx.prisma.$transaction(async (tx) => {
      const u = await tx.contactMessage.update({ where: { id }, data: { status } });
      await audit.fromReq(
        req,
        { action: 'contact.status', entity: 'ContactMessage', entityId: id, detail: { status } },
        tx,
      );
      return u;
    });
    res.json(toDto(m));
  },
);

/**
 * DELETE /contact-messages/:id — manual, solo ADMIN y solo mensajes ya RESPONDIDOS (409 si no).
 * El permiso `contact:delete` es solo de ADMIN en la matriz de `PERMISSIONS` (Q41, resuelta).
 */
router.delete(
  '/contact-messages/:id',
  requirePermission('contact:delete'),
  validate({ params: idParam }),
  async (req, res) => {
    const id = req.valid.params.id as string;
    const m = await req.ctx.prisma.contactMessage.findUnique({ where: { id } });
    if (!m) throw errors.notFound('No encontramos el mensaje.');
    if (m.status !== 'ANSWERED') {
      throw errors.conflict(
        'Solo se pueden eliminar mensajes ya respondidos. Marcalo como respondido primero.',
      );
    }
    await req.ctx.prisma.$transaction(async (tx) => {
      await tx.contactMessage.delete({ where: { id } });
      await audit.fromReq(
        req,
        { action: 'contact.delete', entity: 'ContactMessage', entityId: id },
        tx,
      );
    });
    res.status(204).end();
  },
);
