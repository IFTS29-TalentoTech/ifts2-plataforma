'use client';

/**
 * Alta y edición de una publicación PROPIA del sitio (RF03/RF04, US-10).
 * Crear: POST /publications (queda en BORRADOR; después se publica o programa desde la lista).
 * Editar: PATCH /publications/:id. Portada opcional: POST /publications/:id/cover (multipart, JPG/PNG/WebP,
 * hasta 5 MB; el servidor la comprime). Errores por campo de la API (400/422) se muestran debajo de cada campo.
 * El PATCH NO reenvía `coverUrl` (la portada solo cambia subiendo un archivo), y la subida manda la portada
 * que vio el formulario: si otra persona la cambió en el medio, la API responde 409 y no pisa nada (A10).
 */
import { useState, type FormEvent } from 'react';
import { Button, Dialog, Input, Select, Textarea, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { orNull, toInputDate } from '../lib/dates';
import { fieldMessages, humanError } from '../lib/errors';
import type { PublicationDto } from '../lib/types';
import { categoryOptions, NO_CATEGORY, useCategories } from '../lib/use-categories';

const SECTIONS = [
  { value: 'BOTH', label: 'Inicio y Novedades' },
  { value: 'NEWS', label: 'Solo Novedades' },
  { value: 'HOME', label: 'Solo Inicio' },
];

export function PublicationFormDialog({
  open,
  publication,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** null = crear una nueva. */
  publication: PublicationDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  if (!open) return null;
  return (
    <Form
      key={publication?.id ?? 'nueva'}
      publication={publication}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}

function Form({
  publication,
  onOpenChange,
  onSaved,
}: {
  publication: PublicationDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const categories = useCategories('PUBLICATION');
  const [title, setTitle] = useState(publication?.title ?? '');
  const [summary, setSummary] = useState(publication?.summary ?? '');
  const [body, setBody] = useState(publication?.body ?? '');
  const [categoryId, setCategoryId] = useState(publication?.categoryId ?? NO_CATEGORY);
  const [section, setSection] = useState<string>(publication?.section ?? 'BOTH');
  const [visibleFrom, setVisibleFrom] = useState(toInputDate(publication?.visibleFrom));
  const [visibleUntil, setVisibleUntil] = useState(toInputDate(publication?.visibleUntil));
  const [cover, setCover] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrs({});
    setFormError(null);
    setLoading(true);
    const payload = {
      title,
      summary,
      body,
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      section,
      visibleFrom: orNull(visibleFrom),
      visibleUntil: orNull(visibleUntil),
    };
    try {
      const saved = publication
        ? await api.patch<PublicationDto>(`/publications/${publication.id}`, payload)
        : await api.post<PublicationDto>('/publications', payload);
      if (cover) {
        const fd = new FormData();
        // Precondición (A10): la portada que este formulario vio al abrirse ("" = no tenía). Si alguien
        // la cambió mientras tanto, la API responde 409 en lugar de pisarla. Va antes del archivo.
        fd.append('expectedCoverUrl', (publication ? publication.coverUrl : saved.coverUrl) ?? '');
        fd.append('file', cover);
        try {
          await api.post(`/publications/${saved.id}/cover`, fd);
        } catch (err) {
          toast({
            title: 'Se guardó, pero la portada no se pudo subir',
            description: humanError(err),
            tone: 'error',
          });
        }
      }
      toast({
        title: publication ? 'Cambios guardados' : 'Publicación creada como borrador',
        description: publication ? undefined : 'Publicala o programala desde la lista.',
        tone: 'success',
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setLoading(false);
      const fields = fieldMessages(err);
      setErrs(fields);
      if (Object.keys(fields).length === 0) setFormError(humanError(err));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      size="lg"
      title={publication ? 'Editar publicación' : 'Nueva publicación'}
      description="Completá los datos que se van a ver en Inicio y Novedades."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="form-publicacion" loading={loading}>
            {publication ? 'Guardar cambios' : 'Crear borrador'}
          </Button>
        </>
      }
    >
      <form id="form-publicacion" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
        <Input
          label="Título"
          required
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errs.title}
        />
        <Textarea
          label="Resumen"
          required
          rows={3}
          maxLength={400}
          hint="Texto breve que se ve en la tarjeta."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          error={errs.summary}
        />
        <Textarea
          label="Texto completo"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          error={errs.body}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Categoría"
            options={categoryOptions(categories)}
            value={categoryId}
            onValueChange={setCategoryId}
            error={errs.categoryId}
          />
          <Select
            label="Dónde se muestra"
            options={SECTIONS}
            value={section}
            onValueChange={setSection}
            error={errs.section}
          />
          <Input
            label="Visible desde"
            type="date"
            value={visibleFrom}
            onChange={(e) => setVisibleFrom(e.target.value)}
            error={errs.visibleFrom}
          />
          <Input
            label="Visible hasta"
            type="date"
            hint="Vacío: no se vence sola."
            value={visibleUntil}
            onChange={(e) => setVisibleUntil(e.target.value)}
            error={errs.visibleUntil}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="portada" className="text-sm font-semibold text-accent-3">
            Imagen de portada (opcional)
          </label>
          <input
            id="portada"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setCover(e.target.files?.[0] ?? null)}
            className="text-sm text-accent-3 file:mr-3 file:rounded-md file:border-0 file:bg-accent-2 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-accent-3 focus-visible:outline-none focus-visible:shadow-focus"
          />
          <p className="text-xs text-font-strong">JPG, PNG o WebP de hasta 5 MB.</p>
        </div>
      </form>
    </Dialog>
  );
}
