/**
 * Panel B · subida de documentos (POST /documents, multipart) y descarga por URL firmada.
 *
 * El archivo nunca se sirve desde una URL estable: cada descarga pide una URL firmada de corta
 * duración (`GET /documents/:id/file`), así un enlace copiado deja de funcionar solo (RNF07).
 */
import type { DocumentDto, DocumentFileDto, DocumentKind } from '@ifts2/shared';
import { api } from '@/lib/api';

export interface UploadMeta {
  title: string;
  kind: DocumentKind;
  category?: string;
  cycleYear?: number | null;
  termLabel?: string;
  resolutionCode?: string;
}

/** Sube el archivo con sus metadatos y devuelve el documento creado (201). */
export function uploadDocument(file: File, meta: UploadMeta): Promise<DocumentDto> {
  const form = new FormData();
  form.set('title', meta.title);
  form.set('kind', meta.kind);
  if (meta.category) form.set('category', meta.category);
  if (meta.cycleYear) form.set('cycleYear', String(meta.cycleYear));
  if (meta.termLabel) form.set('termLabel', meta.termLabel);
  if (meta.resolutionCode) form.set('resolutionCode', meta.resolutionCode);
  // El archivo va al final: algunos parsers multipart leen los campos de texto primero.
  form.set('file', file);
  return api.post<DocumentDto>('/documents', form);
}

/** Pide la URL firmada y abre el archivo en una pestaña nueva. */
export async function openDocument(id: string): Promise<void> {
  const f = await api.get<DocumentFileDto>(`/documents/${id}/file`, { cache: 'no-store' });
  window.open(f.url, '_blank', 'noopener,noreferrer');
}
