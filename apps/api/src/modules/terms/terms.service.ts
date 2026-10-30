/**
 * Servicio de ciclos lectivos (RF06). Regla central: EXACTAMENTE UN ciclo es `publicCurrent`.
 *
 * Cómo se garantiza (defensa en profundidad):
 * 1. Índice único parcial en la migración inicial (`AcademicTerm_publicCurrent_unique`, WHERE publicCurrent):
 *    la base rechaza dos ciclos públicos aunque haya un bug o dos administradores a la vez.
 * 2. `setPublicTerm` hace el cambio en UNA transacción: primero apaga el anterior y luego
 *    enciende el nuevo (el índice se verifica por sentencia, por eso el orden importa).
 * 3. Si dos cambios compiten, uno recibe P2002 y se traduce a 409 (ver módulo).
 */
import type { AcademicTerm, Prisma } from '@prisma/client';
import { termLabel, type TermDto, type TermRefDto } from '@ifts2/shared';
import { errors } from '../../infra/errors';

type Tx = Prisma.TransactionClient;

export type TermRow = AcademicTerm & { _count?: { schedules: number; examCalls: number } };

export function toTermRef(
  t: Pick<AcademicTerm, 'id' | 'year' | 'kind' | 'publicCurrent'>,
): TermRefDto {
  return {
    id: t.id,
    year: t.year,
    kind: t.kind,
    label: termLabel(t.year, t.kind),
    publicCurrent: t.publicCurrent,
  };
}

export function toTermDto(t: TermRow): TermDto {
  return {
    ...toTermRef(t),
    startsOn: t.startsOn ? t.startsOn.toISOString() : null,
    endsOn: t.endsOn ? t.endsOn.toISOString() : null,
    counts: { schedules: t._count?.schedules ?? 0, examCalls: t._count?.examCalls ?? 0 },
  };
}

export interface PublicTermPlan {
  /** Ya era el público: no hay nada que cambiar. */
  noop: boolean;
  /** Ids a apagar (normalmente uno; más de uno solo si la base estuviera corrupta). */
  unset: string[];
}

/**
 * Lógica pura del cambio de ciclo público (la que se prueba de forma unitaria): dado el estado actual
 * de los ciclos y el elegido, calcula qué ciclos hay que apagar para dejar uno solo.
 */
export function planPublicTermChange(
  terms: Array<{ id: string; publicCurrent: boolean }>,
  targetId: string,
): PublicTermPlan {
  const target = terms.find((t) => t.id === targetId);
  if (!target) throw errors.notFound('No encontramos el ciclo.');
  const others = terms.filter((t) => t.publicCurrent && t.id !== targetId).map((t) => t.id);
  return { noop: target.publicCurrent && others.length === 0, unset: others };
}

export interface PublicTermChange {
  term: TermRow;
  previousIds: string[];
  changed: boolean;
}

/**
 * Deja `targetId` como único ciclo público. Debe ejecutarse dentro de una transacción
 * (`prisma.$transaction`). No audita: lo hace el módulo, con el usuario de la sesión.
 */
export async function setPublicTerm(tx: Tx, targetId: string): Promise<PublicTermChange> {
  const all = await tx.academicTerm.findMany({ select: { id: true, publicCurrent: true } });
  const plan = planPublicTermChange(all, targetId);
  if (!plan.noop) {
    // Primero se apaga el anterior: el índice parcial único se evalúa por sentencia.
    if (plan.unset.length) {
      await tx.academicTerm.updateMany({
        where: { id: { in: plan.unset } },
        data: { publicCurrent: false },
      });
    }
    await tx.academicTerm.update({ where: { id: targetId }, data: { publicCurrent: true } });
  }
  const term = await tx.academicTerm.findUniqueOrThrow({
    where: { id: targetId },
    include: { _count: { select: { schedules: true, examCalls: true } } },
  });
  return { term, previousIds: plan.unset, changed: !plan.noop };
}
