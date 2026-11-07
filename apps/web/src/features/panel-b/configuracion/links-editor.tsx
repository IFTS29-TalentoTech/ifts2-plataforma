/**
 * Configuración · Enlaces de interés (SIU Guaraní, Aulas Virtuales, Mi Argentina, tutorías...).
 * Alimentan los accesos rápidos del Inicio y de Estudiantes.
 *
 * Reglas (RF01, 04-api "Enlaces"):
 * - CRUD con orden y visibilidad. Ocultar NO borra; eliminar solo si está oculto, con confirmación.
 * - Un enlace con dominio `*.invalid` (los de la semilla sin dirección real) no puede mostrarse (422):
 *   hay que cargar primero la dirección verdadera. El mensaje de la API se muestra tal cual.
 */
'use client';

import { can, type LinkDto, type PermissionList } from '@ifts2/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingRegion,
  Skeleton,
  Switch,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';

export function LinksEditor({ perms }: { perms: PermissionList }) {
  const { toast } = useToast();
  const list = useResource<{ items: LinkDto[]; total: number }>('/links');
  const [editing, setEditing] = useState<LinkDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<LinkDto | null>(null);
  const canDelete = can(perms, 'links:delete');

  return (
    <section aria-labelledby="links-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="links-title" className="font-display text-xl font-bold text-accent-3">
            Enlaces de interés
          </h2>
          <p className="text-sm text-font-strong">
            Accesos rápidos del sitio: SIU Guaraní, Aulas Virtuales, Mi Argentina y otros.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo enlace
        </Button>
      </div>

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando enlaces">
          <Skeleton className="h-20" />
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          title="Todavía no hay enlaces"
          description="Creá el primero con el botón Nuevo enlace."
        />
      )}
      <ul className="flex flex-col gap-3">
        {list.data?.items.map((l) => (
          <li key={l.id}>
            <Card
              data-testid="link-row"
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-accent-3">
                  {l.title}
                  <Badge tone={l.visible ? 'success' : 'neutral'}>
                    {l.visible ? 'Visible' : 'Oculto'}
                  </Badge>
                </p>
                <p className="break-all text-sm text-font-strong">{l.url}</p>
                <p className="text-xs text-font-strong">
                  Grupo {l.group} · orden {l.order}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(l)}
                  aria-label={`Editar el enlace ${l.title}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Editar
                </Button>
                {canDelete && !l.visible && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleting(l)}
                    aria-label={`Eliminar el enlace ${l.title}`}
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

      <LinkDialog
        link={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast({ tone: 'success', title: 'Enlace guardado.' });
          list.reload();
        }}
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          tone="danger"
          title="¿Eliminar este enlace?"
          description="Se elimina definitivamente. Si solo querés que no se vea, dejalo oculto."
          details={<strong>{deleting.title}</strong>}
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await api.delete(`/links/${deleting.id}`);
            toast({ tone: 'success', title: 'Enlace eliminado.' });
            list.reload();
          }}
        />
      )}
    </section>
  );
}

function LinkDialog({
  link,
  onClose,
  onSaved,
}: {
  link: LinkDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = link && link !== 'new' ? link : null;
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [group, setGroup] = useState('academico');
  const [order, setOrder] = useState('0');
  const [visible, setVisible] = useState(true);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(link, () => {
    if (!link) return;
    setTitle(current?.title ?? '');
    setUrl(current?.url ?? '');
    setDescription(current?.description ?? '');
    setGroup(current?.group ?? 'academico');
    setOrder(String(current?.order ?? 0));
    setVisible(current?.visible ?? true);
    setErrors({});
    setFormError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || null,
        group: group.trim() || 'academico',
        order: Number(order) || 0,
        visible,
      };
      if (current) await api.patch(`/links/${current.id}`, body);
      else await api.post('/links', body);
      onClose();
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!link}
      onOpenChange={(o) => !o && onClose()}
      title={current ? 'Editar enlace' : 'Nuevo enlace'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="link-form" loading={saving}>
            Guardar enlace
          </Button>
        </>
      }
    >
      <form id="link-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
        />
        <Input
          label="Dirección web"
          type="url"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={errors.url}
          required
        />
        <Input
          label="Descripción (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Grupo"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            error={errors.group}
          />
          <Input
            label="Orden"
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            error={errors.order}
          />
        </div>
        <Switch label="Visible en el sitio" checked={visible} onCheckedChange={setVisible} />
        {formError && Object.keys(errors).length === 0 && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
