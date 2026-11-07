/**
 * Convenciones del contenido editable (páginas estancas: Institucional, La carrera, Ingreso).
 *
 * Regla 10 de AGENTS: no se inventa contenido institucional. Lo que falta confirmar con el cliente se
 * escribe en el texto con la marca `[a confirmar ...]` (por ejemplo `[a confirmar con el cliente]`),
 * igual que en la semilla (docs/specs/08). Esta marca permite que el panel avise qué falta (A14).
 */

/** Marca de dato pendiente de confirmación dentro de un texto (sin distinguir mayúsculas). */
export const PENDING_CONTENT_MARKER = /\[a confirmar\b/i;

/**
 * ¿El texto tiene algún dato marcado como pendiente de confirmación?
 *
 * @example hasPendingConfirmation('Fechas: [a confirmar con el cliente]') // true
 */
export function hasPendingConfirmation(text: string): boolean {
  return PENDING_CONTENT_MARKER.test(text);
}
