import { describe, expect, it } from 'vitest';
import { hasSinglePublicTerm, termLabel } from '@ifts2/shared';
import { planPublicTermChange } from '../../src/modules/terms/terms.service';

/**
 * Lógica pura del cambio de ciclo público (RF06): "hay exactamente un ciclo publicCurrent".
 * Sin base de datos: lo que se prueba es el plan que luego ejecuta la transacción.
 */
describe('planPublicTermChange', () => {
  const t = (id: string, publicCurrent = false) => ({ id, publicCurrent });

  it('apaga el ciclo público anterior y deja solo el elegido', () => {
    const terms = [t('a', true), t('b'), t('c')];
    const plan = planPublicTermChange(terms, 'b');
    expect(plan).toEqual({ noop: false, unset: ['a'] });
    const after = terms.map((x) => ({ ...x, publicCurrent: x.id === 'b' }));
    expect(hasSinglePublicTerm(after)).toBe(true);
  });

  it('es un no-op si el elegido ya es el único público', () => {
    expect(planPublicTermChange([t('a', true), t('b')], 'a')).toEqual({ noop: true, unset: [] });
  });

  it('sin ciclo público previo solo enciende el elegido', () => {
    expect(planPublicTermChange([t('a'), t('b')], 'b')).toEqual({ noop: false, unset: [] });
  });

  it('repara una base inconsistente con dos públicos: apaga el sobrante', () => {
    const plan = planPublicTermChange([t('a', true), t('b', true), t('c')], 'a');
    expect(plan).toEqual({ noop: false, unset: ['b'] });
  });

  it('un id inexistente es un 404', () => {
    expect(() => planPublicTermChange([t('a', true)], 'zzz')).toThrowError(
      /No encontramos el ciclo/,
    );
  });
});

describe('termLabel', () => {
  it('arma el nombre mostrable', () => {
    expect(termLabel(2026, 'SECOND')).toBe('2026 · 2.º cuatrimestre');
    expect(termLabel(2026, 'EXTRAORDINARY')).toBe('2026 · Turno extraordinario');
  });
});
