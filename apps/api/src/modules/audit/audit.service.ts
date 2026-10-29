import type { Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';

/** Acepta el cliente normal o una transacción (`prisma.$transaction(async (tx) => ...)`). */
type DbLike = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  userId?: string | null;
  /** 'publication.publish', 'notice.delete', 'user.create'... */
  action: string;
  entity: string;
  entityId?: string | null;
  /** Detalle NO personal (nunca contraseñas, tokens ni mensajes de contacto). */
  detail?: Prisma.InputJsonValue;
}

export const audit = {
  /** Registra una acción. Toda mutación de contenido debe llamarla (regla de negocio 7). */
  log(db: DbLike, e: AuditEntry) {
    return db.auditLog.create({
      data: {
        userId: e.userId ?? null,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        detail: e.detail ?? undefined,
      },
    });
  },
  /** Igual que `log` pero toma el usuario de `req.auth`. */
  fromReq(req: Request, e: Omit<AuditEntry, 'userId'>, db: DbLike = req.ctx.prisma) {
    return audit.log(db, { ...e, userId: req.auth?.user.id ?? null });
  },
};
