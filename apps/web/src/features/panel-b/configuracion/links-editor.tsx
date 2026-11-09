/**
 * Configuración · Enlaces de interés (SIU Guaraní, Aulas Virtuales, Mi Argentina, tutorías...).
 * Son los botones de acceso que se ven en Inicio, Estudiantes e Inscripciones.
 *
 * Reglas (RF01, 04-api "Enlaces", ADR-039):
 * - Cada enlace elige DÓNDE se muestra con casillas (Inicio, Estudiantes, Inscripciones); el antiguo
 *   campo "Grupo" ya no se edita. El texto de cada lugar viene de `LINK_PLACES` (@ifts2/shared).
 * - "¿Se muestra en el sitio?" es un selector Sí/No (no un interruptor mudo); ocultar NO borra.
 * - El orden se cambia con Subir/Bajar (`PUT /links/order`), sin números.
 * - Eliminar solo si está oculto, con confirmación. Un enlace con dominio `*.invalid` (semilla sin
 *   dirección real) no puede mostrarse (422): el mensaje de la API se muestra tal cual.
 * Pensado para personas mayores: frases completas en voseo, letra grande y estados escritos.
 */
'use client';

import { LINK_PLACES, can, type LinkDto, type PermissionList } from '@ifts2/shared';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingRegion,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';

/** Lugares donde se ve un enlace, en palabras ("Inicio, Estudiantes"). */
function placesOf(l: LinkDto): string[] {
  return LINK_PLACES.filter((p) => l[p.key]).map((p) => p.label);
}

export function LinksEditor({ perms }: { perms: PermissionList }) {
  const { toast } = useToast();
  const list = useResource<{ items: LinkDto[]; total: number }>('/links');
  const [editing, setEditing] = useState<LinkDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<LinkDto | null>(null);
  const canDelete = can(perms, 'links:delete');
  const [moving, setMoving] = useState(false);

  /** Mueve un enlace una posición y guarda el orden completo. */
  async function move(items: LinkDto[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setMoving(true);
    try {
      await api.put('/links/order', { ids });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    } finally {
      setMoving(false);
      list.reload(); // también si falló: otra persona pudo cambiar la lista
    }
  }

  return (
    <section aria-labelledby="links-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="links-title" className="font-display text-lg font-bold text-accent-3">
            Enlaces de interés
          </h2>
          <p className="text-sm text-font-strong">
            Son los botones de acceso del sitio (por ejemplo SIU Guaraní o Aulas virtuales). Para
            cada uno elegís en qué páginas se ve y si se muestra o no.
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
        {list.data?.items.map((l, index) => (
          <li key={l.id}>
            <Card
              data-testid="link-row"
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-accent-3">
                  {l.title}
                  <Badge tone={l.visible ? 'success' : 'neutral'}>
                    {l.visible ? 'Se muestra en el sitio' : 'Oculto: no se muestra'}
                  </Badge>
                </p>
                <p className="break-all text-font-strong">{l.url}</p>
                <p className="text-font-strong">
                  <strong>Se ve en:</strong>{' '}
                  {placesOf(l).length > 0 ? placesOf(l).join(', ') : 'ninguna página todavía'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={index === 0 || moving}
                  onClick={() => move(list.data!.items, index, -1)}
                  aria-label={`Subir el enlace ${l.title}`}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  Subir
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={index === list.data!.items.length - 1 || moving}
                  onClick={() => move(list.data!.items, index, 1)}
                  aria-label={`Bajar el enlace ${l.title}`}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  Bajar
                </Button>
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
  const [visible, setVisible] = useState(true);
  const [places, setPlaces] = useState({ showHome: true, showStudents: true, enrollment: false });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(link, () => {
    if (!link) return;
    setTitle(current?.title ?? '');
    setUrl(current?.url ?? '');
    setDescription(current?.description ?? '');
    setVisible(current?.visible ?? true);
    setPlaces({
      showHome: current?.showHome ?? true,
      showStudents: current?.showStudents ?? true,
      enrollment: current?.enrollment ?? false,
    });
    setErrors({});
    setFormError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (visible && !places.showHome && !places.showStudents && !places.enrollment) {
      setFormError(
        'Elegí al menos un lugar donde se muestre el enlace, o cambiá «¿Se muestra en el sitio?» a «No».',
      );
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || null,
        visible,
        ...places,
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
        <fieldset className="flex flex-col gap-3 rounded-lg border border-accent-2 p-4">
          <legend className="px-1 text-sm font-semibold text-accent-3">
            ¿Dónde se muestra este enlace?
          </legend>
          <p className="text-font-strong">Podés marcar más de un lugar.</p>
          {LINK_PLACES.map((p) => (
            <Checkbox
              key={p.key}
              label={p.label}
              hint={p.hint}
              checked={places[p.key]}
              onCheckedChange={(v) => setPlaces((s) => ({ ...s, [p.key]: v }))}
            />
          ))}
        </fieldset>
        <Select
          label="¿Se muestra en el sitio?"
          hint="Si elegís «No», el enlace queda guardado pero nadie lo ve. No se pierde."
          value={visible ? 'si' : 'no'}
          onValueChange={(v) => setVisible(v === 'si')}
          options={[
            { value: 'si', label: 'Sí, se muestra' },
            { value: 'no', label: 'No, queda oculto' },
          ]}
        />
        {formError && Object.keys(errors).length === 0 && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
