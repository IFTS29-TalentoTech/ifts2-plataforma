'use client';

/**
 * Pide la vigencia para PROGRAMAR (POST /publications/:id/schedule: `visibleFrom` futura obligatoria) o
 * REACTIVAR (POST /publications/:id/reactivate) una publicación propia.
 * Regla (publications/README): una publicación VENCIDA exige una nueva fecha de fin futura (422); una pausada
 * con vigencia abierta se reactiva sin fechas. Las fechas `yyyy-mm-dd` se interpretan en Buenos Aires.
 */
import { useState, type FormEvent } from 'react';
import { Button, Dialog, Input, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { orNull } from '../lib/dates';
import { fieldMessages, humanError } from '../lib/errors';
import type { PublicationDto } from '../lib/types';

export type VigenciaMode = 'schedule' | 'reactivate';

export function VigenciaDialog({
  publication,
  mode,
  onClose,
  onDone,
}: {
  publication: PublicationDto | null;
  mode: VigenciaMode;
  onClose: () => void;
  onDone: () => void;
}) {
  if (!publication) return null;
  return (
    <Form
      key={`${publication.id}:${mode}`}
      publication={publication}
      mode={mode}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

function Form({
  publication,
  mode,
  onClose,
  onDone,
}: {
  publication: PublicationDto;
  mode: VigenciaMode;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scheduling = mode === 'schedule';
  const needsUntil = !scheduling && publication.expired;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (scheduling && !from) local.visibleFrom = 'Elegí la fecha desde la que se va a mostrar.';
    if (needsUntil && !until) local.visibleUntil = 'Está vencida: elegí una nueva fecha de fin.';
    setErrs(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    setLoading(true);
    try {
      await api.post(`/publications/${publication.id}/${mode}`, {
        visibleFrom: orNull(from),
        visibleUntil: orNull(until),
      });
      toast({
        title: scheduling ? 'Publicación programada' : 'Publicación reactivada',
        tone: 'success',
      });
      onDone();
      onClose();
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
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={scheduling ? 'Programar publicación' : 'Reactivar publicación'}
      description={
        scheduling
          ? 'Elegí desde qué día se va a mostrar en el sitio.'
          : needsUntil
            ? 'Esta publicación está vencida. Para reactivarla definí una nueva fecha de fin.'
            : 'La publicación vuelve a mostrarse en el sitio.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="form-vigencia" loading={loading}>
            {scheduling ? 'Programar' : 'Reactivar'}
          </Button>
        </>
      }
    >
      <form id="form-vigencia" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-accent-3">{publication.title}</p>
        {formError && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
        <Input
          label="Visible desde"
          type="date"
          required={scheduling}
          hint={scheduling ? 'Tiene que ser una fecha futura.' : 'Opcional.'}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          error={errs.visibleFrom}
        />
        <Input
          label="Visible hasta"
          type="date"
          required={needsUntil}
          hint={needsUntil ? undefined : 'Vacío: sin fecha de fin.'}
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          error={errs.visibleUntil}
        />
      </form>
    </Dialog>
  );
}
