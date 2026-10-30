/**
 * Archivo · modal "Detalle del documento" (Figma 210:796, US-17).
 *
 * Muestra los metadatos y, sobre todo, DÓNDE se usa el documento (avisos, horarios y llamados que
 * lo tienen adjunto y si hoy se ven en el sitio): es lo que decide si se puede archivar sin riesgo
 * o eliminar. "Descargar copia" pide una URL firmada de corta duración.
 * "Eliminar definitivamente" solo aparece para ARCHIVADOS y deshabilita si hay referencias
 * (la API devuelve 409 igualmente: DELETE bloquea ante cualquier referencia).
 */
'use client';

import { formatDateAR, type DocumentDetailDto, type DocumentDto } from '@ifts2/shared';
import { Download, FileText } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  ErrorState,
  LoadingRegion,
  Skeleton,
  useToast,
} from '@/components/ui';
import { openDocument } from '../lib/documents';
import { errorText, formatBytes, KIND_LABELS, REF_LABELS } from '../lib/format';
import { useResource } from '../lib/use-resource';

export type DetailAction = 'delete' | 'restore' | 'archive';

export function DetailDialog({
  doc,
  onClose,
  canDelete,
  onAction,
}: {
  doc: DocumentDto | null;
  onClose: () => void;
  canDelete: boolean;
  onAction: (action: DetailAction, doc: DocumentDto) => void;
}) {
  const { toast } = useToast();
  const detail = useResource<DocumentDetailDto>(doc ? `/documents/${doc.id}` : null);
  const d = detail.data && doc && detail.data.id === doc.id ? detail.data : null;

  return (
    <Dialog
      open={!!doc}
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={
        doc?.status === 'ARCHIVED' ? 'Detalle del documento archivado' : 'Detalle del documento'
      }
      description={doc?.title}
      footer={
        doc && (
          <>
            {canDelete && doc.status === 'ARCHIVED' && (
              <Button
                variant="ghost"
                className="sm:mr-auto"
                disabled={!!d && d.references.length > 0}
                onClick={() => onAction('delete', doc)}
              >
                Eliminar definitivamente
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button
              variant="secondary"
              onClick={() => onAction(doc.status === 'ARCHIVED' ? 'restore' : 'archive', doc)}
            >
              {doc.status === 'ARCHIVED' ? 'Restaurar' : 'Archivar'}
            </Button>
            <Button
              onClick={() =>
                openDocument(doc.id).catch((e) => toast({ tone: 'error', title: errorText(e) }))
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Descargar copia
            </Button>
          </>
        )
      }
    >
      {doc && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-lg bg-base p-4">
            <FileText className="h-8 w-8 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-accent-3">{doc.filename}</p>
              <p className="text-xs text-font-strong">
                {formatBytes(doc.sizeBytes)} · cargado el {formatDateAR(doc.createdAt)}
              </p>
            </div>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Item label="Tipo" value={KIND_LABELS[doc.kind]} />
            <Item label="Categoría" value={doc.category ?? '—'} />
            <Item label="Ciclo lectivo" value={cycle(doc)} />
            <Item label="Código de resolución" value={doc.resolutionCode ?? '—'} />
            {doc.archivedAt && <Item label="Archivado el" value={formatDateAR(doc.archivedAt)} />}
            {doc.restoredAt && <Item label="Restaurado el" value={formatDateAR(doc.restoredAt)} />}
          </dl>

          <section aria-labelledby="refs-title">
            <h3 id="refs-title" className="mb-2 text-sm font-semibold text-accent-3">
              Dónde se usa
            </h3>
            {detail.status === 'loading' && !d && (
              <LoadingRegion label="Buscando usos">
                <Skeleton className="h-10" />
              </LoadingRegion>
            )}
            {detail.status === 'error' && !d && (
              <ErrorState
                title="No pudimos ver los usos"
                description={errorText(detail.error)}
                onRetry={detail.reload}
              />
            )}
            {d && d.references.length === 0 && (
              <p className="text-sm text-font-strong">
                No está adjunto a ningún aviso, horario ni llamado.
              </p>
            )}
            {d && d.references.length > 0 && (
              <ul className="flex flex-col gap-2">
                {d.references.map((r) => (
                  <li
                    key={`${r.type}-${r.id}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-accent-2 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-semibold">{REF_LABELS[r.type]}:</span> {r.label}
                    </span>
                    <Badge tone={r.visible ? 'warning' : 'neutral'}>
                      {r.visible ? 'Visible en el sitio' : 'No visible'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

export function cycle(d: Pick<DocumentDto, 'cycleYear' | 'termLabel'>): string {
  if (!d.cycleYear) return '—';
  return d.termLabel ? `${d.cycleYear} · ${d.termLabel}` : String(d.cycleYear);
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-font-strong">{label}</dt>
      <dd className="text-sm text-accent-3">{value}</dd>
    </div>
  );
}
