'use client';

/**
 * Carga manual de una publicación de redes (RNF03, E2E-05): contingencia para cuando la sincronización con
 * Instagram falla o el token venció. POST /social/manual { permalink, caption?, postedAt? } -> 201 (un solo campo: enlace de
 * la publicación de Instagram o dirección de una imagen de otro sitio, ADR-045):
 * la publicación queda PENDIENTE y sigue el mismo flujo de moderación (aprobación humana, consentimiento).
 * 409 = ese enlace ya está cargado. La imagen se copia al almacenamiento propio recién al aprobar.
 */
import { useState, type FormEvent } from 'react';
import { Button, Dialog, Input, Textarea, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { fieldMessages, humanError } from '../lib/errors';

export function ManualPostDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  if (!open) return null;
  return <Form onOpenChange={onOpenChange} onCreated={onCreated} />;
}

function Form({
  onOpenChange,
  onCreated,
}: {
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [permalink, setPermalink] = useState('');
  const [caption, setCaption] = useState('');
  const [postedAt, setPostedAt] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrs({});
    setFormError(null);
    setLoading(true);
    try {
      const out = await api.post<{
        resolution?: { source: 'instagram' | 'none'; imageFound: boolean; reason?: string };
      }>('/social/manual', {
        permalink,
        ...(caption.trim() ? { caption } : {}),
        ...(postedAt ? { postedAt } : {}),
      });
      const r = out.resolution;
      toast({
        title: 'Publicación cargada',
        description:
          r?.source === 'instagram'
            ? 'La encontramos en Instagram y trajimos la imagen y el texto. Quedó pendiente: moderala para publicarla.'
            : r?.reason
              ? `Quedó pendiente. ${r.reason} Al aprobarla vas a poder subir la imagen desde tu equipo.`
              : 'Quedó pendiente: moderala para publicarla en el sitio.',
        tone: 'success',
      });
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setLoading(false);
      const fields = fieldMessages(err);
      if (err instanceof ApiError && err.status === 409) fields.permalink = humanError(err);
      setErrs(fields);
      if (Object.keys(fields).length === 0) setFormError(humanError(err));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Cargar publicación manualmente"
      description="Usalo cuando la sincronización con Instagram no funcione. Pegá los datos de la publicación."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="form-carga-manual" loading={loading}>
            Cargar publicación
          </Button>
        </>
      }
    >
      <form id="form-carga-manual" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
        <Input
          label="Enlace de la publicación o dirección de la imagen"
          type="url"
          required
          hint="Pegá el enlace de la publicación de Instagram, o la dirección de una imagen de otro sitio. De Instagram solo se puede copiar el enlace de la publicación: si la cuenta está conectada, traemos sola la imagen, la leyenda y la fecha."
          placeholder="https://www.instagram.com/p/…"
          value={permalink}
          onChange={(e) => setPermalink(e.target.value)}
          error={errs.permalink}
        />
        <Textarea
          label="Leyenda (texto de la publicación)"
          hint="Se trae sola si la cuenta de Instagram está conectada. Si no, escribila o pegala acá."
          rows={4}
          maxLength={2200}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          error={errs.caption}
        />
        <Input
          label="Fecha de publicación (opcional)"
          type="date"
          hint="Si la dejás vacía se usa la de Instagram o la de hoy."
          value={postedAt}
          onChange={(e) => setPostedAt(e.target.value)}
          error={errs.postedAt}
        />
      </form>
    </Dialog>
  );
}
