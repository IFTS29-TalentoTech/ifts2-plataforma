import { ApiError } from '@/lib/api';
import { handleSessionExpired, humanError } from './errors';

/**
 * Prepara un error para mostrarlo DENTRO de un <ConfirmDialog>: el diálogo muestra `ApiError.userMessage`,
 * que para 5xx es genérico ("Algo salió mal de nuestro lado"). En el panel conviene el mensaje específico
 * (por ejemplo el 502 "No pudimos copiar la imagen..." o el 409 "ya está vigente"), así que se re-empaqueta
 * como un ApiError de estado < 500 cuyo texto es `humanError(e)`. Un 401 lleva al login.
 */
export function toDisplayError(e: unknown): ApiError {
  handleSessionExpired(e);
  const message = humanError(e);
  return new ApiError({ title: message, detail: message, status: 409 }, 409);
}
