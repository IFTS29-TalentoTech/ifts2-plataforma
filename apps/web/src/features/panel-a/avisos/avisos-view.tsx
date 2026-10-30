'use client';

/**
 * /panel/avisos (RF03, RF06, US-11, US-33, US-36; Figma 09-avisos-academicos).
 * Endpoints: GET /notices?status=ALL&audience=&pageSize=100, POST/PATCH /notices, POST /notices/:id/{pause,resume},
 * DELETE /notices/:id, GET /documents/:id/file (descarga del adjunto con URL firmada).
 *
 * Reglas de la spec:
 *  - Estado calculado `viewStatus` (ACTIVE / PAUSED / EXPIRED): lo vencido NO se elimina solo; se reactiva con
 *    una nueva fecha de fin o se elimina a mano (RF03, Gherkin "Vigencia y archivo").
 *  - Pausar saca el aviso del sitio sin perderlo (ConfirmDialog "Confirmación pausa").
 *  - Eliminar: solo pausados o vencidos, con confirmación; vigente -> 409 y se muestra el motivo. Permiso
 *    `notices:delete` (ADMIN y BEDELIA).
 *  - Los conteos y el filtro de Estado se calculan sobre `status=ALL` (hasta 100 avisos; es una cartelera,
 *    no un archivo). Si hubiera más, se avisa. Q82.
 */
import { Paperclip, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingRegion,
  Pagination,
  Select,
  Skeleton,
  useConfirm,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateAR } from '@/lib/dates';
import {
  can,
  type DocumentFileDto,
  type NoticeDto,
  type NoticeViewStatusDto,
  type Role,
} from '@ifts2/shared';
import { orNull } from '../lib/dates';
import { toDisplayError } from '../lib/display-error';
import { fieldMessages, handleSessionExpired, humanError } from '../lib/errors';
import type { Page } from '../lib/types';
import { useResource } from '../lib/use-resource';
import { AUDIENCE_LABELS, NoticeFormDialog } from './notice-form-dialog';
import { useRouter } from 'next/navigation';

const PAGE_SIZE = 10;
const AUDIENCE_FILTER = [
  { value: 'ALL_AUDIENCES', label: 'Toda la comunidad y específicos' },
  ...Object.entries(AUDIENCE_LABELS).map(([value, label]) => ({ value, label })),
];

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function stateBadge(n: NoticeDto) {
  if (n.viewStatus === 'PAUSED') return <Badge tone="warning">Pausado</Badge>;
  if (n.viewStatus === 'EXPIRED') return <Badge tone="danger">Vencido</Badge>;
  if (!n.visibleNow) return <Badge tone="neutral">Programado</Badge>;
  return <Badge tone="success">En línea</Badge>;
}

function vigenciaText(n: NoticeDto): string {
  return n.visibleUntil
    ? `Vigente hasta el ${formatDateAR(n.visibleUntil)}`
    : `Desde el ${formatDateAR(n.visibleFrom)} · sin fecha de fin`;
}

export function AvisosView({ role }: { role: Role }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [status, setStatus] = useState<'ALL' | NoticeViewStatusDto>('ALL');
  const [audience, setAudience] = useState('ALL_AUDIENCES');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; notice: NoticeDto | null }>({
    open: false,
    notice: null,
  });
  const [resuming, setResuming] = useState<NoticeDto | null>(null);

  const query = `status=ALL&pageSize=100${audience === 'ALL_AUDIENCES' ? '' : `&audience=${audience}`}`;
  const { data, error, loading, reload } = useResource(`notices:${query}`, () =>
    api.get<Page<NoticeDto>>(`/notices?${query}`),
  );
  const changed = () => {
    reload();
    router.refresh(); // contador "Avisos académicos" del menú
  };

  const all = data?.items ?? [];
  const count = (s: NoticeViewStatusDto) => all.filter((n) => n.viewStatus === s).length;
  const filtered = status === 'ALL' ? all : all.filter((n) => n.viewStatus === status);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusOptions = [
    { value: 'ALL', label: `Todos (${all.length})` },
    { value: 'ACTIVE', label: `Activos (${count('ACTIVE')})` },
    { value: 'PAUSED', label: `Pausados (${count('PAUSED')})` },
    { value: 'EXPIRED', label: `Vencidos (${count('EXPIRED')})` },
  ];

  function reportError(title: string, e: unknown) {
    if (!handleSessionExpired(e))
      toast({ title, description: toDisplayError(e).message, tone: 'error' });
  }

  async function pause(n: NoticeDto) {
    const ok = await confirm({
      title: '¿Pausar el aviso?',
      description:
        'Deja de mostrarse en el sitio, pero no se pierde: podés reanudarlo cuando quieras.',
      details: <strong>{n.title}</strong>,
      confirmLabel: 'Sí, pausar',
    });
    if (!ok) return;
    try {
      await api.post(`/notices/${n.id}/pause`);
      toast({ title: 'Aviso pausado', tone: 'success' });
    } catch (e) {
      reportError('No se pudo pausar el aviso', e);
    }
    changed();
  }

  async function resume(n: NoticeDto) {
    // Si ya pasó su fecha de fin hace falta una nueva (la API devuelve 422 sin ella): se pide en un diálogo.
    if (n.visibleUntil && new Date(n.visibleUntil).getTime() <= Date.now()) {
      setResuming(n);
      return;
    }
    const ok = await confirm({
      title: '¿Reanudar el aviso?',
      description: 'Vuelve a mostrarse en el sitio.',
      details: <strong>{n.title}</strong>,
      confirmLabel: 'Sí, reanudar',
    });
    if (!ok) return;
    try {
      await api.post(`/notices/${n.id}/resume`, {});
      toast({ title: 'Aviso reanudado', tone: 'success' });
    } catch (e) {
      reportError('No se pudo reanudar el aviso', e);
    }
    changed();
  }

  async function remove(n: NoticeDto) {
    const ok = await confirm({
      title: '¿Eliminar el aviso?',
      description:
        'Se elimina definitivamente y queda registrado quién y cuándo. El archivo adjunto se conserva en el Archivo. No se puede deshacer.',
      details: <strong>{n.title}</strong>,
      tone: 'danger',
      confirmLabel: 'Sí, eliminar',
    });
    if (!ok) return;
    try {
      await api.delete(`/notices/${n.id}`);
      toast({ title: 'Aviso eliminado', tone: 'success' });
    } catch (e) {
      reportError('No se pudo eliminar', e); // 409: está vigente o programado
    }
    changed();
  }

  async function openAttachment(n: NoticeDto) {
    if (!n.attachment) return;
    try {
      const f = await api.get<DocumentFileDto>(`/documents/${n.attachment.id}/file`);
      window.open(f.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      reportError('No se pudo abrir el adjunto', e);
    }
  }

  const list = loading ? (
    <LoadingRegion label="Cargando avisos">
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </LoadingRegion>
  ) : error ? (
    <ErrorState description={humanError(error, 'No pudimos cargar los avisos.')} onRetry={reload} />
  ) : pageItems.length === 0 ? (
    <EmptyState
      title={all.length === 0 ? 'Todavía no hay avisos' : 'No hay avisos con este filtro'}
      description={
        all.length === 0
          ? 'Publicá el primer comunicado oficial para la cartelera.'
          : 'Probá con otro estado o destinatario.'
      }
      action={
        can(role, 'notices:manage') ? (
          <Button onClick={() => setForm({ open: true, notice: null })}>Nuevo aviso</Button>
        ) : undefined
      }
    />
  ) : (
    <ul className="flex flex-col gap-3">
      {pageItems.map((n) => {
        const canPause = n.viewStatus === 'ACTIVE';
        const canResume = n.viewStatus === 'PAUSED' || n.viewStatus === 'EXPIRED';
        const canDelete = can(role, 'notices:delete') && canResume;
        return (
          <li key={n.id}>
            <Card
              padded={false}
              className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:p-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {n.category && (
                    <Badge className="uppercase tracking-wide">{n.category.name}</Badge>
                  )}
                  {n.urgent && <Badge tone="urgent">Urgente</Badge>}
                  {n.highlighted && <Badge tone="success">Destacado</Badge>}
                  {stateBadge(n)}
                  <span className="text-xs text-font-strong">{vigenciaText(n)}</span>
                </div>
                <h3 className="mt-2 font-display text-lg font-bold text-accent-3">{n.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-font-strong">{n.body}</p>
                <p className="mt-1 text-xs text-font-strong">Para: {AUDIENCE_LABELS[n.audience]}</p>
                {n.attachment && (
                  <button
                    type="button"
                    onClick={() => openAttachment(n)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                    {n.attachment.filename} ({sizeLabel(n.attachment.sizeBytes)})
                    <span className="sr-only"> — se abre en una pestaña nueva</span>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 lg:shrink-0">
                {canPause && (
                  <Button size="sm" variant="secondary" onClick={() => pause(n)}>
                    Pausar<span className="sr-only">: {n.title}</span>
                  </Button>
                )}
                {canResume && (
                  <Button size="sm" variant="secondary" onClick={() => resume(n)}>
                    {n.viewStatus === 'EXPIRED' ? 'Reactivar' : 'Reanudar'}
                    <span className="sr-only">: {n.title}</span>
                  </Button>
                )}
                <Button size="sm" onClick={() => setForm({ open: true, notice: n })}>
                  Editar<span className="sr-only">: {n.title}</span>
                </Button>
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-text"
                    onClick={() => remove(n)}
                  >
                    Eliminar<span className="sr-only">: {n.title}</span>
                  </Button>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Select
          label="Estado"
          className="sm:w-56"
          options={statusOptions}
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
        />
        <Select
          label="Destinatario"
          className="sm:w-64"
          options={AUDIENCE_FILTER}
          value={audience}
          onValueChange={(v) => {
            setAudience(v);
            setPage(1);
          }}
        />
        <Button className="sm:ml-auto" onClick={() => setForm({ open: true, notice: null })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo aviso
        </Button>
      </div>

      {list}

      {!error && filtered.length > PAGE_SIZE && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
      )}
      {data && data.total > 100 && (
        <p className="text-sm text-font-strong">
          Hay más de 100 avisos: se muestran los 100 primeros. Eliminá o archivá los que ya no usás.
        </p>
      )}

      <p className="rounded-md bg-accent-2 px-4 py-3 text-sm text-accent-3">
        Los avisos con estado activo se sincronizan de inmediato con la cartelera general y la
        pantalla de Estudiantes.
      </p>

      <NoticeFormDialog
        open={form.open}
        notice={form.notice}
        onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
        onSaved={changed}
      />
      <ResumeDialog notice={resuming} onClose={() => setResuming(null)} onDone={changed} />
    </div>
  );
}

/** Reactiva un aviso vencido pidiendo la nueva fecha de fin (POST /notices/:id/resume { visibleUntil }). */
function ResumeDialog({
  notice,
  onClose,
  onDone,
}: {
  notice: NoticeDto | null;
  onClose: () => void;
  onDone: () => void;
}) {
  if (!notice) return null;
  return <ResumeForm key={notice.id} notice={notice} onClose={onClose} onDone={onDone} />;
}

function ResumeForm({
  notice,
  onClose,
  onDone,
}: {
  notice: NoticeDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [until, setUntil] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!until) {
      setErr('Elegí la nueva fecha de fin.');
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await api.post(`/notices/${notice.id}/resume`, { visibleUntil: orNull(until) });
      toast({
        title: 'Aviso reactivado',
        description: 'Vuelve a verse en el sitio.',
        tone: 'success',
      });
      onDone();
      onClose();
    } catch (e2) {
      setLoading(false);
      setErr(fieldMessages(e2).visibleUntil ?? humanError(e2));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Reactivar aviso vencido"
      description="Este aviso ya pasó su fecha de fin. Definí una nueva para volver a mostrarlo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="form-reactivar-aviso" loading={loading}>
            Reactivar
          </Button>
        </>
      }
    >
      <form id="form-reactivar-aviso" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-accent-3">{notice.title}</p>
        <Input
          label="Nueva fecha de fin"
          type="date"
          required
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          error={err ?? undefined}
        />
      </form>
    </Dialog>
  );
}
