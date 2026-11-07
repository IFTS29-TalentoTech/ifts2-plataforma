/**
 * Plantel docente (RF10, US-29, ADR-037): alta, edición, orden, baja lógica y eliminación manual.
 *
 * Reglas:
 * - "Ocultar" es la baja lógica: la persona deja de verse en Institucional pero se conserva. Solo
 *   las personas OCULTAS se pueden eliminar (la API responde 409 si sigue visible; acá el botón
 *   "Eliminar" recién aparece al ocultarla). Eliminar pide confirmación (ConfirmDialog único) y queda
 *   en la auditoría.
 * - Materias a cargo: una por línea (hasta 12); la API recorta, quita vacías y repetidas.
 * - Foto opcional (JPG, PNG o WebP, 5 MB). Es un dato personal (Ley 25.326): el formulario recuerda
 *   que hace falta el consentimiento de la persona.
 * - Orden con botones "Subir" / "Bajar" (sin arrastrar: funciona con teclado y lectores de pantalla).
 * - Ids fijos y sin `useId` en componentes nuevos (ver ADR-036): hay un solo formulario abierto a la vez.
 * - Se muestra solo con el permiso `teachers:manage`; la API es la que protege (403).
 */
'use client';

import { TEACHER_MAX_SUBJECTS, type TeacherDto } from '@ifts2/shared';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
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
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { FileField, validateFile } from '../components/file-field';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';

interface TeacherList {
  items: TeacherDto[];
}

export function TeachersEditor() {
  const { toast } = useToast();
  const list = useResource<TeacherList>('/teachers');
  const [editing, setEditing] = useState<{ item: TeacherDto | null } | null>(null);
  const [deleting, setDeleting] = useState<TeacherDto | null>(null);
  const [busy, setBusy] = useState(false);

  /** Mueve a una persona una posición y guarda el orden completo. */
  async function move(items: TeacherDto[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(true);
    try {
      await api.put('/teachers/order', { ids });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    } finally {
      list.reload(); // si otra persona cambió el plantel, se vuelve a leer
      setBusy(false);
    }
  }

  /** Ocultar / mostrar: la baja lógica no pide confirmación porque no borra nada y se revierte. */
  async function toggleVisible(t: TeacherDto) {
    setBusy(true);
    try {
      await api.patch(`/teachers/${t.id}`, { visible: !t.visible });
      toast({
        tone: 'success',
        title: t.visible ? 'Se ocultó del sitio.' : 'Se muestra en el sitio.',
      });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    } finally {
      list.reload();
      setBusy(false);
    }
  }

  const items = list.data?.items ?? [];

  return (
    <section aria-labelledby="teachers-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="teachers-title" className="font-display text-xl font-bold text-accent-3">
            Plantel docente
          </h2>
          <p className="text-sm text-font-strong">
            Personas y materias a cargo que se muestran en Institucional. Las ocultas no se ven en
            el sitio y son las únicas que se pueden eliminar.
          </p>
        </div>
        <Button onClick={() => setEditing({ item: null })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Agregar docente
        </Button>
      </div>

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando el plantel">
          <Skeleton className="h-32" />
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}

      {list.data &&
        (items.length === 0 ? (
          <EmptyState
            title="Todavía no hay docentes cargados"
            description="Cuando cargues al menos uno visible, aparece la sección Plantel docente en Institucional."
          />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="teachers-list">
            {items.map((t, index) => (
              <li key={t.id}>
                <Card
                  data-testid="teacher-row"
                  className="flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                  <Thumb teacher={t} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-accent-3">
                      {t.name}
                      <Badge tone={t.visible ? 'success' : 'neutral'}>
                        {t.visible ? 'Visible' : 'Oculta'}
                      </Badge>
                    </p>
                    {t.role && <p className="text-sm text-font-strong">{t.role}</p>}
                    <p className="text-sm text-font-strong">
                      {t.subjects.length > 0
                        ? `Materias: ${t.subjects.join(' · ')}`
                        : 'Sin materias cargadas'}
                    </p>
                    <p className="text-xs text-font-strong">
                      Posición {index + 1} de {items.length}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={index === 0 || busy}
                      onClick={() => move(items, index, -1)}
                      aria-label={`Subir a ${t.name}`}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      Subir
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={index === items.length - 1 || busy}
                      onClick={() => move(items, index, 1)}
                      aria-label={`Bajar a ${t.name}`}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      Bajar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing({ item: t })}
                      aria-label={`Editar a ${t.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Editar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => toggleVisible(t)}
                      aria-label={`${t.visible ? 'Ocultar' : 'Mostrar'} a ${t.name}`}
                    >
                      {t.visible ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                      {t.visible ? 'Ocultar' : 'Mostrar'}
                    </Button>
                    {!t.visible && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(t)}
                        aria-label={`Eliminar a ${t.name}`}
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
        ))}

      <TeacherDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast({ tone: 'success', title: 'Docente guardado.' });
          list.reload();
        }}
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          tone="danger"
          title="¿Eliminar a esta persona del plantel?"
          description="Se elimina el registro y su foto. No se puede deshacer. Si solo querés que no se vea, dejala oculta."
          details={<strong>{deleting.name}</strong>}
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await api.delete(`/teachers/${deleting.id}`);
            toast({ tone: 'success', title: 'Docente eliminado.' });
            list.reload();
          }}
        />
      )}
    </section>
  );
}

/** Miniatura de la foto; sin foto (o con el almacenamiento caído) muestra un aviso en vez de romperse. */
function Thumb({ teacher }: { teacher: TeacherDto }) {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-accent-2">
      {teacher.photoSrc ? (
        <Image
          src={teacher.photoSrc}
          alt=""
          width={64}
          height={64}
          unoptimized
          className="h-16 w-16 object-cover"
        />
      ) : (
        <span className="flex flex-col items-center text-xs text-font-strong">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Sin foto</span>
        </span>
      )}
    </div>
  );
}

function TeacherDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { item: TeacherDto | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const item = target?.item ?? null;
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [subjects, setSubjects] = useState('');
  const [visible, setVisible] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(target ? (item?.id ?? 'nueva') : 'cerrado', () => {
    if (!target) return;
    setName(item?.name ?? '');
    setRole(item?.role ?? '');
    setSubjects((item?.subjects ?? []).join('\n'));
    setVisible(item?.visible ?? true);
    setFile(null);
    setRemovePhoto(false);
    setErrors({});
    setFormError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErrors({});
    setFormError(null);
    if (!name.trim()) {
      setErrors({ name: ['El nombre es obligatorio.'] });
      return;
    }
    const fileError = file ? validateFile(file, true) : null;
    if (fileError) {
      setErrors({ file: [fileError] });
      return;
    }
    const body = {
      name: name.trim(),
      role: role.trim(),
      subjects: subjects.split('\n').map((s) => s.trim()),
      visible,
    };
    setSaving(true);
    try {
      let id = item?.id;
      if (item) await api.patch(`/teachers/${item.id}`, body);
      else id = (await api.post<TeacherDto>('/teachers', body)).id;
      if (file) {
        const fd = new FormData();
        fd.set('file', file);
        await api.post(`/teachers/${id}/photo`, fd);
      } else if (item && removePhoto && item.photo) {
        await api.delete(`/teachers/${item.id}/photo`);
      }
      onClose();
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const hasPhoto = !!item?.photo && !removePhoto;

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={item ? 'Editar docente' : 'Nuevo docente'}
      description="El nombre es obligatorio. Lo demás es opcional."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="teacher-form" loading={saving}>
            Guardar docente
          </Button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Nombre y apellido"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoComplete="off"
        />
        <Input
          label="Cargo (opcional)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          error={errors.role}
          hint="Por ejemplo, Profesora o Jefe de área. Hasta 80 caracteres."
          autoComplete="off"
        />
        <Textarea
          label="Materias a cargo (opcional)"
          value={subjects}
          onChange={(e) => setSubjects(e.target.value)}
          error={errors.subjects}
          rows={4}
          hint={`Una materia por línea, hasta ${TEACHER_MAX_SUBJECTS}.`}
        />
        <Switch
          id="teacher-visible"
          label="Visible en el sitio"
          hint="Si la ocultás, no se ve en Institucional y podés eliminarla."
          checked={visible}
          onCheckedChange={setVisible}
        />
        <FileField
          label={hasPhoto ? 'Cambiar la foto (opcional)' : 'Foto (opcional)'}
          file={file}
          onChange={setFile}
          error={errors.file?.[0]}
          imagesOnly
          current={hasPhoto ? 'foto actual' : null}
        />
        {item?.photo && !file && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setRemovePhoto((v) => !v)}>
              {removePhoto ? 'Conservar la foto actual' : 'Quitar la foto'}
            </Button>
          </div>
        )}
        <p className="text-xs text-font-strong">
          La foto es un dato personal (Ley 25.326): cargala solo si la persona dio su consentimiento
          para que se publique.
        </p>
        {formError && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
