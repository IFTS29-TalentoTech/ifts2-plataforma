/**
 * Pantalla /panel/horarios (Figma 10-horarios, RF06, US-13..15).
 *
 * Tres bloques:
 *  1. Ciclo público vigente + selector del ciclo que se edita (+ "Cambiar ciclo público", solo ADMIN).
 *  2. Grillas de cursada por comisión (cargar, actualizar archivo, publicar/despublicar, eliminar).
 *  3. Convocatorias y mesas de examen (próximo turno oficial, crear/editar, publicar, eliminar).
 *
 * Reglas que se reflejan acá:
 * - Lo que se ve en el sitio lo decide la API al consultar (publicado + ciclo público): la pantalla
 *   solo muestra `visibleNow` para que la persona entienda qué ve el público HOY.
 * - Eliminar solo lo NO publicado (ADR-07); el botón ni aparece en lo publicado. La API igual responde 409.
 * - Todo cambio de visibilidad o eliminación pasa por el ConfirmDialog único.
 * - Los botones sin permiso no se muestran (`can`); la API igualmente responde 403.
 */
'use client';

import {
  can,
  formatDateAR,
  type ExamCallDto,
  type Page,
  type PermissionList,
  type ScheduleDto,
  type TermDto,
} from '@ifts2/shared';
import { CalendarCheck, Eye, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Eyebrow,
  LoadingRegion,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { openDocument } from '../lib/documents';
import { errorText } from '../lib/format';
import { useResource } from '../lib/use-resource';
import { ExamCallDialog } from './exam-call-dialog';
import { ScheduleDialog } from './schedule-dialog';
import { ChangePublicTermDialog, NewTermDialog } from './term-dialogs';

type Pending =
  | { type: 'schedule-toggle'; item: ScheduleDto }
  | { type: 'schedule-delete'; item: ScheduleDto }
  | { type: 'call-toggle'; item: ExamCallDto }
  | { type: 'call-delete'; item: ExamCallDto };

export function HorariosScreen({ perms }: { perms: PermissionList }) {
  const { toast } = useToast();
  const terms = useResource<Page<TermDto>>('/terms?pageSize=100');
  const [termId, setTermId] = useState<string>('');
  const [newTermOpen, setNewTermOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);

  const termList = useMemo(() => terms.data?.items ?? [], [terms.data]);
  const publicTerm = termList.find((t) => t.publicCurrent);
  // Por defecto se edita el ciclo público; si no hay, el más reciente. `termId` solo guarda la
  // elección explícita de la persona (derivar evita sincronizar estado con un efecto).
  const term = termList.find((t) => t.id === termId) ?? publicTerm ?? termList[0];

  const canSetPublic = can(perms, 'terms:setPublic');
  const canManageTerms = can(perms, 'terms:manage');

  return (
    <div>
      <PageHeader
        title="Horarios y exámenes"
        description="Administrá las grillas de cursada por comisión y los llamados a exámenes finales para los estudiantes."
        action={
          terms.status === 'ready' && (
            <div
              className="rounded-pill border border-accent-2 bg-surface px-4 py-2 text-sm shadow-card"
              data-testid="public-term"
            >
              <span className="font-semibold text-accent-3">Período público: </span>
              <span className="text-accent">{publicTerm?.label ?? 'sin definir'}</span>
            </div>
          )
        }
      />

      {terms.status === 'loading' && (
        <LoadingRegion label="Cargando horarios">
          <Skeleton className="mb-4 h-12 w-full" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
          </div>
        </LoadingRegion>
      )}
      {terms.status === 'error' && !terms.data && (
        <ErrorState onRetry={terms.reload} description={errorText(terms.error)} />
      )}

      {terms.data && (
        <>
          <Card className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end">
            <Select
              className="flex-1"
              label="Ciclo que estás editando"
              value={term?.id ?? termId}
              onValueChange={setTermId}
              options={termList.map((t) => ({
                value: t.id,
                label: t.publicCurrent ? `${t.label} (público)` : t.label,
              }))}
              placeholder="Elegí un ciclo"
            />
            <div className="flex flex-wrap gap-2">
              {canManageTerms && (
                <Button variant="secondary" onClick={() => setNewTermOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nuevo ciclo
                </Button>
              )}
              {canSetPublic && (
                <Button variant="secondary" onClick={() => setChangeOpen(true)}>
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  Cambiar ciclo lectivo público
                </Button>
              )}
            </div>
          </Card>

          {!term ? (
            <EmptyState
              title="Todavía no hay ciclos lectivos"
              description="Creá el primer ciclo para cargar horarios y llamados a examen."
              action={
                canManageTerms && <Button onClick={() => setNewTermOpen(true)}>Nuevo ciclo</Button>
              }
            />
          ) : (
            <>
              {!term.publicCurrent && (
                <p
                  role="status"
                  className="mb-6 rounded-md border border-warning-strong bg-warning-back px-4 py-2 text-sm font-medium text-warning-strong"
                >
                  Este ciclo no es el público: lo que cargues acá no se ve en el sitio hasta que sea
                  el ciclo público vigente.
                </p>
              )}
              {can(perms, 'schedules:manage') && (
                <SchedulesSection perms={perms} term={term} onChange={terms.reload} />
              )}
              {can(perms, 'examCalls:manage') && (
                <ExamCallsSection perms={perms} term={term} onChange={terms.reload} />
              )}
            </>
          )}
        </>
      )}

      <p className="mt-8 rounded-lg border border-accent-2 bg-surface px-4 py-3 text-sm text-font-strong">
        Las modificaciones en fechas de examen impactan en tiempo real en las notificaciones del
        portal de estudiantes.
      </p>

      <NewTermDialog
        open={newTermOpen}
        onOpenChange={setNewTermOpen}
        onCreated={(t) => {
          setTermId(t.id);
          terms.reload();
          toast({ tone: 'success', title: `Ciclo ${t.label} creado.` });
        }}
      />
      <ChangePublicTermDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        terms={termList}
        current={publicTerm}
        onChanged={(t) => {
          setTermId(t.id);
          terms.reload();
          toast({
            tone: 'success',
            title: `Ahora el sitio muestra ${t.label}.`,
            description: 'El ciclo anterior quedó guardado en el Archivo.',
          });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip de archivo
// ---------------------------------------------------------------------------

function FileChip({ doc }: { doc: { id: string; filename: string } | null }) {
  const { toast } = useToast();
  if (!doc) {
    return (
      <p className="rounded-md border border-dashed border-primary px-3 py-2 text-sm text-font-strong">
        Sin archivo cargado
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() =>
        openDocument(doc.id).catch((e) => toast({ tone: 'error', title: errorText(e) }))
      }
      className="flex w-full items-center gap-2 rounded-md border border-accent-2 bg-base px-3 py-2 text-left text-sm text-accent-3 hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus"
      aria-label={`Abrir ${doc.filename}`}
    >
      <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <span className="truncate">{doc.filename}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Grillas por comisión
// ---------------------------------------------------------------------------

function SchedulesSection({
  perms,
  term,
  onChange,
}: {
  perms: PermissionList;
  term: TermDto;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const list = useResource<Page<ScheduleDto>>(`/schedules?termId=${term.id}&pageSize=100`);
  const [editing, setEditing] = useState<ScheduleDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const canManage = can(perms, 'schedules:manage');
  const canDelete = can(perms, 'schedules:delete');

  function refresh() {
    list.reload();
    onChange();
  }

  return (
    <section aria-labelledby="h-grillas" className="mb-10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="h-grillas" className="font-display text-xl font-bold text-accent-3">
            1. Grillas de cursada por comisión
          </h2>
          <p className="text-sm text-font-strong">
            Distribución horaria oficial por comisión del ciclo {term.label}.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Cargar nueva grilla
          </Button>
        )}
      </div>

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando grillas">
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          title="Este ciclo todavía no tiene horarios"
          description="Cargá la grilla de cada comisión para que los estudiantes la vean en el sitio."
        />
      )}
      {list.data && list.data.items.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data.items.map((s) => (
            <li key={s.id}>
              <Card accentBar className="flex h-full flex-col gap-3" data-testid="schedule-card">
                <div className="flex items-start justify-between gap-2">
                  <Eyebrow>{s.commissionName}</Eyebrow>
                  <Badge tone={s.published ? 'success' : 'neutral'}>
                    {s.published ? 'Publicado' : 'Sin publicar'}
                  </Badge>
                </div>
                <h3 className="font-display text-lg font-bold text-accent-3">{s.commissionName}</h3>
                {s.notes && <p className="text-sm text-font-strong">{s.notes}</p>}
                {s.published && !s.visibleNow && (
                  <p className="text-xs text-warning-strong">
                    Publicado, pero no se ve hoy porque su ciclo no es el público.
                  </p>
                )}
                <FileChip doc={s.document} />
                <p className="text-xs text-font-strong">
                  Actualizado el {formatDateAR(s.updatedAt)}
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  {canManage && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(s);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Actualizar archivo / comisión
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPending({ type: 'schedule-toggle', item: s })}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        {s.published ? 'Despublicar' : 'Publicar'}
                      </Button>
                    </>
                  )}
                  {canDelete && !s.published && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPending({ type: 'schedule-delete', item: s })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Eliminar
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        term={term}
        schedule={editing}
        onSaved={(m) => {
          toast({ tone: 'success', title: m });
          refresh();
        }}
      />
      <PendingDialogs
        pending={pending}
        onClose={() => setPending(null)}
        onDone={(m) => {
          toast({ tone: 'success', title: m });
          refresh();
        }}
        only="schedule"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Llamados a examen
// ---------------------------------------------------------------------------

function ExamCallsSection({
  perms,
  term,
  onChange,
}: {
  perms: PermissionList;
  term: TermDto;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const list = useResource<Page<ExamCallDto>>(`/exam-calls?termId=${term.id}&pageSize=100`);
  const [editing, setEditing] = useState<ExamCallDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const canManage = can(perms, 'examCalls:manage');
  const canDelete = can(perms, 'examCalls:delete');

  // "Próximo turno oficial": el primer llamado publicado que todavía no terminó (por fecha de inicio).
  const items = useMemo(
    () => [...(list.data?.items ?? [])].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    [list.data],
  );
  const nextId = items.find((c) => c.published && new Date(c.endsOn) >= new Date())?.id;

  function refresh() {
    list.reload();
    onChange();
  }

  return (
    <section aria-labelledby="h-llamados">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="h-llamados" className="font-display text-xl font-bold text-accent-3">
            2. Convocatorias y mesas de examen
          </h2>
          <p className="text-sm text-font-strong">
            Fechas de inscripción por SIU Guaraní y cronograma de tribunales evaluadores.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Configurar nuevo llamado
          </Button>
        )}
      </div>

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando llamados">
          <Skeleton className="h-40" />
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}
      {list.data && items.length === 0 && (
        <EmptyState
          title="Este ciclo no tiene llamados a examen"
          description="Configurá un llamado con sus fechas de inscripción y el cronograma en PDF."
        />
      )}
      <ul className="flex flex-col gap-4">
        {items.map((c) => (
          <li key={c.id}>
            <Card accentBar data-testid="exam-call-card" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {c.id === nextId && <Badge tone="warning">Próximo turno oficial</Badge>}
                {c.highlighted && <Badge tone="success">Destacado en el Inicio</Badge>}
                <Badge tone={c.published ? 'success' : 'neutral'}>
                  {c.published ? 'Publicado' : 'Sin publicar'}
                </Badge>
                <Badge tone={c.enrollmentOpen ? 'success' : 'neutral'}>
                  {c.enrollmentOpen ? 'Inscripción abierta' : 'Inscripción cerrada'}
                </Badge>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-accent-3">{c.name}</h3>
                  <p className="text-sm text-font-strong">
                    Del {formatDateAR(c.startsOn)} al {formatDateAR(c.endsOn)}.
                  </p>
                  {c.notes && <p className="mt-1 text-sm text-font-strong">{c.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManage && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(c);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Editar llamado a examen
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPending({ type: 'call-toggle', item: c })}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        {c.published ? 'Despublicar' : 'Publicar'}
                      </Button>
                    </>
                  )}
                  {canDelete && !c.published && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPending({ type: 'call-delete', item: c })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
              <div className="border-t border-accent-2 pt-3">
                <FileChip doc={c.document} />
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <ExamCallDialog
        canUploadDocument={can(perms, 'documents:manage')}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        term={term}
        call={editing}
        onSaved={(m) => {
          toast({ tone: 'success', title: m });
          refresh();
        }}
      />
      <PendingDialogs
        pending={pending}
        onClose={() => setPending(null)}
        onDone={(m) => {
          toast({ tone: 'success', title: m });
          refresh();
        }}
        only="call"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Confirmaciones (publicar, despublicar, eliminar) — siempre el ConfirmDialog único
// ---------------------------------------------------------------------------

function PendingDialogs({
  pending,
  onClose,
  onDone,
  only,
}: {
  pending: Pending | null;
  onClose: () => void;
  onDone: (message: string) => void;
  only: 'schedule' | 'call';
}) {
  const active = pending && pending.type.startsWith(only) ? pending : null;
  // Mantiene el último contenido mientras el diálogo se cierra (evita parpadeo de texto).
  const [last, setLast] = useState<Pending | null>(null);
  if (active && active !== last) setLast(active);
  const p = active ?? last;
  if (!p) return null;

  const isSchedule = p.type.startsWith('schedule');
  const base = isSchedule ? '/schedules' : '/exam-calls';
  const name = isSchedule ? (p.item as ScheduleDto).commissionName : (p.item as ExamCallDto).name;
  const published = p.item.published;
  const noun = isSchedule ? 'horario' : 'llamado';

  if (p.type.endsWith('delete')) {
    return (
      <ConfirmDialog
        open={!!active}
        onOpenChange={(o) => !o && onClose()}
        tone="danger"
        title={`¿Eliminar este ${noun}?`}
        description="Se elimina definitivamente. Esta acción no se puede deshacer."
        details={<strong>{name}</strong>}
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.delete(`${base}/${p.item.id}`);
          onDone(`${isSchedule ? 'Horario' : 'Llamado'} eliminado.`);
        }}
      />
    );
  }
  return (
    <ConfirmDialog
      open={!!active}
      onOpenChange={(o) => !o && onClose()}
      title={published ? `¿Despublicar este ${noun}?` : `¿Publicar este ${noun}?`}
      description={
        published
          ? 'Deja de mostrarse en el sitio. Podés volver a publicarlo cuando quieras.'
          : 'Va a mostrarse en el sitio para los estudiantes si su ciclo es el público vigente.'
      }
      details={<strong>{name}</strong>}
      confirmLabel={published ? 'Despublicar' : 'Publicar'}
      onConfirm={async () => {
        await api.post(`${base}/${p.item.id}/${published ? 'unpublish' : 'publish'}`);
        onDone(published ? 'Se despublicó.' : 'Publicado en el sitio.');
      }}
    />
  );
}
