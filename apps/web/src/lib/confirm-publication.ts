import { dateTime } from '@ifts2/shared';
import { api, ApiError } from './api';
import { publicationResponse } from './mutation-contracts';

type Action = 'publish' | 'pause' | 'schedule' | 'reactivate';
const expected = {
  publish: 'PUBLISHED',
  pause: 'PAUSED',
  schedule: 'SCHEDULED',
  reactivate: 'PUBLISHED',
};

/** Una respuesta perdida no autoriza repetir el POST. Consultamos el estado sin caché;
 * si no se puede confirmar identidad, estado y vigencia, conservamos la incertidumbre original.
 */
export async function confirmPublication(
  id: string,
  action: Action,
  body?: {
    visibleFrom?: string | null;
    visibleUntil?: string | null;
  },
) {
  const confirmed = (value: unknown) => {
    const parsed = publicationResponse.safeParse(value);
    if (!parsed.success) return false;
    const data = parsed.data;
    const sameDate = (
      actual: string | null,
      requested: string | null | undefined,
      edge: 'start' | 'end',
    ) => {
      if (requested === undefined) return true;
      const parsed = dateTime('Fecha', edge).nullable().safeParse(requested);
      if (!parsed.success) return false;
      return parsed.data === null
        ? actual === null
        : actual !== null && new Date(actual).getTime() === parsed.data.getTime();
    };
    return (
      data.id === id &&
      data.status === expected[action] &&
      sameDate(data.visibleFrom, body?.visibleFrom, 'start') &&
      sameDate(data.visibleUntil, body?.visibleUntil, 'end')
    );
  };
  try {
    if (!confirmed(await api.post(`/publications/${id}/${action}`, body))) {
      throw new ApiError({ title: 'No pudimos confirmar el resultado.' }, 0, 'unknown');
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.outcome !== 'unknown') throw error;
    try {
      if (confirmed(await api.get(`/publications/${id}`, { cache: 'no-store' }))) return;
    } catch {
      // No reemplazar el resultado desconocido del POST por el error de la consulta de recuperación.
    }
    throw error;
  }
}
