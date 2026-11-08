import { describe, expect, it } from 'vitest';
import { hasPendingConfirmation } from '../src';

describe('hasPendingConfirmation (A14)', () => {
  it('detecta la marca de la semilla, sin distinguir mayúsculas', () => {
    expect(hasPendingConfirmation('Fechas: [a confirmar con el cliente]')).toBe(true);
    expect(hasPendingConfirmation('URL [A confirmar]')).toBe(true);
    expect(hasPendingConfirmation('[a confirmar]')).toBe(true);
  });

  it('no confunde texto común con la marca', () => {
    expect(hasPendingConfirmation('Secundario completo.')).toBe(false);
    expect(hasPendingConfirmation('Vas a confirmar tu inscripción en Bedelía.')).toBe(false);
    expect(hasPendingConfirmation('[a confirmarse]')).toBe(false);
  });
});
