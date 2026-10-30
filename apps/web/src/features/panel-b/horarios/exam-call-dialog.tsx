/**
 * Horarios · diálogo "Configurar nuevo llamado" / "Editar llamado a examen" (Figma 207:522, 189:163).
 *
 * Reglas (RF06, US-14/15, BUILD-NOTES 4):
 * - El llamado se carga por ARCHIVO (cronograma PDF) y fechas; no hay calendario interactivo.
 * - `enrollmentOpen`: inscripción SIU Guaraní habilitada para este llamado.
 * - `highlighted` ("destacar"): lo muestra el Inicio como próximo evento mientras no termine.
 * - Un llamado nuevo nace sin publicar; la publicación pide confirmación aparte.
 * Las fechas son de calendario (yyyy-mm-dd, hora de Buenos Aires): la API toma el inicio y el fin del día.
 */
'use client';

import { toDateStrBA, type ExamCallDto, type TermDto } from '@ifts2/shared';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Dialog, Input, Switch, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { FileField, validateFile } from '../components/file-field';
import { uploadDocument } from '../lib/documents';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';

export function ExamCallDialog({
  open,
  onOpenChange,
  term,
  call,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: TermDto;
  call?: ExamCallDto | null;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(open ? (call?.id ?? 'nuevo') : 'cerrado', () => {
    if (!open) return;
    setName(call?.name ?? '');
    setStartsOn(call ? toDateStrBA(new Date(call.startsOn)) : '');
    setEndsOn(call ? toDateStrBA(new Date(call.endsOn)) : '');
    setEnrollmentOpen(call?.enrollmentOpen ?? false);
    setHighlighted(call?.highlighted ?? false);
    setNotes(call?.notes ?? '');
    setFile(null);
    setErrors({});
    setFormError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (file && validateFile(file)) return;
    // Validación mínima en pantalla; las reglas completas las aplica la API (zod compartido).
    const local: Record<string, string[]> = {};
    if (!name.trim()) local.name = ['Escribí el nombre del llamado.'];
    if (!startsOn) local.startsOn = ['Elegí la fecha de inicio.'];
    if (!endsOn) local.endsOn = ['Elegí la fecha de fin.'];
    if (startsOn && endsOn && endsOn < startsOn) {
      local.endsOn = ['La fecha de fin no puede ser anterior a la de inicio.'];
    }
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setSaving(true);
    try {
      let documentId = call?.documentId ?? undefined;
      if (file) {
        const doc = await uploadDocument(file, {
          title: `Cronograma de mesas · ${name.trim()}`,
          kind: 'EXAM_CALENDAR',
          cycleYear: term.year,
          termLabel: term.label,
        });
        documentId = doc.id;
      }
      const body = {
        name: name.trim(),
        startsOn,
        endsOn,
        enrollmentOpen,
        highlighted,
        notes: notes.trim() || null,
        ...(documentId ? { documentId } : {}),
      };
      if (call) await api.patch(`/exam-calls/${call.id}`, body);
      else await api.post('/exam-calls', { termId: term.id, ...body });
      onOpenChange(false);
      onSaved(call ? 'Llamado actualizado.' : 'Llamado creado. Todavía no se publicó.');
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
      title={call ? 'Editar llamado a examen' : 'Configurar nuevo llamado'}
      description="Cargá los plazos de inscripción en SIU Guaraní y el cronograma general en PDF."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="exam-call-form" loading={saving}>
            {call ? 'Guardar cambios' : 'Crear llamado'}
          </Button>
        </>
      }
    >
      <form id="exam-call-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Denominación del turno"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          required
          maxLength={160}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Apertura SIU Guaraní"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            error={errors.startsOn}
            required
          />
          <Input
            label="Cierre SIU Guaraní"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            error={errors.endsOn}
            required
          />
        </div>
        <Switch
          label="Inscripción abierta"
          hint="Indica en el sitio que ya se puede anotar en SIU Guaraní."
          checked={enrollmentOpen}
          onCheckedChange={setEnrollmentOpen}
        />
        <Checkbox
          label="Destacar en el Inicio del sitio"
          hint="Se muestra como próximo evento hasta que termine el llamado."
          checked={highlighted}
          onCheckedChange={setHighlighted}
        />
        <Textarea
          label="Notas (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={errors.notes}
          rows={3}
          maxLength={1000}
        />
        <FileField
          label="Cronograma oficial de tribunales y aulas (PDF)"
          file={file}
          onChange={setFile}
          error={errors.file?.[0] ?? errors.documentId?.[0]}
          current={call?.document?.filename}
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
