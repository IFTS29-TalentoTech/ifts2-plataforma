/**
 * Cálculo puro de la ventana de la sincronización incremental (ADR-038): punto de partida (`since`),
 * motivos de carga completa y avance de la marca.
 */
import { describe, expect, it } from 'vitest';
import type { InstagramSyncState } from '../../src/infra/integration-store';
import {
  nextCoveredUntil,
  OVERLAP_MS,
  PENDING_REFRESH_MAX_MS,
  planSync,
  type SyncIdentity,
} from '../../src/modules/social/sync-window';

const now = new Date('2026-11-07T12:00:00.000Z');
const identity: SyncIdentity = { accountId: '17841', hashtag: '#ifts2web', connection: 'token' };
const state = (over: Partial<InstagramSyncState> = {}): InstagramSyncState => ({
  lastFetchAt: '2026-11-07T11:00:00.000Z',
  coveredUntil: '2026-11-07T10:00:00.000Z',
  mode: 'full',
  count: 3,
  ...identity,
  ...over,
});

describe('planSync', () => {
  it('sin registro previo: completa (primera vez)', () => {
    expect(planSync({ state: null, identity, now })).toEqual({
      mode: 'full',
      since: null,
      fullReason: 'first',
    });
  });

  it('una marca ilegible se trata como primera vez', () => {
    expect(planSync({ state: state({ coveredUntil: 'basura' }), identity, now }).fullReason).toBe(
      'first',
    );
  });

  it('con registro vigente: incremental desde la marca menos el margen de solapamiento', () => {
    const plan = planSync({ state: state(), identity, now });
    expect(plan.mode).toBe('incremental');
    expect(plan.fullReason).toBeNull();
    expect(plan.since!.getTime()).toBe(Date.parse('2026-11-07T10:00:00.000Z') - OVERLAP_MS);
  });

  it('force gana sobre todo lo demás', () => {
    expect(planSync({ state: state(), identity, force: true, now }).fullReason).toBe('forced');
  });

  it('cuenta desconocida (la consulta liviana falló) => completa: no se compara con lo guardado', () => {
    expect(
      planSync({ state: state(), identity: { ...identity, accountId: '' }, now }),
    ).toMatchObject({
      mode: 'full',
      since: null,
      fullReason: 'account',
    });
  });

  it('cambio de cuenta, de hashtag o de método de conexión => completa, con su motivo', () => {
    expect(
      planSync({ state: state(), identity: { ...identity, accountId: '999' }, now }),
    ).toMatchObject({
      mode: 'full',
      fullReason: 'account',
    });
    expect(
      planSync({ state: state(), identity: { ...identity, hashtag: '#otro' }, now }).fullReason,
    ).toBe('hashtag');
    expect(
      planSync({ state: state(), identity: { ...identity, connection: 'oauth' }, now }).fullReason,
    ).toBe('connection');
  });

  it('una marca en el futuro (reloj corrido) se acota a "ahora"', () => {
    const plan = planSync({
      state: state({ coveredUntil: '2027-01-01T00:00:00.000Z' }),
      identity,
      now,
    });
    expect(plan.since!.getTime()).toBe(now.getTime() - OVERLAP_MS);
  });

  it('retrocede hasta la pendiente más vieja para refrescar su imagen, con tope', () => {
    const base = Date.parse('2026-11-07T10:00:00.000Z') - OVERLAP_MS;
    const reciente = new Date(base - 3 * 24 * 3_600_000);
    expect(
      planSync({ state: state(), identity, oldestPending: reciente, now }).since!.getTime(),
    ).toBe(reciente.getTime());
    const vieja = new Date(base - 400 * 24 * 3_600_000);
    expect(planSync({ state: state(), identity, oldestPending: vieja, now }).since!.getTime()).toBe(
      base - PENDING_REFRESH_MAX_MS,
    );
    // una pendiente más nueva que el margen no cambia nada
    const nueva = new Date(base + 60_000);
    expect(planSync({ state: state(), identity, oldestPending: nueva, now }).since!.getTime()).toBe(
      base,
    );
  });
});

describe('nextCoveredUntil (cota de la paginación para la próxima vez)', () => {
  const startedAt = new Date('2026-11-07T12:00:00.000Z');
  const previous = new Date('2026-11-07T10:00:00.000Z');

  it('cobertura completa: la marca es el inicio del fetch', () => {
    expect(
      nextCoveredUntil({
        mode: 'incremental',
        startedAt,
        previous,
        coverage: { complete: true, oldestScanned: '2026-11-01T00:00:00.000Z' },
      }),
    ).toEqual(startedAt);
  });

  it('incremental cortada por límite o páginas: retrocede a la publicación más vieja examinada', () => {
    expect(
      nextCoveredUntil({
        mode: 'incremental',
        startedAt,
        previous,
        coverage: { complete: false, oldestScanned: '2026-11-05T00:00:00.000Z' },
      }),
    ).toEqual(new Date('2026-11-05T00:00:00.000Z'));
  });

  it('incompleta y sin nada examinado: conserva la marca anterior', () => {
    expect(
      nextCoveredUntil({
        mode: 'incremental',
        startedAt,
        previous,
        coverage: { complete: false, oldestScanned: null },
      }),
    ).toEqual(previous);
  });

  it('la carga completa siempre está acotada por el límite: su marca es el inicio del fetch', () => {
    expect(
      nextCoveredUntil({
        mode: 'full',
        startedAt,
        previous: null,
        coverage: { complete: false, oldestScanned: '2026-01-01T00:00:00.000Z' },
      }),
    ).toEqual(startedAt);
  });
});
