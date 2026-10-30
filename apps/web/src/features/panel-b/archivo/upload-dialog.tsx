/**
 * Archivo · diálogo "Archivar nuevo documento" (RF03, US-16).
 *
 * Sube el archivo con sus metadatos (título, tipo, categoría, ciclo, código de resolución) y,
 * por defecto, lo deja ARCHIVADO de inmediato: el caso típico es guardar documentación histórica
 * (resoluciones, cronogramas de ciclos anteriores). Desmarcando la casilla queda como documento
 * vigente, listo para adjuntar a un aviso, horario o llamado.
 * Los errores de tipo (415) o tamaño (413) vuelven con mensaje humano y no crean nada (E2E-15).
 */
'use client';

import { DOCUMENT_KINDS, type DocumentDto, type DocumentKind } from '@ifts2/shared';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Dialog, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { FileField, validateFile } from '../components/file-field';
import { uploadDocument } from '../lib/documents';
import { errorText, fieldErrors, KIND_OPTIONS } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';

export function UploadDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (doc: DocumentDto, archived: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DocumentKind>('RESOLUTION');
  const [category, setCategory] = useState('');
  const [cycleYear, setCycleYear] = useState('');
  const [termLabel, setTermLabel] = useState('');
  const [resolutionCode, setResolutionCode] = useState('');
  const [archiveNow, setArchiveNow] = useState(true);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(open, () => {
    if (!open) return;
    setFile(null);
    setTitle('');
    setKind('RESOLUTION');
    setCategory('');
    setCycleYear('');
    setTermLabel('');
    setResolutionCode('');
    setArchiveNow(true);
    setErrors({});
    setFormError(null);
  });

  function pick(f: File | null) {
    setFile(f);
    // Sugiere el título a partir del nombre del archivo (sin extensión) si todavía no escribieron uno.
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (!file) {
      setErrors({ file: ['Elegí el archivo que querés guardar.'] });
      return;
    }
    if (validateFile(file)) return;
    if (!title.trim()) {
      setErrors({ title: ['Escribí un título para el documento.'] });
      return;
    }
    setSaving(true);
    try {
      let doc = await uploadDocument(file, {
        title: title.trim(),
        kind,
        category: category.trim() || undefined,
        cycleYear: cycleYear ? Number(cycleYear) : null,
        termLabel: termLabel.trim() || undefined,
        resolutionCode: resolutionCode.trim() || undefined,
      });
      if (archiveNow) doc = await api.post<DocumentDto>(`/documents/${doc.id}/archive`, {});
      onOpenChange(false);
      onSaved(doc, archiveNow);
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
      title="Archivar nuevo documento"
      description="Guardá un documento con sus datos para poder encontrarlo después."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="upload-form" loading={saving}>
            Guardar documento
          </Button>
        </>
      }
    >
      <form id="upload-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FileField label="Archivo" file={file} onChange={pick} error={errors.file?.[0]} />
        <Input
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
          maxLength={200}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo de documento"
            value={kind}
            onValueChange={(v) => setKind(v as DocumentKind)}
            options={KIND_OPTIONS.filter((o) => DOCUMENT_KINDS.includes(o.value))}
            error={errors.kind}
          />
          <Input
            label="Categoría (opcional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={errors.category}
            maxLength={80}
          />
          <Input
            label="Ciclo lectivo (año)"
            type="number"
            inputMode="numeric"
            placeholder="2025"
            value={cycleYear}
            onChange={(e) => setCycleYear(e.target.value)}
            error={errors.cycleYear}
          />
          <Input
            label="Cuatrimestre (opcional)"
            placeholder="2.º cuatrimestre"
            value={termLabel}
            onChange={(e) => setTermLabel(e.target.value)}
            error={errors.termLabel}
            maxLength={40}
          />
        </div>
        <Input
          label="Código de resolución (opcional)"
          value={resolutionCode}
          onChange={(e) => setResolutionCode(e.target.value)}
          error={errors.resolutionCode}
          maxLength={80}
        />
        <Checkbox
          label="Archivar ahora"
          hint="El documento queda en el Archivo histórico y no se muestra en el sitio."
          checked={archiveNow}
          onCheckedChange={setArchiveNow}
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
