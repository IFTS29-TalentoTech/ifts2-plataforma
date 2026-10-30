/**
 * Panel B · "reiniciar el estado cuando cambia algo" sin useEffect.
 *
 * Los diálogos de formulario deben arrancar limpios (o con los datos del elemento editado) cada vez
 * que se abren. La forma recomendada por React (y exigida por nuestro lint: react-hooks/set-state-in-effect)
 * es ajustar el estado DURANTE el render cuando cambia el disparador, no en un efecto.
 *
 * Uso:
 *   useResetOn(open ? (item?.id ?? 'nuevo') : 'cerrado', () => { setName(item?.name ?? ''); ... });
 *
 * `reset` se ejecuta en el primer render y cada vez que `trigger` cambia (comparado con Object.is).
 * Solo debe llamar a `setState` del propio componente.
 */
import { useState } from 'react';

const UNSET = Symbol('unset');

export function useResetOn(trigger: unknown, reset: () => void): void {
  const [prev, setPrev] = useState<unknown>(UNSET);
  if (!Object.is(prev, trigger)) {
    setPrev(trigger);
    reset();
  }
}
