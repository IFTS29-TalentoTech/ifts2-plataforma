/**
 * Configuración · Contenido de las páginas estancas (RF01/RF02, US-25): Institucional, La carrera
 * e Ingreso. Cada página es una lista de secciones (título + cuerpo en Markdown acotado + orden +
 * visibilidad), editables sin tocar código.
 *
 * Reglas:
 * - `PUT /content/:page/:slug` crea (201) o reemplaza (200). El cuerpo se sanitiza en la API (sin HTML
 *   crudo); la vista previa de acá solo es una guía.
 * - Ocultar NO borra. Eliminar (`DELETE`) solo existe para secciones ocultas y pide confirmación.
 * - Solo ADMIN (`content:manage`): los textos institucionales los aprueba la dirección.
 */
'use client';

import {
  CONTENT_PAGES,
  can,
  type ContentPage,
  type ContentSectionDto,
  type Role,
} from '@ifts2/shared';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
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
  Select,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { MarkdownPreview } from '../components/markdown-preview';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';

const PAGE_LABELS: Record<ContentPage, string> = {
  institucional: 'Institucional',
  carrera: 'La carrera',
  ingreso: 'Ingreso',
};

export function ContentEditor({ role }: { role: Role }) {
  const { toast } = useToast();
  const [page, setPage] = useState<ContentPage>('institucional');
  const list = useResource<{ page: string; items: ContentSectionDto[] }>(`/content/${page}`);
  const [editing, setEditing] = useState<ContentSectionDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ContentSectionDto | null>(null);
  const canDelete = can(role, 'content:delete');

  return (
    <section aria-labelledby="content-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="content-title" className="font-display text-xl font-bold text-accent-3">
            Contenido de las páginas
          </h2>
          <p className="text-sm text-font-strong">
            Editá los textos del sitio. Las secciones ocultas no se muestran; no se pierden.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva sección
        </Button>
      </div>
      <Select
        className="sm:max-w-xs"
        label="Página"
        value={page}
        onValueChange={(v) => setPage(v as ContentPage)}
        options={CONTENT_PAGES.map((p) => ({ value: p, label: PAGE_LABELS[p] }))}
      />

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando secciones">
          <Skeleton className="h-20" />
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}
      {list.data && list.data.items.length === 0 && (
        <EmptyState
          title="Esta página no tiene secciones"
          description="Creá la primera sección para que aparezca en el sitio."
        />
      )}
      <ul className="flex flex-col gap-3">
        {list.data?.items.map((s) => (
          <li key={s.id}>
            <Card
              data-testid="content-row"
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-accent-3">
                  {s.title}
                  <Badge tone={s.visible ? 'success' : 'neutral'}>
                    {s.visible ? 'Visible' : 'Oculta'}
                  </Badge>
                </p>
                <p className="text-xs text-font-strong">
                  Orden {s.order} · identificador: {s.slug}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(s)}
                  aria-label={`Editar la sección ${s.title}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Editar
                </Button>
                {canDelete && !s.visible && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleting(s)}
                    aria-label={`Eliminar la sección ${s.title}`}
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

      <SectionDialog
        page={page}
        section={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast({ tone: 'success', title: 'Sección guardada.' });
          list.reload();
        }}
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          tone="danger"
          title="¿Eliminar esta sección?"
          description="Se elimina definitivamente. Si solo querés que no se vea, dejala oculta."
          details={<strong>{deleting.title}</strong>}
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await api.delete(`/content/${page}/${deleting.slug}`);
            toast({ tone: 'success', title: 'Sección eliminada.' });
            list.reload();
          }}
        />
      )}
    </section>
  );
}

function SectionDialog({
  page,
  section,
  onClose,
  onSaved,
}: {
  page: ContentPage;
  section: ContentSectionDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = section === 'new';
  const current = section && section !== 'new' ? section : null;
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [order, setOrder] = useState('0');
  const [visible, setVisible] = useState(true);
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(section, () => {
    if (!section) return;
    setSlug(current?.slug ?? '');
    setTitle(current?.title ?? '');
    setBody(current?.body ?? '');
    setOrder(String(current?.order ?? 0));
    setVisible(current?.visible ?? true);
    setPreview(false);
    setErrors({});
    setFormError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await api.put(`/content/${page}/${isNew ? slug.trim() : current!.slug}`, {
        title: title.trim(),
        body,
        order: Number(order) || 0,
        visible,
      });
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
      open={!!section}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={isNew ? 'Nueva sección' : 'Editar sección'}
      description={`Página: ${PAGE_LABELS[page]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="section-form" loading={saving}>
            Guardar sección
          </Button>
        </>
      }
    >
      <form id="section-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {isNew && (
          <Input
            label="Identificador"
            hint="Sin espacios ni tildes, por ejemplo: sobre-el-instituto."
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            error={errors.slug}
            required
          />
        )}
        <Input
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-accent-3">Texto</span>
            <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? (
                <>
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                  Volver a editar
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Vista previa
                </>
              )}
            </Button>
          </div>
          {preview ? (
            <div
              data-testid="md-preview"
              className="min-h-32 rounded-md border border-accent-2 bg-base p-4"
            >
              {body.trim() ? (
                <MarkdownPreview source={body} />
              ) : (
                <p className="text-sm">Sin texto.</p>
              )}
            </div>
          ) : (
            <Textarea
              label="Cuerpo en Markdown"
              hint="Podés usar # títulos, **negrita**, *cursiva*, listas con - y enlaces [texto](https://…)."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              error={errors.body}
              rows={10}
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <Input
            label="Orden"
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            error={errors.order}
          />
          <Switch label="Visible en el sitio" checked={visible} onCheckedChange={setVisible} />
        </div>
        {formError && Object.keys(errors).length === 0 && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
