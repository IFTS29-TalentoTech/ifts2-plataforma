/**
 * Panel · Galerías (RF09, ADR-036, ADR-041): el administrador crea galerías de fotos con nombre, les sube
 * fotos y después las agrega a una página desde "Páginas del sitio". Es el ÚNICO lugar donde se editan
 * galerías (antes también estaban como pestaña de Configuración).
 *
 * Reglas:
 * - Hasta 10 fotos por galería (la API responde 422 al pasarse; acá se deshabilita el botón).
 * - La foto se sube como archivo (JPG, PNG o WebP, 5 MB): la API la reduce a 1600 px y la guarda como WebP.
 * - Orden con botones "Mover arriba" / "Mover abajo" (sin arrastrar: funciona con teclado y lectores de pantalla).
 * - Eliminar una foto o una galería es manual y pide confirmación (ConfirmDialog único); queda en la
 *   auditoría. Una galería que está en una página no se puede eliminar hasta quitarla de esa página.
 * - Categoría (RF09, US-30): texto corto y libre; sugiere las ya usadas (datalist) para no repetirlas con
 *   otra grafía. Si alguna foto la tiene, el sitio muestra el filtro.
 * - Se muestra solo con el permiso `gallery:manage`; la API es la que protege (403).
 * - Ids fijos y sin `useId` en componentes nuevos (ver ADR-036): hay un solo formulario abierto a la vez.
 */
'use client';

import { SITE_PAGE_LABELS, type GalleryDto, type GalleryItemDto } from '@ifts2/shared';
import { ArrowDown, ArrowUp, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
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

interface GalleryList {
  galleries: GalleryDto[];
  max: number;
}

export function GalleryEditor({ canPages = false }: { canPages?: boolean }) {
  const { toast } = useToast();
  const list = useResource<GalleryList>('/gallery');
  const [naming, setNaming] = useState<GalleryDto | 'new' | null>(null);
  const [photo, setPhoto] = useState<{ gallery: GalleryDto; item: GalleryItemDto | null } | null>(
    null,
  );
  const [deletingPhoto, setDeletingPhoto] = useState<GalleryItemDto | null>(null);
  const [deletingGallery, setDeletingGallery] = useState<GalleryDto | null>(null);
  const [moving, setMoving] = useState(false);

  /** Mueve una foto una posición y guarda el orden completo de la galería. */
  async function move(gallery: GalleryDto, index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= gallery.items.length) return;
    const ids = gallery.items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setMoving(true);
    try {
      await api.put(`/gallery/${gallery.id}/order`, { ids });
      list.reload();
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
      list.reload(); // otra persona pudo haber cambiado la galería: se vuelve a leer
    } finally {
      setMoving(false);
    }
  }

  const galleries = list.data?.galleries ?? [];
  const max = list.data?.max ?? 10;
  const knownCategories = [
    ...new Set(galleries.flatMap((g) => g.items.map((i) => i.category)).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'es'));

  return (
    <section aria-labelledby="gallery-title" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2 id="gallery-title" className="font-display text-lg font-bold text-accent-3">
            Mis galerías de fotos
          </h2>
          <p className="text-sm text-font-strong">
            Creá una galería, subile las fotos y después elegí en qué página se muestra desde
            «Páginas del sitio». Las fotos que vienen cargadas son provisorias: reemplazalas por las
            del instituto, con el consentimiento de las personas que aparecen.
          </p>
        </div>
        <Button size="lg" onClick={() => setNaming('new')}>
          <Plus className="h-5 w-5" aria-hidden="true" />
          Crear galería
        </Button>
      </div>

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando galerías">
          <Skeleton className="h-32" />
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}
      {list.data && galleries.length === 0 && (
        <EmptyState
          title="Todavía no hay galerías"
          description="Tocá «Crear galería» para armar la primera."
        />
      )}

      {galleries.map((gallery) => {
        const items = gallery.items;
        const full = items.length >= max;
        return (
          <Card
            key={gallery.id}
            className="flex flex-col gap-4"
            role="group"
            aria-label={`Galería ${gallery.name}`}
            data-testid="gallery-card"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-accent-3">{gallery.name}</h3>
                <p className="text-sm text-font-strong">
                  {items.length} de {max} fotos
                </p>
                <p className="text-sm text-font-strong" data-testid="gallery-pages">
                  {gallery.pages.length > 0 ? (
                    <>
                      Se ve en {gallery.pages.length === 1 ? 'la página' : 'las páginas'}:{' '}
                      <strong>{gallery.pages.map((p) => SITE_PAGE_LABELS[p]).join(', ')}</strong>.
                    </>
                  ) : (
                    <>Todavía no se ve en ninguna página.</>
                  )}
                  {canPages && (
                    <>
                      {' '}
                      <Link href="/panel/paginas" className="font-semibold text-accent underline">
                        Agregar a una página
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setPhoto({ gallery, item: null })}
                  disabled={full}
                  aria-label={`Agregar foto a ${gallery.name}`}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Agregar foto
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setNaming(gallery)}
                  aria-label={`Cambiar nombre: ${gallery.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Cambiar nombre
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setDeletingGallery(gallery)}
                  aria-label={`Eliminar galería: ${gallery.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Eliminar galería
                </Button>
              </div>
            </div>
            {full && (
              <p className="text-sm text-font-strong">
                Llegaste al máximo de fotos. Eliminá una para sumar otra.
              </p>
            )}
            {items.length === 0 ? (
              <EmptyState
                title="Esta galería está vacía"
                description="Tocá «Agregar foto» para subir la primera."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {items.map((item, index) => (
                  <li key={item.id}>
                    <div
                      data-testid="gallery-row"
                      className="flex flex-col gap-3 rounded-lg border border-accent-2 bg-base p-3 sm:flex-row sm:items-center"
                    >
                      <Thumb item={item} />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-accent-3">
                          {item.title || 'Sin título'}
                        </p>
                        {item.caption && <p className="text-sm text-font-strong">{item.caption}</p>}
                        <p className="text-sm text-font-strong">
                          {item.category ? `Categoría: ${item.category} · ` : ''}
                          Foto {index + 1} de {items.length}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={index === 0 || moving}
                          onClick={() => move(gallery, index, -1)}
                          aria-label={`Subir la foto ${item.title || index + 1}`}
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          Subir
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={index === items.length - 1 || moving}
                          onClick={() => move(gallery, index, 1)}
                          aria-label={`Bajar la foto ${item.title || index + 1}`}
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          Bajar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPhoto({ gallery, item })}
                          aria-label={`Editar la foto ${item.title || index + 1}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingPhoto(item)}
                          aria-label={`Eliminar la foto ${item.title || index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}

      <NameDialog
        target={naming}
        onClose={() => setNaming(null)}
        onSaved={() => {
          toast({ tone: 'success', title: 'Galería guardada.' });
          list.reload();
        }}
      />
      <PhotoDialog
        target={photo}
        knownCategories={knownCategories}
        onClose={() => setPhoto(null)}
        onSaved={() => {
          toast({ tone: 'success', title: 'Foto guardada.' });
          list.reload();
        }}
      />
      {deletingPhoto && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeletingPhoto(null)}
          tone="danger"
          title="¿Eliminar esta foto?"
          description="Se elimina la foto de la galería y del sitio. No se puede deshacer."
          details={<strong>{deletingPhoto.title || 'Foto sin título'}</strong>}
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await api.delete(`/gallery/items/${deletingPhoto.id}`);
            toast({ tone: 'success', title: 'Foto eliminada.' });
            list.reload();
          }}
        />
      )}
      {deletingGallery && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeletingGallery(null)}
          tone="danger"
          title="¿Eliminar esta galería?"
          description="Se elimina la galería con todas sus fotos. No se puede deshacer. Si se muestra en una página, primero hay que quitarla de ahí."
          details={<strong>{deletingGallery.name}</strong>}
          confirmLabel="Eliminar galería"
          onConfirm={async () => {
            await api.delete(`/gallery/${deletingGallery.id}`);
            toast({ tone: 'success', title: 'Galería eliminada.' });
            list.reload();
          }}
        />
      )}
    </section>
  );
}

/** Crear o cambiar el nombre de una galería. */
function NameDialog({
  target,
  onClose,
  onSaved,
}: {
  target: GalleryDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = target && target !== 'new' ? target : null;
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(target ? (current?.id ?? 'nueva') : 'cerrado', () => {
    setName(current?.name ?? '');
    setError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Escribí un nombre para la galería.');
      return;
    }
    setSaving(true);
    try {
      if (current) await api.patch(`/gallery/${current.id}`, { name: name.trim() });
      else await api.post('/gallery', { name: name.trim() });
      onClose();
      onSaved();
    } catch (err) {
      setError(fieldErrors(err).name?.[0] ?? errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={current ? 'Cambiar el nombre de la galería' : 'Crear una galería'}
      description="El nombre se ve como título de la galería en la página donde la muestres."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="gallery-name-form" loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="gallery-name-form" onSubmit={submit} noValidate>
        <Input
          label="Nombre de la galería"
          hint="Por ejemplo: Vida en la cocina, Egresados 2026."
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error ? [error] : undefined}
          maxLength={80}
          autoComplete="off"
        />
      </form>
    </Dialog>
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

function PhotoDialog({
  target,
  knownCategories,
  onClose,
  onSaved,
}: {
  target: { gallery: GalleryDto; item: GalleryItemDto | null } | null;
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

  useResetOn(target ? (item?.id ?? `nueva-${target.gallery.id}`) : 'cerrado', () => {
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
      setErrors({ file: ['Elegí la foto.'] });
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
        await api.patch(`/gallery/items/${item.id}`, texts);
        if (file) {
          const fd = new FormData();
          fd.set('file', file);
          await api.post(`/gallery/items/${item.id}/image`, fd);
        }
      } else {
        const fd = new FormData();
        for (const [k, v] of Object.entries(texts)) fd.set(k, v);
        // El archivo va al final: algunos parsers multipart leen primero los campos de texto.
        fd.set('file', file!);
        await api.post(`/gallery/${target.gallery.id}/items`, fd);
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
      title={item ? 'Editar foto' : 'Agregar una foto'}
      description="La foto se reduce y se guarda optimizada. Los textos son opcionales."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="gallery-form" loading={saving}>
            Guardar foto
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
