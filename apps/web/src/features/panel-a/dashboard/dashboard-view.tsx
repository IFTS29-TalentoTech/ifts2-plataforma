'use client';

/**
 * /panel (Resumen, US-12; Figma 07-resumen y Mobile · Resumen).
 * Consume GET /dashboard, GET /social/posts?status=DETECTED&pageSize=3 y GET /notices?status=ACTIVE&pageSize=3.
 *
 * Permisos por rol (`can`): cada bloque aparece solo si el rol puede usarlo (RF05, E2E-11):
 *  - Instagram, "Redes sociales", publicaciones por moderar, forzar sincronización -> `social:moderate`
 *    (EDITOR y ADMIN). BEDELIA no ve nada de redes.
 *  - "Avisos activos", cartelera y "Crear nuevo aviso formal" -> `notices:manage` (BEDELIA y ADMIN).
 *  - "Actualizar grilla de horarios" -> `schedules:manage`. "Período vigente" e "Ingreso" los ven todos.
 *
 * Instagram (RF04, RNF03): el recuadro de estado es un botón ("clic para sincronizar"). Estados: demostración /
 * credenciales guardadas / conectada / por vencer / error con el motivo. Si falla, el Resumen sigue funcionando
 * y ofrece "Cargar publicación manualmente". En modo demostración se avisa que los datos son de ejemplo.
 * Un pedido secundario que falle no rompe la pantalla: ese bloque muestra su propio error con "Reintentar".
 */
import { Info, Plus, RefreshCw, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Eyebrow,
  ErrorState,
  LoadingRegion,
  Skeleton,
} from '@/components/ui';
import { api } from '@/lib/api';
import { daysUntil, formatDateAR, formatDateTimeAR } from '@/lib/dates';
import { can, type NoticeDto, type PermissionList } from '@ifts2/shared';
import { NoticeFormDialog } from '../avisos/notice-form-dialog';
import { deriveTitle } from '../lib/caption';
import { detectedLabel } from '../lib/dates';
import { humanError } from '../lib/errors';
import type {
  DashboardDto,
  InstagramStatus,
  Page,
  SocialPostsPage,
  SocialPostDto,
} from '../lib/types';
import { useResource } from '../lib/use-resource';
import { useInstagramSync } from '../lib/use-sync';
import { ManualPostDialog } from '../publicaciones/manual-post-dialog';
import { ModerationDialog } from '../publicaciones/moderation-dialog';
import { PostThumb } from '../publicaciones/post-thumb';

/** Texto y tono del recuadro "Instagram API" (nunca solo color: lleva palabra). */
function instagramLabel(ig: DashboardDto['instagram']): {
  text: string;
  tone: 'ok' | 'warn' | 'error';
} {
  const status: InstagramStatus = ig.status;
  if (!ig.ok || status === 'error') return { text: 'Error', tone: 'error' };
  if (status === 'demo') return { text: 'Modo demostración', tone: 'warn' };
  if (status === 'credentials_saved') return { text: 'Falta conectar la cuenta', tone: 'warn' };
  if (status === 'expiring') return { text: 'Conectada, el acceso está por vencer', tone: 'warn' };
  return { text: 'Sincronizada', tone: 'ok' };
}

export function DashboardView({ perms }: { perms: PermissionList }) {
  const router = useRouter();
  const canSocial = can(perms, 'social:moderate');
  const canNotices = can(perms, 'notices:manage');
  const canSchedules = can(perms, 'schedules:manage');

  const dash = useResource('dashboard', () => api.get<DashboardDto>('/dashboard'));
  const posts = useResource(canSocial ? 'dash-posts' : 'dash-posts-off', () =>
    canSocial
      ? api.get<SocialPostsPage>('/social/posts?status=DETECTED&pageSize=3')
      : Promise.resolve(null),
  );
  const notices = useResource(canNotices ? 'dash-notices' : 'dash-notices-off', () =>
    canNotices
      ? api.get<Page<NoticeDto>>('/notices?status=ACTIVE&pageSize=3')
      : Promise.resolve(null),
  );

  const [selected, setSelected] = useState<SocialPostDto | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const refreshAll = () => {
    dash.reload();
    posts.reload();
    notices.reload();
    router.refresh(); // contadores del menú
  };
  const { sync, syncing } = useInstagramSync(refreshAll);

  if (dash.loading) {
    return (
      <LoadingRegion label="Cargando el resumen">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64" />
      </LoadingRegion>
    );
  }
  if (dash.error || !dash.data) {
    return (
      <ErrorState
        description={humanError(dash.error, 'No pudimos cargar el resumen del panel.')}
        onRetry={dash.reload}
      />
    );
  }
  const d = dash.data;
  const ig = instagramLabel(d.instagram);
  const igProblem = canSocial && ig.tone === 'error';

  return (
    <>
      {/* Encabezado + estado de Instagram */}
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-accent-3">Panel de control</h1>
          <p className="mt-1 max-w-2xl text-sm text-font-strong">
            Visión general del estado del sitio institucional y tareas prioritarias.
          </p>
        </div>
        {canSocial && (
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            aria-busy={syncing || undefined}
            className={
              'flex items-center gap-2 rounded-md px-4 py-2.5 text-left text-sm font-medium focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-60 ' +
              (ig.tone === 'ok'
                ? 'bg-success-back text-success-text'
                : ig.tone === 'warn'
                  ? 'bg-warning-back text-warning-strong'
                  : 'bg-danger-back text-danger-text')
            }
          >
            <RefreshCw
              className={`h-4 w-4 shrink-0 ${syncing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>
              Instagram API: <strong>{syncing ? 'sincronizando…' : ig.text}</strong>{' '}
              <span className="text-xs font-normal">(clic para sincronizar)</span>
            </span>
          </button>
        )}
      </div>

      {canSocial && d.instagram.mode === 'demo' && (
        <p
          role="status"
          className="mb-6 flex items-start gap-2 rounded-md border border-warning-strong bg-warning-back px-4 py-3 text-sm text-warning-strong"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Modo demostración.</strong> Instagram todavía no está conectada: las
            publicaciones que ves son de ejemplo. Un administrador carga las credenciales reales en
            Configuración.
          </span>
        </p>
      )}

      {igProblem && (
        <div
          role="alert"
          className="mb-6 flex flex-col gap-3 rounded-md border border-danger-text bg-danger-back px-4 py-3 text-sm text-danger-text sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            <strong>Instagram API: error.</strong>{' '}
            {d.instagram.error ?? 'La última sincronización falló.'} El resto del panel sigue
            funcionando.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
            Cargar publicación manualmente
          </Button>
        </div>
      )}
      {canSocial && !igProblem && d.instagram.status === 'expiring' && (
        <p
          role="status"
          className="mb-6 rounded-md bg-warning-back px-4 py-3 text-sm text-warning-strong"
        >
          El acceso a Instagram vence
          {d.instagram.tokenExpiresAt
            ? ` el ${formatDateAR(d.instagram.tokenExpiresAt)}`
            : ' pronto'}
          . Se renueva solo al sincronizar; si falla, un administrador debe volver a conectar la
          cuenta.
        </p>
      )}

      {/* Tarjetas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSocial && (
          <StatCard
            eyebrow="Redes sociales"
            tag={d.pendingPosts > 0 ? 'Requiere acción' : 'Al día'}
            tagTone={d.pendingPosts > 0 ? 'warning' : 'success'}
            value={String(d.pendingPosts)}
            text="Posts pendientes de moderar para Novedades y Home."
          />
        )}
        {canNotices && (
          <StatCard
            eyebrow="Avisos activos"
            tag="Cartelera"
            value={String(d.activeNotices)}
            text={
              d.noticesExpiringIn7Days > 0
                ? `${d.noticesExpiringIn7Days} aviso${d.noticesExpiringIn7Days === 1 ? '' : 's'} próximo${d.noticesExpiringIn7Days === 1 ? '' : 's'} a vencer en los siguientes 7 días.`
                : 'Ninguno vence en los próximos 7 días.'
            }
          />
        )}
        <StatCard
          eyebrow="Período vigente"
          tag="Académico"
          value={d.currentTerm ? d.currentTerm.label : 'Sin definir'}
          text={
            d.examCallNext
              ? `Próximo llamado: ${d.examCallNext.name} (${formatDateAR(d.examCallNext.startsOn)}).`
              : 'No hay llamados a examen próximos cargados.'
          }
        />
        <StatCard
          eyebrow="Ingreso"
          tag="Inscripción"
          value={d.ingresoCycle ? `Ciclo ${d.ingresoCycle.year}` : 'Sin definir'}
          text="Guía de requisitos y ficha de preinscripción activa en la web."
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {canSocial && (
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Publicaciones de redes por moderar</CardTitle>
                  <p className="text-sm text-font-strong">
                    Definí si se muestran en la web y en qué sección.
                  </p>
                </div>
                <Link
                  href="/panel/publicaciones"
                  className="rounded-sm text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
                >
                  {d.pendingPosts} en espera
                </Link>
              </div>
              <div className="mt-4">
                {posts.loading ? (
                  <LoadingRegion label="Cargando publicaciones por moderar">
                    <Skeleton className="h-20" />
                  </LoadingRegion>
                ) : posts.error ? (
                  <ErrorState
                    title="No pudimos cargar las publicaciones"
                    description={humanError(posts.error)}
                    onRetry={posts.reload}
                  />
                ) : !posts.data || posts.data.items.length === 0 ? (
                  <p className="rounded-md bg-base px-4 py-6 text-center text-sm text-font-strong">
                    No hay publicaciones pendientes. Sincronizá con Instagram para traer las nuevas.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {posts.data.items.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-col gap-3 rounded-md bg-base p-3 sm:flex-row sm:items-center"
                      >
                        <PostThumb src={p.mediaUrl} className="h-12 w-12" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-accent-3">
                            {deriveTitle(p.caption)}
                          </p>
                          <p className="text-xs text-font-strong">
                            Detectado {detectedLabel(p.detectedAt)} ·{' '}
                            {p.source === 'manual' ? 'Carga manual' : 'Instagram'}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setSelected(p)}
                          aria-label={`Moderar: ${deriveTitle(p.caption)}`}
                        >
                          Moderar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          )}

          {canNotices && (
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Cartelera institucional activa</CardTitle>
                  <p className="text-sm text-font-strong">
                    Avisos publicados actualmente en la pantalla de estudiantes.
                  </p>
                </div>
                <Link
                  href="/panel/avisos"
                  className="rounded-sm text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
                >
                  Gestionar cartelera completa →
                </Link>
              </div>
              <div className="mt-4">
                {notices.loading ? (
                  <LoadingRegion label="Cargando la cartelera">
                    <Skeleton className="h-20" />
                  </LoadingRegion>
                ) : notices.error ? (
                  <ErrorState
                    title="No pudimos cargar la cartelera"
                    description={humanError(notices.error)}
                    onRetry={notices.reload}
                  />
                ) : !notices.data || notices.data.items.length === 0 ? (
                  <p className="rounded-md bg-base px-4 py-6 text-center text-sm text-font-strong">
                    No hay avisos activos. Podés crear uno desde Acciones rápidas.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {notices.data.items.map((n) => {
                      const left = n.visibleUntil ? daysUntil(n.visibleUntil) : null;
                      const soon = left !== null && left <= 7;
                      return (
                        <li
                          key={n.id}
                          className="flex flex-col gap-2 rounded-md border border-accent-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-accent-3">
                              {n.urgent ? (
                                <Badge tone="urgent">Urgente</Badge>
                              ) : n.category ? (
                                <Badge className="uppercase">{n.category.name}</Badge>
                              ) : null}
                              {n.title}
                            </p>
                            <p className="mt-1 text-xs text-font-strong">
                              {n.visibleUntil
                                ? `Vigente hasta el ${formatDateAR(n.visibleUntil)}${soon ? ` (en ${Math.max(left!, 0)} días)` : ''}`
                                : 'Sin fecha de fin'}
                              {n.attachment ? ` · Adjunto: ${n.attachment.filename}` : ''}
                            </p>
                          </div>
                          <Badge
                            tone={soon ? 'warning' : 'success'}
                            className="self-start sm:self-center"
                          >
                            {soon ? 'Por vencer' : 'En línea'}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-6" aria-label="Acciones y notas">
          <Card className="p-5 sm:p-6">
            <CardTitle>Acciones rápidas</CardTitle>
            <div className="mt-4 flex flex-col gap-2">
              {canNotices && (
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => setNoticeOpen(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Crear nuevo aviso formal
                </Button>
              )}
              {canSchedules && (
                <Button asChild variant="secondary" className="justify-start">
                  <Link href="/panel/horarios">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Actualizar grilla de horarios
                  </Link>
                </Button>
              )}
              {canSocial && (
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={sync}
                  loading={syncing}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Forzar sincronización de Instagram
                </Button>
              )}
              {canSocial && (
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => setManualOpen(true)}
                >
                  Cargar publicación manualmente
                </Button>
              )}
            </div>
          </Card>

          {canSocial && (
            <div className="rounded-lg bg-accent-2 p-5 text-sm text-accent-3">
              <p className="flex items-center gap-2 font-display font-bold">
                <Info className="h-4 w-4" aria-hidden="true" />
                Curaduría descentralizada
              </p>
              <p className="mt-2">
                Los docentes y bedeles publican en Instagram; este panel permite que el equipo
                decida qué contenidos merecen destacarse en el portal público.
              </p>
              <p className="mt-3 flex justify-between border-t border-font-strong pt-2 text-xs">
                <span>Última comprobación:</span>
                <strong>
                  {d.instagram.lastSyncAt
                    ? formatDateTimeAR(d.instagram.lastSyncAt)
                    : 'sin sincronizar'}
                </strong>
              </p>
            </div>
          )}
        </aside>
      </div>

      <ModerationDialog
        post={selected}
        onClose={() => setSelected(null)}
        onChanged={refreshAll}
        canDelete={can(perms, 'social:delete')}
      />
      <NoticeFormDialog
        open={noticeOpen}
        notice={null}
        onOpenChange={setNoticeOpen}
        onSaved={refreshAll}
      />
      <ManualPostDialog open={manualOpen} onOpenChange={setManualOpen} onCreated={refreshAll} />
    </>
  );
}

function StatCard({
  eyebrow,
  tag,
  tagTone = 'neutral',
  value,
  text,
}: {
  eyebrow: string;
  tag: string;
  tagTone?: 'neutral' | 'warning' | 'success';
  value: string;
  text: string;
}) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow className="text-font-strong">{eyebrow}</Eyebrow>
        <Badge tone={tagTone}>{tag}</Badge>
      </div>
      <p className="font-display text-2xl font-extrabold text-accent-3">{value}</p>
      <p className="text-sm text-font-strong">{text}</p>
    </Card>
  );
}
