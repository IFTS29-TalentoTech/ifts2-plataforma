/**
 * Horarios · diálogo "Cargar nueva grilla" / "Actualizar archivo / comisiones" (Figma 195:444).
 *
 * Regla (RF06, US-13): un horario es una comisión + un archivo (PDF/imagen) de un ciclo. Se sube el
 * archivo con POST /documents (queda en el Archivo documental con su ciclo) y luego se crea o
 * actualiza el `Schedule` con el `documentId`. Si falla el segundo paso, el documento queda subido
 * pero sin uso: se puede reutilizar desde el Archivo (no se pierde nada).
 * Un horario nuevo nace SIN publicar: se publica con una confirmación aparte.
 */
'use client';

import { type ScheduleDto, type TermDto } from '@ifts2/shared';
import { useState, type FormEvent } from 'react';
import { Button, Dialog, Input, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { FileField, validateFile } from '../components/file-field';
import { uploadDocument } from '../lib/documents';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';

export function ScheduleDialog({
  open,
  onOpenChange,
  term,
  schedule,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: TermDto;
  /** Si viene, se edita; si no, se crea. */
  schedule?: ScheduleDto | null;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cada vez que se abre, el formulario arranca limpio o con los datos del horario editado.
  useResetOn(open ? (schedule?.id ?? 'nuevo') : 'cerrado', () => {
    if (!open) return;
    setName(schedule?.commissionName ?? '');
    setNotes(schedule?.notes ?? '');
    setFile(null);
    setErrors({});
    setFormError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (file && validateFile(file)) return;
    setSaving(true);
    try {
      let documentId = schedule?.documentId ?? undefined;
      if (file) {
        const doc = await uploadDocument(file, {
          title: `Horarios ${name.trim()} · ${term.label}`,
          kind: 'SCHEDULE',
          cycleYear: term.year,
          termLabel: term.label,
        });
        documentId = doc.id;
      }
      const body = {
        commissionName: name.trim(),
        notes: notes.trim() || null,
        ...(documentId ? { documentId } : {}),
      };
      if (schedule) await api.patch(`/schedules/${schedule.id}`, body);
      else await api.post('/schedules', { termId: term.id, ...body });
      onOpenChange(false);
      onSaved(schedule ? 'Horario actualizado.' : 'Horario cargado. Todavía no se publicó.');
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
      title={schedule ? 'Actualizar horarios' : 'Cargar nueva grilla de horarios'}
      description={`Ciclo ${term.label}. Subí el archivo oficial de la comisión.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="schedule-form" loading={saving}>
            {schedule ? 'Guardar cambios' : 'Cargar horario'}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Comisión"
          hint="Por ejemplo: Comisión A y B, Comisión Única, Prácticas Finales."
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.commissionName}
          required
          maxLength={80}
        />
        <Textarea
          label="Notas para el estudiante (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={errors.notes}
          rows={3}
          maxLength={1000}
        />
        <FileField
          label="Archivo de la grilla"
          file={file}
          onChange={setFile}
          error={errors.file?.[0] ?? errors.documentId?.[0]}
          current={schedule?.document?.filename}
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
