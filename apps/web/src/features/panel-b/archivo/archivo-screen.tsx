/**
 * Pantalla /panel/archivo (Figma 11-archivo, RF03, US-16..18 y US-33).
 *
 * Repositorio documental: nada se pierde. Reglas:
 * - Buscar por título, código de resolución o año (`q`), filtrar por Tipo y Ciclo; paginado.
 * - Por defecto se ve lo ARCHIVADO (la "documentación histórica" del Figma); el filtro Estado
 *   permite ver también lo vigente para poder archivarlo.
 * - Restaurar y Archivar piden confirmación. Archivar un documento adjunto a contenido que hoy se
 *   ve en el sitio devuelve 409 `requiresConfirmation`: se explica qué se ve y, si la persona
 *   acepta, se reintenta con `{ force: true }` (el contenido visible sigue funcionando).
 * - Eliminar: solo archivados y sin referencias (RF03; la API devuelve 409 con la lista).
 * - Móvil: tarjetas en lugar de tabla (Figma mobile-archivo).
 */
'use client';

import { can, formatDateAR, type DocumentDto, type Page, type PermissionList } from '@ifts2/shared';
import { ArchiveRestore, Archive, FileText, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingRegion,
  Pagination,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import {
  errorText,
  formatBytes,
  KIND_LABELS,
  KIND_OPTIONS,
  problemReferences,
  REF_LABELS,
  requiresConfirmation,
  type ProblemReference,
} from '../lib/format';
import { useResource } from '../lib/use-resource';
import { cycle, DetailDialog, type DetailAction } from './detail-dialog';
import { UploadDialog } from './upload-dialog';

const PAGE_SIZE = 10;
const ALL = 'ALL';

type Action =
  | { type: 'restore' | 'archive' | 'delete'; doc: DocumentDto }
  | { type: 'force-archive'; doc: DocumentDto; refs: ProblemReference[] };

export function ArchivoScreen({ perms }: { perms: PermissionList }) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [status, setStatus] = useState<'ARCHIVED' | 'ACTIVE' | typeof ALL>('ARCHIVED');
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detail, setDetail] = useState<DocumentDto | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const canManage = can(perms, 'documents:manage');
  const canDelete = can(perms, 'documents:delete');

  // Búsqueda con retardo (no pedimos a la API en cada tecla) y de vuelta a la página 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const path = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) p.set('q', q);
    if (kind !== ALL) p.set('kind', kind);
    if (year !== ALL) p.set('cycleYear', year);
    if (status !== ALL) p.set('status', status);
    return `/documents?${p}`;
  }, [page, q, kind, year, status]);
  const list = useResource<Page<DocumentDto>>(path);

  const thisYear = new Date().getFullYear();
  const yearOptions = [
    { value: ALL, label: 'Todos los ciclos' },
    ...Array.from({ length: 10 }, (_, i) => String(thisYear + 1 - i)).map((y) => ({
      value: y,
      label: `Año ${y}`,
    })),
  ];

  function onDetailAction(a: DetailAction, doc: DocumentDto) {
    setDetail(null);
    setAction({ type: a, doc });
  }

  const hasFilters = !!q || kind !== ALL || year !== ALL || status !== 'ARCHIVED';

  return (
    <div>
      <PageHeader
        title="Archivo y documentación histórica"
        description="Consultá, descargá o restaurá cronogramas, planes curriculares y actas de ciclos lectivos anteriores."
        action={
          canManage && (
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Archivar nuevo documento
            </Button>
          )
        }
      />

      <Card className="mb-6">
        <form
          role="search"
          aria-label="Buscar documentos"
          className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr]"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
            setPage(1);
          }}
        >
          <div className="relative">
            <Input
              label="Buscar"
              type="search"
              placeholder="Título, código de resolución o año"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="[&_input]:pl-9"
            />
            <Search
              className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-font-strong"
              aria-hidden="true"
            />
          </div>
          <Select
            label="Tipo"
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              setPage(1);
            }}
            options={[{ value: ALL, label: 'Todos los tipos' }, ...KIND_OPTIONS]}
          />
          <Select
            label="Ciclo"
            value={year}
            onValueChange={(v) => {
              setYear(v);
              setPage(1);
            }}
            options={yearOptions}
          />
          <Select
            label="Estado"
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setPage(1);
            }}
            options={[
              { value: 'ARCHIVED', label: 'Archivados' },
              { value: 'ACTIVE', label: 'Vigentes' },
              { value: ALL, label: 'Todos' },
            ]}
          />
        </form>
      </Card>

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando documentos">
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          title={
            hasFilters ? 'No encontramos documentos con esa búsqueda' : 'El archivo está vacío'
          }
          description={
            hasFilters
              ? 'Probá con otro título, otro año o quitá los filtros.'
              : 'Cuando archives un documento va a aparecer acá.'
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setQ('');
                  setKind(ALL);
                  setYear(ALL);
                  setStatus('ARCHIVED');
                }}
              >
                Quitar filtros
              </Button>
            ) : (
              canManage && <Button onClick={() => setUploadOpen(true)}>Archivar documento</Button>
            )
          }
        />
      )}

      {list.data && list.data.items.length > 0 && (
        <div className={list.refreshing ? 'opacity-70 transition-opacity' : undefined}>
          {/* Escritorio: tabla */}
          <div className="hidden md:block">
            <Table caption="Documentos del archivo">
              <THead>
                <tr>
                  <TH>Documento / Título</TH>
                  <TH>Categoría</TH>
                  <TH>Ciclo lectivo</TH>
                  <TH>Fecha de archivo</TH>
                  <TH>Peso</TH>
                  <TH className="text-right">Acciones</TH>
                </tr>
              </THead>
              <TBody>
                {list.data.items.map((d) => (
                  <TR key={d.id} data-testid="doc-row">
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-2">
                          <FileText className="h-4 w-4 text-accent" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{d.filename}</p>
                          <p className="truncate text-xs text-font-strong">{d.title}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge>{d.category ?? KIND_LABELS[d.kind]}</Badge>
                    </TD>
                    <TD>{cycle(d)}</TD>
                    <TD>
                      {d.archivedAt ? (
                        formatDateAR(d.archivedAt)
                      ) : (
                        <Badge tone="success">Vigente</Badge>
                      )}
                    </TD>
                    <TD>{formatBytes(d.sizeBytes)}</TD>
                    <TD>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDetail(d)}
                          aria-label={`Ver detalle de ${d.title}`}
                        >
                          Ver detalle
                        </Button>
                        {canManage && <StateButton doc={d} onAction={setAction} />}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          {/* Móvil: tarjetas (Figma mobile-archivo) */}
          <ul className="flex flex-col gap-3 md:hidden">
            {list.data.items.map((d) => (
              <li key={d.id}>
                <Card data-testid="doc-card" className="flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-2">
                      <FileText className="h-4 w-4 text-accent" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-accent-3">{d.filename}</p>
                      <p className="text-xs text-font-strong">{d.title}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-font-strong">
                    <Badge>{d.category ?? KIND_LABELS[d.kind]}</Badge>
                    <span>{cycle(d)}</span>
                    <span>· {formatBytes(d.sizeBytes)}</span>
                    {d.archivedAt && <span>· archivado {formatDateAR(d.archivedAt)}</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setDetail(d)}
                      aria-label={`Ver detalle de ${d.title}`}
                    >
                      Ver detalle
                    </Button>
                    {canManage && <StateButton doc={d} onAction={setAction} className="flex-1" />}
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      <p className="mt-8 rounded-lg border border-accent-2 bg-surface px-4 py-3 text-sm text-font-strong">
        Los documentos archivados no son accesibles para los estudiantes salvo que un administrador
        los restaure expresamente a la cartelera pública.
      </p>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSaved={(_doc, archived) => {
          toast({
            tone: 'success',
            title: archived ? 'Documento archivado.' : 'Documento guardado como vigente.',
          });
          list.reload();
        }}
      />
      <DetailDialog
        doc={detail}
        onClose={() => setDetail(null)}
        canDelete={canDelete}
        onAction={onDetailAction}
      />
      <ActionDialogs
        action={action}
        setAction={setAction}
        onDone={(m) => {
          toast({ tone: 'success', title: m });
          list.reload();
        }}
      />
    </div>
  );
}

function StateButton({
  doc,
  onAction,
  className,
}: {
  doc: DocumentDto;
  onAction: (a: Action) => void;
  className?: string;
}) {
  const archived = doc.status === 'ARCHIVED';
  const Icon = archived ? ArchiveRestore : Archive;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => onAction({ type: archived ? 'restore' : 'archive', doc })}
      aria-label={`${archived ? 'Restaurar' : 'Archivar'} ${doc.title}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {archived ? 'Restaurar' : 'Archivar'}
    </Button>
  );
}

/** Confirmaciones de restaurar, archivar (con el paso extra `force`) y eliminar. */
function ActionDialogs({
  action,
  setAction,
  onDone,
}: {
  action: Action | null;
  setAction: Dispatch<SetStateAction<Action | null>>;
  onDone: (message: string) => void;
}) {
  const [last, setLast] = useState<Action | null>(null);
  if (action && action !== last) setLast(action);
  const a = action ?? last;
  if (!a) return null;
  const open = !!action;
  // Solo cierra si la acción sigue siendo la misma: el paso `archive` -> `force-archive` reemplaza
  // la acción y el cierre automático del primer diálogo no debe pisarla.
  const close = (o: boolean) => !o && setAction((cur) => (cur && cur.type === a.type ? null : cur));
  const title = a.doc.title;

  if (a.type === 'restore') {
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title="¿Restaurar este documento?"
        description="Vuelve a estar vigente y se puede adjuntar a avisos, horarios y llamados. No se muestra en el sitio por sí solo."
        details={<strong>{title}</strong>}
        confirmLabel="Restaurar"
        onConfirm={async () => {
          await api.post(`/documents/${a.doc.id}/restore`);
          onDone('Documento restaurado.');
        }}
      />
    );
  }

  if (a.type === 'archive') {
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title="¿Archivar este documento?"
        description="Sale de los documentos vigentes y pasa al archivo histórico. Podés restaurarlo cuando quieras."
        details={<strong>{title}</strong>}
        confirmLabel="Archivar"
        onConfirm={async () => {
          try {
            await api.post(`/documents/${a.doc.id}/archive`, {});
            onDone('Documento archivado.');
          } catch (e) {
            if (requiresConfirmation(e)) {
              // 409: está adjunto a contenido visible. Se pide una segunda confirmación explícita.
              setAction({ type: 'force-archive', doc: a.doc, refs: problemReferences(e) });
              return;
            }
            throw e;
          }
        }}
      />
    );
  }

  if (a.type === 'force-archive') {
    const visible = a.refs.filter((r) => r.visible);
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        tone="danger"
        title="Este documento se está usando en el sitio"
        description="Si lo archivás, el contenido que lo tiene adjunto sigue mostrándolo, pero el documento sale de lo vigente."
        details={
          <ul className="list-disc pl-5">
            {(visible.length ? visible : a.refs).map((r) => (
              <li key={`${r.type}-${r.id}`}>
                {REF_LABELS[r.type]}: {r.label}
              </li>
            ))}
          </ul>
        }
        confirmLabel="Archivar de todos modos"
        onConfirm={async () => {
          await api.post(`/documents/${a.doc.id}/archive`, { force: true });
          onDone('Documento archivado.');
        }}
      />
    );
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={close}
      tone="danger"
      title="¿Eliminar definitivamente?"
      description="Se borra el documento y su archivo. Esta acción no se puede deshacer."
      details={<strong>{title}</strong>}
      confirmLabel="Eliminar definitivamente"
      onConfirm={async () => {
        try {
          await api.delete(`/documents/${a.doc.id}`);
          onDone('Documento eliminado.');
        } catch (e) {
          // 409: lo usan avisos, horarios o llamados. Se explica cuáles para poder resolverlo.
          const refs = problemReferences(e);
          if (e instanceof ApiError && refs.length) {
            throw new ApiError(
              {
                ...e.problem,
                detail: `${e.message} Lo usan: ${refs.map((r) => `${REF_LABELS[r.type]} "${r.label}"`).join('; ')}.`,
              },
              e.status,
            );
          }
          throw e;
        }
      }}
    />
  );
}
