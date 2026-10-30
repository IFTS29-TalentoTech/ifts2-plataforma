'use client';

/**
 * /panel/mensajes: bandeja de mensajes del formulario de contacto (RF08, Should; E2E-14 lado panel).
 * Pantalla SIN diseño en el Figma: se resuelve con tarjetas, insignias y diálogos del kit (Q83).
 * Endpoints: GET /contact-messages?status=&page=, PATCH /contact-messages/:id { status }, DELETE /contact-messages/:id.
 *
 * Reglas:
 *  - Estados NEW (nuevo) -> READ (leído) -> ANSWERED (respondido). Cambiarlos es manual.
 *  - Eliminar: solo ADMIN y solo mensajes ya respondidos (409 si no), con confirmación (Q41 del agente académico).
 *  - Privacidad (Ley 25.326): son datos personales de quien escribió; no se copian a ningún otro lado y el
 *    consentimiento queda indicado en cada mensaje.
 *  - `mailSent=false` indica que el correo institucional no pudo avisarse (el mensaje se guardó igual).
 */
import { Mail } from 'lucide-react';
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
import { formatDateTimeAR } from '@/lib/dates';
import type { ContactMessageDto, MessageStatus } from '@ifts2/shared';
import { toDisplayError } from '../lib/display-error';
import { handleSessionExpired, humanError } from '../lib/errors';
import type { Page } from '../lib/types';
import { useResource } from '../lib/use-resource';
import { useRouter } from 'next/navigation';

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<MessageStatus, { label: string; tone: BadgeTone }> = {
  NEW: { label: 'Nuevo', tone: 'warning' },
  READ: { label: 'Leído', tone: 'neutral' },
  ANSWERED: { label: 'Respondido', tone: 'success' },
};

const FILTER = [
  { value: 'all', label: 'Todos' },
  { value: 'NEW', label: 'Nuevos' },
  { value: 'READ', label: 'Leídos' },
  { value: 'ANSWERED', label: 'Respondidos' },
];

export function MensajesView({ canDelete }: { canDelete: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status !== 'all') qs.set('status', status);
  const { data, error, loading, reload } = useResource(`contact:${qs}`, () =>
    api.get<Page<ContactMessageDto>>(`/contact-messages?${qs}`),
  );

  async function setMessageStatus(m: ContactMessageDto, next: MessageStatus) {
    try {
      await api.patch(`/contact-messages/${m.id}`, { status: next });
      toast({ title: `Marcado como ${STATUS_LABEL[next].label.toLowerCase()}`, tone: 'success' });
    } catch (e) {
      if (!handleSessionExpired(e))
        toast({ title: 'No se pudo actualizar', description: humanError(e), tone: 'error' });
    }
    reload();
  }

  async function remove(m: ContactMessageDto) {
    const ok = await confirm({
      title: '¿Eliminar el mensaje?',
      description:
        'Se elimina definitivamente y queda registrado quién y cuándo. Solo se pueden eliminar mensajes ya respondidos.',
      details: (
        <>
          <strong>{m.subject}</strong>
          <br />
          {m.name}
        </>
      ),
      tone: 'danger',
      confirmLabel: 'Sí, eliminar',
    });
    if (!ok) return;
    try {
      await api.delete(`/contact-messages/${m.id}`);
      toast({ title: 'Mensaje eliminado', tone: 'success' });
    } catch (e) {
      if (!handleSessionExpired(e))
        toast({
          title: 'No se pudo eliminar',
          description: toDisplayError(e).message,
          tone: 'error',
        });
    }
    reload();
    router.refresh();
  }

  const body = loading ? (
    <LoadingRegion label="Cargando mensajes">
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </LoadingRegion>
  ) : error ? (
    <ErrorState
      description={humanError(error, 'No pudimos cargar los mensajes.')}
      onRetry={reload}
    />
  ) : !data || data.items.length === 0 ? (
    <EmptyState
      title="No hay mensajes"
      description={
        status === 'all'
          ? 'Cuando alguien escriba desde el formulario de contacto del sitio, el mensaje aparece acá.'
          : 'No hay mensajes con este estado.'
      }
    />
  ) : (
    <ul className="flex flex-col gap-3">
      {data.items.map((m) => {
        const st = STATUS_LABEL[m.status];
        return (
          <li key={m.id}>
            <Card padded={false} className="flex flex-col gap-3 p-4 lg:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={st.tone}>{st.label}</Badge>
                <span className="text-xs text-font-strong">{formatDateTimeAR(m.receivedAt)}</span>
                {!m.mailSent && <Badge tone="neutral">Sin aviso por correo</Badge>}
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-accent-3">{m.subject}</h3>
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-font-strong">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {m.name} ·{' '}
                  <a
                    href={`mailto:${m.email}`}
                    className="rounded-sm text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    {m.email}
                  </a>
                </p>
              </div>
              <p className="whitespace-pre-line text-sm text-accent-3">{m.message}</p>
              <div className="flex flex-wrap gap-2">
                {m.status !== 'READ' && (
                  <Button size="sm" variant="secondary" onClick={() => setMessageStatus(m, 'READ')}>
                    Marcar como leído<span className="sr-only">: {m.subject}</span>
                  </Button>
                )}
                {m.status !== 'ANSWERED' && (
                  <Button size="sm" onClick={() => setMessageStatus(m, 'ANSWERED')}>
                    Marcar como respondido<span className="sr-only">: {m.subject}</span>
                  </Button>
                )}
                {m.status === 'ANSWERED' && (
                  <Button size="sm" variant="secondary" onClick={() => setMessageStatus(m, 'NEW')}>
                    Volver a nuevo<span className="sr-only">: {m.subject}</span>
                  </Button>
                )}
                {canDelete && m.status === 'ANSWERED' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-text"
                    onClick={() => remove(m)}
                  >
                    Eliminar<span className="sr-only">: {m.subject}</span>
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
      <Select
        label="Estado"
        className="sm:w-56"
        options={FILTER}
        value={status}
        onValueChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />
      {body}
      {data && !error && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
