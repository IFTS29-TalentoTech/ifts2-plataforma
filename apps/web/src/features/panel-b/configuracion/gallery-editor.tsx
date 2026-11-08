/**
 * Configuración · Galerías (RF09, ADR-036): edita las diapositivas del carrusel "Vida en la cocina"
 * de Estudiantes y las fotos de La carrera.
 *
 * Reglas:
 * - Hasta 10 diapositivas por galería (la API responde 422 al pasarse; acá se deshabilita el botón).
 * - La foto se sube como archivo (JPG, PNG o WebP, 5 MB): la API la reduce a 1600 px y la guarda como WebP.
 * - Orden con botones "Subir" / "Bajar" (sin arrastrar: funciona con teclado y lectores de pantalla).
 * - Eliminar es manual y pide confirmación (ConfirmDialog único); queda en la auditoría.
 * - Categoría (RF09, US-30): texto corto y libre; el campo sugiere las ya usadas (datalist) para no
 *   repetirlas con otra grafía. Si alguna diapositiva de Estudiantes la tiene, el sitio muestra el filtro.
 * - Se muestra solo con el permiso `gallery:manage`; la API es la que protege (403).
 * - Ids fijos y sin `useId` en componentes nuevos (ver ADR-036): hay un solo formulario abierto a la vez.
 */
'use client';

import type { GalleryItemDto } from '@ifts2/shared';
import { ArrowDown, ArrowUp, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingRegion,
  Skeleton,
  Textarea,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { FileField, validateFile } from '../components/file-field';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';

type Area = GalleryItemDto['area'];

const AREAS: { area: Area; title: string; description: string }[] = [
  {
    area: 'STUDENTS',
    title: 'Vida en la cocina (Estudiantes)',
    description: 'Carrusel de la página Estudiantes: foto, título y descripción de cada tarjeta.',
  },
  {
    area: 'CAREER',
    title: 'Fotos de La carrera',
    description: 'Fotos junto al perfil profesional. Con más de una se muestran como carrusel.',
  },
];

interface GalleryList {
  items: GalleryItemDto[];
  max: number;
}

export function GalleryEditor() {
  const { toast } = useToast();
  const list = useResource<GalleryList>('/gallery');
  const [editing, setEditing] = useState<{ area: Area; item: GalleryItemDto | null } | null>(null);
  const [deleting, setDeleting] = useState<GalleryItemDto | null>(null);
  const [moving, setMoving] = useState(false);

  /** Mueve una diapositiva una posición y guarda el orden completo del área. */
  async function move(area: Area, items: GalleryItemDto[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setMoving(true);
    try {
      await api.put('/gallery/order', { area, ids });
      list.reload();
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
      list.reload(); // otra persona pudo haber cambiado la galería: se vuelve a leer
    } finally {
      setMoving(false);
    }
  }

  return (
    <section aria-labelledby="gallery-title" className="flex flex-col gap-8">
      <div>
        <h2 id="gallery-title" className="font-display text-xl font-bold text-accent-3">
          Galerías
        </h2>
        <p className="text-sm text-font-strong">
          Fotos que se muestran en el sitio. Las que vienen cargadas son provisorias: reemplazalas
          por las del instituto, con el consentimiento de las personas que aparecen.
        </p>
      </div>

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando galerías">
          <Skeleton className="h-32" />
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}

      {list.data &&
        AREAS.map(({ area, title, description }) => {
          const items = list.data!.items.filter((i) => i.area === area);
          const full = items.length >= list.data!.max;
          return (
            <div
              key={area}
              className="flex flex-col gap-3"
              role="group"
              aria-label={title}
              data-testid={`gallery-${area}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-accent-3">{title}</h3>
                  <p className="text-sm text-font-strong">
                    {description} ({items.length} de {list.data!.max})
                  </p>
                </div>
                <Button
                  onClick={() => setEditing({ area, item: null })}
                  disabled={full}
                  aria-label={`Agregar diapositiva a ${title}`}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Agregar diapositiva
                </Button>
              </div>
              {full && (
                <p className="text-xs text-font-strong">
                  Llegaste al máximo de diapositivas. Eliminá una para sumar otra.
                </p>
              )}
              {items.length === 0 ? (
                <EmptyState
                  title="Esta galería está vacía"
                  description="El sitio usa la imagen de respaldo de Configuración hasta que cargues una diapositiva."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {items.map((item, index) => (
                    <li key={item.id}>
                      <Card
                        data-testid="gallery-row"
                        className="flex flex-col gap-3 sm:flex-row sm:items-center"
                      >
                        <Thumb item={item} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-accent-3">
                            {item.title || 'Sin título'}
                          </p>
                          {item.caption && (
                            <p className="text-sm text-font-strong">{item.caption}</p>
                          )}
                          <p className="text-xs text-font-strong">
                            {item.category ? `Categoría: ${item.category} · ` : ''}
                            Posición {index + 1} de {items.length}
                            {item.alt ? ' · con texto alternativo' : ' · decorativa'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={index === 0 || moving}
                            onClick={() => move(area, items, index, -1)}
                            aria-label={`Subir la diapositiva ${item.title || index + 1}`}
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                            Subir
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={index === items.length - 1 || moving}
                            onClick={() => move(area, items, index, 1)}
                            aria-label={`Bajar la diapositiva ${item.title || index + 1}`}
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                            Bajar
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing({ area, item })}
                            aria-label={`Editar la diapositiva ${item.title || index + 1}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleting(item)}
                            aria-label={`Eliminar la diapositiva ${item.title || index + 1}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Eliminar
                          </Button>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

      <SlideDialog
        target={editing}
        knownCategories={[
          ...new Set((list.data?.items ?? []).map((i) => i.category).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b, 'es'))}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast({ tone: 'success', title: 'Diapositiva guardada.' });
          list.reload();
        }}
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          tone="danger"
          title="¿Eliminar esta diapositiva?"
          description="Se elimina la diapositiva y su foto del sitio. No se puede deshacer."
          details={<strong>{deleting.title || 'Diapositiva sin título'}</strong>}
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await api.delete(`/gallery/${deleting.id}`);
            toast({ tone: 'success', title: 'Diapositiva eliminada.' });
            list.reload();
          }}
        />
      )}
    </section>
  );
}

/** Miniatura de la foto; sin URL utilizable (almacenamiento caído) muestra un aviso en vez de romperse. */
function Thumb({ item }: { item: GalleryItemDto }) {
  return (
    <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent-2">
      {item.src ? (
        <Image
          src={item.src}
          alt=""
          width={112}
          height={80}
          unoptimized
          className="h-20 w-28 object-cover"
        />
      ) : (
        <span className="flex flex-col items-center text-xs text-font-strong">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          Sin foto
        </span>
      )}
    </div>
  );
}

function SlideDialog({
  target,
  knownCategories,
  onClose,
  onSaved,
}: {
  target: { area: Area; item: GalleryItemDto | null } | null;
  /** Categorías ya usadas, para sugerirlas en el campo. */
  knownCategories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const item = target?.item ?? null;
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [alt, setAlt] = useState('');
  const [category, setCategory] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(target ? (item?.id ?? `nueva-${target.area}`) : 'cerrado', () => {
    if (!target) return;
    setTitle(item?.title ?? '');
    setCaption(item?.caption ?? '');
    setAlt(item?.alt ?? '');
    setCategory(item?.category ?? '');
    setFile(null);
    setErrors({});
    setFormError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErrors({});
    setFormError(null);
    if (!item && !file) {
      setErrors({ file: ['Elegí la foto de la diapositiva.'] });
      return;
    }
    const fileError = file ? validateFile(file, true) : null;
    if (fileError) {
      setErrors({ file: [fileError] });
      return;
    }
    setSaving(true);
    try {
      const texts = {
        title: title.trim(),
        caption: caption.trim(),
        alt: alt.trim(),
        category: category.trim(),
      };
      if (item) {
        await api.patch(`/gallery/${item.id}`, texts);
        if (file) {
          const fd = new FormData();
          fd.set('file', file);
          await api.post(`/gallery/${item.id}/image`, fd);
        }
      } else {
        const fd = new FormData();
        fd.set('area', target.area);
        for (const [k, v] of Object.entries(texts)) fd.set(k, v);
        // El archivo va al final: algunos parsers multipart leen primero los campos de texto.
        fd.set('file', file!);
        await api.post('/gallery', fd);
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

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={item ? 'Editar diapositiva' : 'Nueva diapositiva'}
      description="La foto se reduce y se guarda optimizada. Los textos son opcionales."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="gallery-form" loading={saving}>
            Guardar diapositiva
          </Button>
        </>
      }
    >
      <form id="gallery-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FileField
          label={item ? 'Cambiar la foto (opcional)' : 'Foto'}
          file={file}
          onChange={setFile}
          error={errors.file?.[0]}
          imagesOnly
          current={item ? 'foto actual' : null}
        />
        <Input
          label="Título (opcional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          hint="Hasta 80 caracteres. Se muestra sobre la foto."
        />
        <Textarea
          label="Descripción (opcional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          error={errors.caption}
          rows={2}
          hint="Hasta 200 caracteres."
        />
        <Input
          label="Categoría (opcional)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          error={errors.category}
          list="gallery-categories"
          autoComplete="off"
          hint="Una palabra o dos, hasta 40 caracteres (por ejemplo, Eventos). Con categorías, el sitio muestra un filtro."
        />
        <datalist id="gallery-categories">
          {knownCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Input
          label="Texto alternativo (opcional)"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          error={errors.alt}
          hint="Describí la foto para quien no la puede ver. Si la dejás vacía, se toma como decorativa."
        />
        {formError && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
