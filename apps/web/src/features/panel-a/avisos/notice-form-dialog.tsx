'use client';

/**
 * Alta y edición de un aviso académico (RF03/RF06, US-11, US-33, US-36; Figma "Publicar nuevo aviso
 * académico" / "Formulario nuevo-editar" + "Confirmación publicación"). Lo usan Avisos y el Resumen
 * ("Crear nuevo aviso formal").
 *
 * Flujo: validación en línea -> diálogo de confirmación -> (si hay archivo) POST /documents -> POST|PATCH /notices.
 *  - Adjunto: se sube con POST /documents (multipart, kind NOTICE_ATTACHMENT; PDF hasta 10 MB, imagen hasta
 *    5 MB, la firma real del archivo se valida en el servidor: 413/415 se muestran como error del campo) y el
 *    `id` resultante viaja como `attachmentId`. Si el aviso falla después de subir, el documento ya subido se
 *    reutiliza al reintentar (no se duplica).
 *  - Vigencia: `visibleFrom` vacío = desde ahora; `visibleUntil` vacío = sin fecha de fin. Las fechas
 *    `yyyy-mm-dd` son días de Buenos Aires. Un aviso vencido NO se borra solo: se reactiva o se elimina a mano.
 *  - "Urgente" lo pone primero con la etiqueta Urgente; "Destacar" lo resalta como próximo evento en Inicio y
 *    Estudiantes hasta su fecha (reunión del 06/10).
 *  - Errores por campo de la API (400/422) se muestran debajo de cada campo (`ApiError.fieldErrors`).
 */
import { Paperclip, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import {
  NOTICE_AUDIENCES,
  type DocumentDto,
  type NoticeAudience,
  type NoticeDto,
} from '@ifts2/shared';
import { orNull, toInputDate } from '../lib/dates';
import { toDisplayError } from '../lib/display-error';
import { fieldMessages, humanError } from '../lib/errors';
import { categoryOptions, NO_CATEGORY, useCategories } from '../lib/use-categories';

export const AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  ALL: 'Toda la comunidad',
  STUDENTS: 'Estudiantes',
  ASPIRANTS: 'Aspirantes',
  GRADUATES: 'Graduados',
};
const AUDIENCE_OPTIONS = NOTICE_AUDIENCES.map((a) => ({ value: a, label: AUDIENCE_LABELS[a] }));

export function NoticeFormDialog({
  open,
  notice,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** null = aviso nuevo. */
  notice: NoticeDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  if (!open) return null;
  return (
    <Form
      key={notice?.id ?? 'nuevo'}
      notice={notice}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}

function Form({
  notice,
  onOpenChange,
  onSaved,
}: {
  notice: NoticeDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const categories = useCategories('NOTICE');
  const [title, setTitle] = useState(notice?.title ?? '');
  const [body, setBody] = useState(notice?.body ?? '');
  const [categoryId, setCategoryId] = useState(notice?.categoryId ?? NO_CATEGORY);
  const [audience, setAudience] = useState<string>(notice?.audience ?? 'ALL');
  const [visibleFrom, setVisibleFrom] = useState(toInputDate(notice?.visibleFrom));
  const [visibleUntil, setVisibleUntil] = useState(toInputDate(notice?.visibleUntil));
  const [urgent, setUrgent] = useState(notice?.urgent ?? false);
  const [highlighted, setHighlighted] = useState(notice?.highlighted ?? false);
  // Adjunto: el existente (se puede quitar) y/o un archivo nuevo elegido; `uploaded` evita subirlo dos veces.
  const [attachment, setAttachment] = useState(notice?.attachment ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<DocumentDto | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'El título es obligatorio.';
    if (!body.trim()) e.body = 'El texto del aviso es obligatorio.';
    if (visibleFrom && visibleUntil && visibleUntil <= visibleFrom)
      e.visibleUntil = 'La fecha de fin debe ser posterior a la fecha de inicio.';
    setErrs(e);
    setFormError(null);
    return Object.keys(e).length === 0;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (validate()) setConfirming(true);
  }

  async function save() {
    let attachmentId: string | null = notice ? (attachment?.id ?? null) : null;
    if (file) {
      try {
        let doc = uploaded;
        if (!doc) {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('title', `Adjunto: ${title.trim()}`.slice(0, 200));
          fd.append('kind', 'NOTICE_ATTACHMENT');
          doc = await api.post<DocumentDto>('/documents', fd);
          setUploaded(doc);
        }
        attachmentId = doc.id;
      } catch (e) {
        setErrs({ file: humanError(e) });
        return; // cierra la confirmación; el error queda en el campo del archivo
      }
    }
    const payload = {
      title,
      body,
      categoryId: categoryId === NO_CATEGORY ? null : categoryId,
      audience,
      urgent,
      highlighted,
      visibleFrom: orNull(visibleFrom),
      visibleUntil: orNull(visibleUntil),
      attachmentId,
    };
    try {
      if (notice) await api.patch<NoticeDto>(`/notices/${notice.id}`, payload);
      else await api.post<NoticeDto>('/notices', payload);
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.status === 400 || e.status === 422) &&
        Object.keys(e.fieldErrors).length
      ) {
        setErrs(fieldMessages(e));
        setFormError(humanError(e));
        return;
      }
      throw toDisplayError(e);
    }
    toast({
      title: notice ? 'Cambios guardados' : 'Aviso publicado',
      description: notice ? undefined : 'Ya se muestra en la cartelera de Estudiantes.',
      tone: 'success',
    });
    onSaved();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={onOpenChange}
        size="lg"
        title={notice ? 'Editar aviso académico' : 'Publicar nuevo aviso académico'}
        description="Completá los datos del comunicado oficial para la cartelera web."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-aviso">
              {notice ? 'Guardar cambios' : 'Publicar aviso'}
            </Button>
          </>
        }
      >
        <form id="form-aviso" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError && (
            <p
              role="alert"
              className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text"
            >
              {formError}
            </p>
          )}
          <Input
            label="Título del comunicado"
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errs.title}
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
              label="Destinatarios"
              options={AUDIENCE_OPTIONS}
              value={audience}
              onValueChange={setAudience}
              error={errs.audience}
            />
          </div>
          <Textarea
            label="Contenido del aviso"
            required
            rows={5}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={errs.body}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Visible desde"
              type="date"
              hint="Vacío: se muestra desde que lo publicás."
              value={visibleFrom}
              onChange={(e) => setVisibleFrom(e.target.value)}
              error={errs.visibleFrom}
            />
            <Input
              label="Visible hasta"
              type="date"
              hint="Vacío: sin fecha de fin. Al vencer sale del sitio pero queda en el panel."
              value={visibleUntil}
              onChange={(e) => setVisibleUntil(e.target.value)}
              error={errs.visibleUntil}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="aviso-adjunto" className="text-sm font-semibold text-accent-3">
              Archivo adjunto (opcional)
            </label>
            {attachment && !file && (
              <p className="flex items-center gap-2 rounded-md bg-base px-3 py-2 text-sm text-accent-3">
                <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="flex items-center gap-1 rounded-sm text-xs font-semibold text-danger-text underline focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  Quitar adjunto
                </button>
              </p>
            )}
            <input
              id="aviso-adjunto"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setUploaded(null);
                setErrs((p) => ({ ...p, file: '' }));
              }}
              aria-invalid={errs.file ? true : undefined}
              aria-describedby="aviso-adjunto-ayuda"
              className="text-sm text-accent-3 file:mr-3 file:rounded-md file:border-0 file:bg-accent-2 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-accent-3 focus-visible:outline-none focus-visible:shadow-focus"
            />
            <p id="aviso-adjunto-ayuda" className="text-xs text-font-strong">
              PDF de hasta 10 MB, o imagen JPG, PNG o WebP de hasta 5 MB.
            </p>
            {errs.file && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                <span className="sr-only">Error: </span>
                {errs.file}
              </p>
            )}
            {errs.attachmentId && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {errs.attachmentId}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-accent-2 bg-base p-3">
            <Checkbox
              label="Marcar como urgente"
              hint="Aparece primero en la cartelera con la etiqueta Urgente."
              checked={urgent}
              onCheckedChange={(v) => setUrgent(v === true)}
            />
            <Checkbox
              label="Destacar como próximo evento"
              hint="Se resalta en Inicio y Estudiantes hasta que termine su vigencia."
              checked={highlighted}
              onCheckedChange={(v) => setHighlighted(v === true)}
            />
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={notice ? '¿Guardar los cambios del aviso?' : '¿Publicar el aviso?'}
        description={
          notice
            ? 'Los cambios se ven de inmediato en la cartelera.'
            : 'El aviso se va a mostrar de inmediato en la cartelera de Estudiantes.'
        }
        details={
          <>
            <strong>{title.trim()}</strong>
            <br />
            Para: {AUDIENCE_LABELS[audience as NoticeAudience]}
            {visibleUntil ? ` · hasta el ${visibleUntil.split('-').reverse().join('/')}` : ''}
          </>
        }
        confirmLabel={notice ? 'Sí, guardar' : 'Sí, publicar'}
        onConfirm={save}
      />
    </>
  );
}
