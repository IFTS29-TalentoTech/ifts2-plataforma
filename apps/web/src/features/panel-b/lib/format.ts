/**
 * Panel B · utilidades de formato y de errores compartidas por Horarios, Archivo y Configuración.
 */
import { DOCUMENT_KINDS, type DocumentKind } from '@ifts2/shared';
import { ApiError } from '@/lib/api';

export const KIND_LABELS: Record<DocumentKind, string> = {
  SCHEDULE: 'Horarios de cursada',
  EXAM_CALENDAR: 'Calendario de exámenes',
  RESOLUTION: 'Resolución',
  PLAN: 'Plan de estudios',
  NOTICE_ATTACHMENT: 'Adjunto de aviso',
  OTHER: 'Otro',
};

export const KIND_OPTIONS = DOCUMENT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }));

/** "2,1 MB", "840 KB": el peso que se muestra en el Archivo (Figma). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Mensaje humano para cualquier error (sin códigos técnicos). */
export function errorText(
  e: unknown,
  fallback = 'No pudimos completar la acción. Intentá de nuevo.',
): string {
  return e instanceof ApiError ? e.userMessage : fallback;
}

/** Errores por campo de la API (`errors`) o {} si no los hay. */
export function fieldErrors(e: unknown): Record<string, string[]> {
  return e instanceof ApiError ? e.fieldErrors : {};
}

/** true si el 409 pide confirmación explícita (archivar algo adjunto a contenido visible). */
export function requiresConfirmation(e: unknown): boolean {
  return e instanceof ApiError && e.problem.requiresConfirmation === true;
}

export interface ProblemReference {
  type: 'notice' | 'schedule' | 'examCall';
  id: string;
  label: string;
  visible: boolean;
}

/** Referencias que devuelve el 409 de archivar o eliminar un documento. */
export function problemReferences(e: unknown): ProblemReference[] {
  if (!(e instanceof ApiError)) return [];
  const refs = e.problem.references;
  return Array.isArray(refs) ? (refs as ProblemReference[]) : [];
}

export const REF_LABELS = {
  notice: 'Aviso',
  schedule: 'Horario',
  examCall: 'Llamado a examen',
} as const;
