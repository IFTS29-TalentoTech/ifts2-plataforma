/**
 * Mensajes humanos para los errores de la API (español rioplatense, sin códigos técnicos).
 * Regla de docs/specs/05-ui-y-pantallas.md: "mensaje en lenguaje claro, sin códigos técnicos, con Reintentar".
 *
 * Interpretación por código (04-api.md, "Códigos de estado"):
 *  401 sesión vencida -> vuelve al login · 403 sin permiso · 409 conflicto de estado (se muestra el motivo
 *  que manda la API) · 413/415 archivo · 422 regla de negocio (motivo de la API) · 429 demasiados pedidos ·
 *  502 falla de una integración externa (el resto del panel sigue andando).
 */
import { ApiError } from '@/lib/api';

export function humanError(
  e: unknown,
  fallback = 'No pudimos completar la acción. Intentá de nuevo.',
): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.outcome === 'unknown') return e.userMessage;
  switch (e.status) {
    case 0:
      return e.userMessage;
    case 401:
      return 'Tu sesión venció. Volvé a ingresar para continuar.';
    case 403:
      return 'Tu rol no tiene permiso para hacer esto.';
    case 413:
      return 'El archivo es demasiado grande (PDF hasta 10 MB, imágenes hasta 5 MB).';
    case 415:
      return 'Ese tipo de archivo no está permitido. Subí un PDF, JPG, PNG o WebP.';
    case 429:
      return 'Hiciste demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.';
    case 502:
      return typeof e.problem.detail === 'string' && e.problem.detail.length > 0
        ? e.problem.detail
        : 'Un servicio externo no respondió. El resto del panel sigue funcionando; podés reintentar más tarde.';
    default:
      // 400/404/409/422: la API manda el motivo en español; es lo más útil para quien opera.
      return e.status >= 500 ? e.userMessage : e.message || fallback;
  }
}

/** Errores por campo (400/422) listos para los inputs: `errs.title`. Devuelve el primero de cada uno. */
export function fieldMessages(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(e instanceof ApiError)) return out;
  for (const [k, v] of Object.entries(e.fieldErrors)) {
    const first = v?.[0];
    if (first) out[k] = first;
  }
  return out;
}

/**
 * 401 en una pantalla del panel = la sesión venció: se lleva al login avisando el motivo.
 * Devuelve true si redirigió (el llamador no debe mostrar nada más).
 */
export function handleSessionExpired(e: unknown): boolean {
  if (e instanceof ApiError && e.status === 401 && typeof window !== 'undefined') {
    // Navegación completa a propósito: descarta el estado de la página (datos de una sesión ya inválida).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/panel/login?expired=1');
    return true;
  }
  return false;
}
