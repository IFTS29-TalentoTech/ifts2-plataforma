/**
 * Cálculo puro (sin base ni red) de la ventana de la sincronización incremental de Instagram (ADR-038).
 *
 * Idea: cada fetch EXITOSO deja una marca (`coveredUntil`): "todo lo publicado hasta acá ya se vio". La
 * próxima sincronización pide solo lo posterior a esa marca (menos un margen) en vez de todo el listado.
 * Las reglas viven acá, aisladas, para probarlas sin servidor:
 *  - Un fetch fallido no avanza la marca (el servicio simplemente no la guarda).
 *  - Margen de solapamiento: se retrocede unas horas; la idempotencia por `externalId` evita duplicados.
 *  - Carga completa si es la primera, si la piden a mano o si cambió la cuenta, el hashtag o el método
 *    de conexión (lo guardado ya no describe la situación actual).
 */
import type { InstagramSyncState } from '../../infra/integration-store';
import type { FetchCoverage } from '../../infra/instagram';

/** Cuánto se retrocede desde la marca para cubrir demoras de Instagram y diferencias de reloj. */
export const OVERLAP_MS = 6 * 3_600_000;
/**
 * Las pendientes (DETECTED) se vuelven a traer para refrescar su imagen (las URLs de Instagram vencen),
 * pero hasta este tope hacia atrás: una pendiente muy vieja no puede volver pesada cada sincronización.
 * Las más viejas se refrescan con la sincronización completa.
 */
export const PENDING_REFRESH_MAX_MS = 14 * 24 * 3_600_000;

/** Con qué cuenta, hashtag y método se sincroniza ahora. Nada de esto es secreto. */
export interface SyncIdentity {
  accountId: string;
  /** Hashtag normalizado (minúsculas, con `#`). */
  hashtag: string;
  /** 'oauth' | 'token' | 'demo'. */
  connection: string;
}

export type FullReason = 'first' | 'forced' | 'account' | 'hashtag' | 'connection';

export interface SyncPlan {
  mode: 'incremental' | 'full';
  /** Cota inferior para pedir a Instagram; `null` en la carga completa. */
  since: Date | null;
  /** Por qué es completa (`null` si es incremental). */
  fullReason: FullReason | null;
}

/** Decide si la sincronización es incremental o completa y desde cuándo. */
export function planSync(p: {
  state: InstagramSyncState | null;
  identity: SyncIdentity;
  force?: boolean;
  /** Fecha de publicación de la pendiente más vieja de Instagram, si hay. */
  oldestPending?: Date | null;
  now?: Date;
}): SyncPlan {
  const full = (fullReason: FullReason): SyncPlan => ({ mode: 'full', since: null, fullReason });
  const { state, identity } = p;
  if (p.force) return full('forced');
  const covered = state ? Date.parse(state.coveredUntil) : NaN;
  if (!state || Number.isNaN(covered)) return full('first');
  if (state.accountId !== identity.accountId) return full('account');
  if (state.hashtag !== identity.hashtag) return full('hashtag');
  if (state.connection !== identity.connection) return full('connection');

  // Una marca en el futuro (reloj corrido) se acota a "ahora" para no saltear publicaciones.
  const now = (p.now ?? new Date()).getTime();
  const base = Math.min(covered, now) - OVERLAP_MS;
  let since = base;
  if (p.oldestPending) {
    const pending = p.oldestPending.getTime();
    since = Math.min(base, Math.max(pending, base - PENDING_REFRESH_MAX_MS));
  }
  return { mode: 'incremental', since: new Date(since), fullReason: null };
}

/**
 * Nueva marca tras un fetch exitoso. Normalmente es el INSTANTE EN QUE EMPEZÓ el fetch (no cuando
 * terminó: lo publicado mientras tanto se verá en la próxima). Si una incremental se cortó antes de
 * llegar a la marca anterior (límite o tope de páginas), solo se garantiza lo posterior a la publicación
 * más vieja examinada: la marca retrocede hasta ahí para que la siguiente siga desde ese punto.
 * Una carga completa siempre queda acotada por el límite, así que su marca es el inicio del fetch.
 */
export function nextCoveredUntil(p: {
  mode: 'incremental' | 'full';
  startedAt: Date;
  coverage: FetchCoverage | null;
  previous: Date | null;
}): Date {
  const c = p.coverage;
  if (p.mode === 'full' || !c || c.complete) return p.startedAt;
  if (c.oldestScanned)
    return new Date(Math.min(Date.parse(c.oldestScanned), p.startedAt.getTime()));
  return p.previous ?? p.startedAt;
}
