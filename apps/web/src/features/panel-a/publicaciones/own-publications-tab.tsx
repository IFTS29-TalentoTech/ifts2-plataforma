'use client';

/**
 * Pestaña "Propias del sitio" de /panel/publicaciones: gestión de las `Publication` (manuales y las que salieron
 * de aprobar una publicación de Instagram). US-10 y consigna de la cátedra (CRUD completo).
 * Endpoints: GET /publications?status=&origin=&page=, POST/PATCH /publications, POST /publications/:id/
 * {publish,pause,schedule,reactivate}, DELETE /publications/:id.
 *
 * Reglas (apps/api/src/modules/publications/README.md):
 *  - "Vencida" no es un estado: es `expired` (pasó visibleUntil). Se reactiva con nueva fecha de fin.
 *  - Eliminar es MANUAL y con confirmación; solo borrador, pausada o vencida. Vigente o programada -> 409 y
 *    se muestra el motivo que manda la API. Si venía de Instagram, la publicación de redes vuelve a pendiente.
 *  - Pausar saca del sitio sin perder nada (nada se borra solo).
 */
import { can, type PermissionList } from '@ifts2/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingRegion,
  Pagination,
  Select,
  Skeleton,
  useConfirm,
  useToast,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { api } from '@/lib/api';
import { confirmPublication } from '@/lib/confirm-publication';
import { formatDateAR } from '@/lib/dates';
import { toDisplayError } from '../lib/display-error';
import { handleSessionExpired, humanError } from '../lib/errors';
import type { Page, PublicationDto } from '../lib/types';
import { useResource } from '../lib/use-resource';
import { PostThumb } from './post-thumb';
import { PublicationFormDialog } from './publication-form-dialog';
import { VigenciaDialog, type VigenciaMode } from './vigencia-dialog';

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'DRAFT', label: 'Borradores' },
  { value: 'SCHEDULED', label: 'Programadas' },
  { value: 'PUBLISHED', label: 'Publicadas' },
  { value: 'PAUSED', label: 'Pausadas' },
];
const ORIGIN_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'MANUAL', label: 'Cargadas a mano' },
  { value: 'INSTAGRAM', label: 'Desde Instagram' },
];

function statusInfo(p: PublicationDto): { label: string; tone: BadgeTone } {
  if (p.expired) return { label: 'Vencida', tone: 'warning' };
  switch (p.status) {
    case 'DRAFT':
      return { label: 'Borrador', tone: 'neutral' };
    case 'SCHEDULED':
      return { label: 'Programada', tone: 'neutral' };
    case 'PAUSED':
      return { label: 'Pausada', tone: 'warning' };
    default:
      return { label: p.visible ? 'En línea' : 'Publicada', tone: 'success' };
  }
}

function vigenciaText(p: PublicationDto): string {
  const from = p.visibleFrom ? formatDateAR(p.visibleFrom) : null;
  const until = p.visibleUntil ? formatDateAR(p.visibleUntil) : null;
  if (from && until) return `Vigencia: ${from} al ${until}`;
  if (until) return `Vigente hasta el ${until}`;
  if (from) return `Desde el ${from}`;
  return 'Sin fecha de fin';
}

export function OwnPublicationsTab({
  onChanged,
  perms,
}: {
  onChanged: () => void;
  perms: PermissionList;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [status, setStatus] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; publication: PublicationDto | null }>({
    open: false,
    publication: null,
  });
  const [vigencia, setVigencia] = useState<{ p: PublicationDto | null; mode: VigenciaMode }>({
    p: null,
    mode: 'schedule',
  });

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status !== 'all') qs.set('status', status);
  if (origin !== 'all') qs.set('origin', origin);
  const { data, error, loading, reload } = useResource(`pubs:${qs}`, () =>
    api.get<Page<PublicationDto>>(`/publications?${qs}`),
  );
  const changed = () => {
    reload();
    onChanged();
  };

  /** Acciones simples (publicar / pausar) con diálogo de confirmación. */
  async function simpleAction(
    p: PublicationDto,
    action: 'publish' | 'pause',
    cfg: { title: string; description: string; confirmLabel: string; done: string },
  ) {
    const ok = await confirm({
      title: cfg.title,
      description: cfg.description,
      details: <strong>{p.title}</strong>,
      confirmLabel: cfg.confirmLabel,
    });
    if (!ok) return;
    try {
      await confirmPublication(p.id, action);
      toast({ title: cfg.done, tone: 'success' });
    } catch (e) {
      if (!handleSessionExpired(e))
        toast({
          title: 'No se pudo completar la acción',
          description: humanError(e),
          tone: 'error',
        });
    }
    changed();
  }

  async function remove(p: PublicationDto) {
    const ok = await confirm({
      title: '¿Eliminar la publicación?',
      description:
        'Se elimina definitivamente y queda registrado quién y cuándo. Esta acción no se puede deshacer.',
      details: <strong>{p.title}</strong>,
      tone: 'danger',
      confirmLabel: 'Sí, eliminar',
    });
    if (!ok) return;
    try {
      await api.delete(`/publications/${p.id}`);
      toast({ title: 'Publicación eliminada', tone: 'success' });
    } catch (e) {
      // 409 si está vigente o programada: se muestra el motivo que da la API.
      if (!handleSessionExpired(e))
        toast({
          title: 'No se pudo eliminar',
          description: toDisplayError(e).message,
          tone: 'error',
        });
    }
    changed();
  }

  const body = loading ? (
    <LoadingRegion label="Cargando publicaciones">
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </LoadingRegion>
  ) : error ? (
    <ErrorState
      description={humanError(error, 'No pudimos cargar las publicaciones.')}
      onRetry={reload}
    />
  ) : !data || data.items.length === 0 ? (
    <EmptyState
      title="No hay publicaciones con estos filtros"
      description="Creá una nueva o cambiá los filtros."
      action={
        <Button onClick={() => setForm({ open: true, publication: null })}>
          Nueva publicación
        </Button>
      }
    />
  ) : (
    <ul className="flex flex-col gap-3">
      {data.items.map((p) => {
        const info = statusInfo(p);
        const canDelete =
          can(perms, 'publications:delete') &&
          (p.status === 'DRAFT' || p.status === 'PAUSED' || p.expired);
        return (
          <li key={p.id}>
            <Card padded={false} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
              <PostThumb src={p.coverSrc} label="IMG" className="h-32 w-full lg:h-20 lg:w-32" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={info.tone}>{info.label}</Badge>
                  {p.category && <Badge>{p.category.name}</Badge>}
                  {p.origin === 'INSTAGRAM' && <Badge>Instagram</Badge>}
                </div>
                <h3 className="mt-1 font-display text-lg font-bold text-accent-3">{p.title}</h3>
                <p className="text-sm text-font-strong">{vigenciaText(p)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setForm({ open: true, publication: p })}
                >
                  Editar<span className="sr-only">: {p.title}</span>
                </Button>
                {p.status === 'DRAFT' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      simpleAction(p, 'publish', {
                        title: '¿Publicar ahora?',
                        description:
                          'Se va a mostrar en el sitio según la sección y la vigencia elegidas.',
                        confirmLabel: 'Sí, publicar',
                        done: 'Publicación en línea',
                      })
                    }
                  >
                    Publicar<span className="sr-only">: {p.title}</span>
                  </Button>
                )}
                {(p.status === 'DRAFT' || p.status === 'PAUSED') && !p.expired && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setVigencia({ p, mode: 'schedule' })}
                  >
                    Programar<span className="sr-only">: {p.title}</span>
                  </Button>
                )}
                {(p.status === 'PUBLISHED' || p.status === 'SCHEDULED') && !p.expired && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      simpleAction(p, 'pause', {
                        title: '¿Pausar la publicación?',
                        description:
                          'Sale del sitio pero no se pierde: podés reactivarla cuando quieras.',
                        confirmLabel: 'Sí, pausar',
                        done: 'Publicación pausada',
                      })
                    }
                  >
                    Pausar<span className="sr-only">: {p.title}</span>
                  </Button>
                )}
                {(p.status === 'PAUSED' || p.expired) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setVigencia({ p, mode: 'reactivate' })}
                  >
                    Reactivar<span className="sr-only">: {p.title}</span>
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-text"
                    onClick={() => remove(p)}
                  >
                    Eliminar<span className="sr-only">: {p.title}</span>
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
          className="sm:w-48"
          options={STATUS_OPTIONS}
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <Select
          label="Origen"
          className="sm:w-52"
          options={ORIGIN_OPTIONS}
          value={origin}
          onValueChange={(v) => {
            setOrigin(v);
            setPage(1);
          }}
        />
        <Button className="sm:ml-auto" onClick={() => setForm({ open: true, publication: null })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva publicación
        </Button>
      </div>
      {body}
      {data && !error && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}
      <PublicationFormDialog
        open={form.open}
        publication={form.publication}
        onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
        onSaved={changed}
      />
      <VigenciaDialog
        publication={vigencia.p}
        mode={vigencia.mode}
        onClose={() => setVigencia((v) => ({ ...v, p: null }))}
        onDone={changed}
      />
    </div>
  );
}
