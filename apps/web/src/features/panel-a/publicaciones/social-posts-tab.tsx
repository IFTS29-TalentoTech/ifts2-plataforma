'use client';

/**
 * Pestaña "De redes sociales" de /panel/publicaciones (RF04, US-07 a US-10; Figma 08-publicaciones).
 * Consume GET /social/posts?status=&page=&pageSize= (con `counts` por estado para las pestañas).
 *
 * Estados que ve la persona (etiqueta -> estado de la API):
 *  - Pendiente  = DETECTED reciente · Revisar = DETECTED con más de 30 días (Q80: criterio provisorio) ·
 *  - Aprobada   = LINKED · Descartada = DISCARDED (recuperable con "Restaurar").
 * El filtro Origen (Instagram / carga manual) se aplica en el navegador sobre la página cargada: la API
 * no lo filtra todavía (Q81).
 */
import { RefreshCw, PencilLine } from 'lucide-react';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTimeAR } from '@/lib/dates';
import { can, type Role, type SocialStatus } from '@ifts2/shared';
import { deriveTitle } from '../lib/caption';
import { detectedLabel } from '../lib/dates';
import { humanError } from '../lib/errors';
import type { SocialPostDto, SocialPostsPage } from '../lib/types';
import { useInstagramSync } from '../lib/use-sync';
import { useResource } from '../lib/use-resource';
import { ManualPostDialog } from './manual-post-dialog';
import { ModerationDialog } from './moderation-dialog';
import { PostThumb } from './post-thumb';

const PAGE_SIZE = 12;
/** Pasados estos días sin moderar, una publicación pendiente se marca "Revisar". */
const STALE_DAYS = 30;

const TABS: Array<{ value: SocialStatus; label: string }> = [
  { value: 'DETECTED', label: 'Pendientes' },
  { value: 'LINKED', label: 'Aprobadas' },
  { value: 'DISCARDED', label: 'Descartadas' },
];

const SOURCE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'manual', label: 'Carga manual' },
];

function stateBadge(p: SocialPostDto) {
  if (p.status === 'LINKED') return <Badge tone="success">Aprobada</Badge>;
  if (p.status === 'DISCARDED') return <Badge tone="neutral">Descartada</Badge>;
  const stale = Date.now() - new Date(p.postedAt).getTime() > STALE_DAYS * 86_400_000;
  return stale ? <Badge tone="warning">Revisar</Badge> : <Badge tone="neutral">Pendiente</Badge>;
}

export function SocialPostsTab({ role, onChanged }: { role: Role; onChanged: () => void }) {
  const [status, setStatus] = useState<SocialStatus>('DETECTED');
  const [page, setPage] = useState(1);
  const [source, setSource] = useState('all');
  const [selected, setSelected] = useState<SocialPostDto | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const { data, error, loading, reload } = useResource(`social:${status}:${page}`, () =>
    api.get<SocialPostsPage>(`/social/posts?status=${status}&page=${page}&pageSize=${PAGE_SIZE}`),
  );
  const changed = () => {
    reload();
    onChanged(); // actualiza los contadores del menú
  };
  const { sync, syncing } = useInstagramSync(changed);

  const items = (data?.items ?? []).filter((p) => source === 'all' || p.source === source);

  const list = loading ? (
    <LoadingRegion label="Cargando publicaciones">
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </LoadingRegion>
  ) : error ? (
    <ErrorState
      description={humanError(error, 'No pudimos cargar las publicaciones de redes.')}
      onRetry={reload}
    />
  ) : items.length === 0 ? (
    <EmptyState
      title={
        status === 'DETECTED'
          ? 'No hay publicaciones pendientes'
          : status === 'LINKED'
            ? 'Todavía no aprobaste publicaciones de redes'
            : 'No hay publicaciones descartadas'
      }
      description={
        status === 'DETECTED'
          ? 'Sincronizá con Instagram para traer las nuevas o cargá una publicación manualmente.'
          : undefined
      }
      action={
        status === 'DETECTED' ? (
          <Button variant="secondary" onClick={sync} loading={syncing}>
            Sincronizar con Instagram
          </Button>
        ) : undefined
      }
    />
  ) : (
    <ul className="flex flex-col gap-3">
      {items.map((p) => (
        <li key={p.id}>
          <Card padded={false} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <PostThumb
              src={p.publication?.coverSrc ?? p.mediaUrl}
              className="h-40 w-full sm:h-24 sm:w-40"
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold text-accent-3">
                {p.publication?.title ?? deriveTitle(p.caption)}
              </h3>
              <p className="mt-1 text-sm text-font-strong">
                {p.source === 'manual' ? 'Carga manual' : 'Instagram'} ·{' '}
                {p.status === 'DETECTED'
                  ? `Detectada ${detectedLabel(p.detectedAt)}`
                  : p.moderatedAt
                    ? `Resuelta el ${formatDateTimeAR(p.moderatedAt)}`
                    : `Publicada el ${formatDateTimeAR(p.postedAt)}`}
              </p>
              <div className="mt-2">{stateBadge(p)}</div>
            </div>
            <Button
              variant={p.status === 'DETECTED' ? 'primary' : 'secondary'}
              onClick={() => setSelected(p)}
              aria-label={`${p.status === 'DETECTED' ? 'Moderar' : 'Ver detalle de'}: ${p.publication?.title ?? deriveTitle(p.caption)}`}
            >
              {p.status === 'DETECTED' ? 'Moderar' : 'Ver detalle'}
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Select
          label="Origen"
          className="sm:w-56"
          options={SOURCE_OPTIONS}
          value={source}
          onValueChange={setSource}
        />
        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
          <Button variant="secondary" onClick={sync} loading={syncing}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Sincronizar con Instagram
          </Button>
          <Button variant="secondary" onClick={() => setManualOpen(true)}>
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            Cargar publicación manualmente
          </Button>
        </div>
      </div>

      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as SocialStatus);
          setPage(1);
        }}
      >
        <TabsList aria-label="Estado de la publicación">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {data ? ` (${data.counts[t.value]})` : ''}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {list}
          </TabsContent>
        ))}
      </Tabs>

      {data && !error && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}

      <p className="rounded-md bg-accent-2 px-4 py-3 text-sm text-accent-3">
        La integración automática con redes queda sujeta a validación técnica. La aprobación
        editorial es el requisito principal.
      </p>

      <ModerationDialog
        post={selected}
        onClose={() => setSelected(null)}
        onChanged={changed}
        canDelete={can(role, 'social:delete')}
      />
      <ManualPostDialog open={manualOpen} onOpenChange={setManualOpen} onCreated={changed} />
    </div>
  );
}
