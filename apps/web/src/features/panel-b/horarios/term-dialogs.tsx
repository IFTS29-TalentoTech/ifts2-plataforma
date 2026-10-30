/**
 * Horarios · alta de ciclos y "Cambiar ciclo lectivo público" (Figma 189:194).
 *
 * Reglas (RF06, US-13, ADR de ciclos):
 * - Solo UN ciclo es el "público vigente": el sitio muestra únicamente los horarios y llamados de ese ciclo.
 * - Cambiarlo (`PUT /terms/:id/public-current`) es solo ADMIN y siempre pide confirmación explícita.
 *   El ciclo anterior NO se borra: sus horarios dejan de mostrarse y quedan en el Archivo.
 * - Un ciclo nuevo (`POST /terms`) nace NO público; no cambia nada en el sitio hasta que se lo elija acá.
 */
'use client';

import { TERM_KIND_LABELS, TERM_KINDS, type TermDto, type TermKind } from '@ifts2/shared';
import { useState, type FormEvent } from 'react';
import { Button, ConfirmDialog, Dialog, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';

export function NewTermDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (term: TermDto) => void;
}) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [kind, setKind] = useState<TermKind>('FIRST');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(open, () => {
    if (open) {
      setErrors({});
      setFormError(null);
    }
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const term = await api.post<TermDto>('/terms', { year: Number(year), kind });
      onOpenChange(false);
      onCreated(term);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Nuevo ciclo lectivo"
      description="Un ciclo nuevo no se muestra en el sitio hasta que lo elijas como ciclo público."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="term-form" loading={saving}>
            Crear ciclo
          </Button>
        </>
      }
    >
      <form id="term-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Año lectivo"
          type="number"
          inputMode="numeric"
          min={2000}
          max={2100}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          error={errors.year}
          required
        />
        <Select
          label="Período"
          value={kind}
          onValueChange={(v) => setKind(v as TermKind)}
          options={TERM_KINDS.map((k) => ({ value: k, label: TERM_KIND_LABELS[k] }))}
          error={errors.kind}
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

/**
 * Dos pasos: elegir el ciclo y confirmar. Se resuelve con un Dialog de elección y, al continuar,
 * el ConfirmDialog único del proyecto (con la explicación del impacto).
 */
export function ChangePublicTermDialog({
  open,
  onOpenChange,
  terms,
  current,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: TermDto[];
  current: TermDto | undefined;
  onChanged: (term: TermDto) => void;
}) {
  const candidates = terms.filter((t) => !t.publicCurrent);
  const [targetId, setTargetId] = useState('');
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');

  useResetOn(open, () => {
    if (open) {
      setStep('choose');
      setTargetId(candidates[0]?.id ?? '');
    }
  });

  const target = terms.find((t) => t.id === targetId);

  return (
    <>
      <Dialog
        open={open && step === 'choose'}
        onOpenChange={onOpenChange}
        size="sm"
        title="Cambiar ciclo lectivo público"
        description="Elegí qué ciclo ven los estudiantes en el sitio."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={!target} onClick={() => setStep('confirm')}>
              Continuar
            </Button>
          </>
        }
      >
        {candidates.length === 0 ? (
          <p className="text-sm text-font-strong">
            No hay otro ciclo para elegir. Creá primero un ciclo nuevo.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-font-strong">
              Ciclo público actual: <strong>{current?.label ?? 'ninguno'}</strong>
            </p>
            <Select
              label="Nuevo ciclo público"
              value={targetId}
              onValueChange={setTargetId}
              options={candidates.map((t) => ({ value: t.id, label: t.label }))}
            />
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={open && step === 'confirm'}
        onOpenChange={(o) => {
          if (!o) onOpenChange(false);
        }}
        tone="danger"
        icon="warning"
        title="¿Cambiar el ciclo público?"
        description={
          <>
            El sitio pasará a mostrar solo los horarios y llamados de{' '}
            <strong>{target?.label}</strong>. Los de{' '}
            <strong>{current?.label ?? 'el ciclo anterior'}</strong> dejan de verse en el sitio y
            quedan guardados en el Archivo.
          </>
        }
        confirmLabel="Sí, cambiar ciclo"
        onConfirm={async () => {
          if (!target) return;
          const updated = await api.put<TermDto>(`/terms/${target.id}/public-current`);
          onChanged(updated);
        }}
      />
    </>
  );
}
