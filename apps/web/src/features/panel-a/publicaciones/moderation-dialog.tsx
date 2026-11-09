'use client';

/**
 * Modal de moderación de una publicación de redes (RF04, US-07 a US-10; Figma "Moderar publicación de
 * red social", "Moderar y aprobar publicación", "Confirmación publicación" y "Confirmación descarte").
 * Lo usan el Resumen (botón "Moderar") y Publicaciones (Moderar / Ver detalle).
 *
 * Según el estado de la publicación de redes:
 *  - DETECTED (pendiente): formulario de aprobación. Aprobar y publicar -> POST /social/posts/:id/approve
 *    (ConfirmDialog antes). Descartar -> POST .../discard (ConfirmDialog).
 *  - DISCARDED: se puede Restaurar (POST .../restore) o, con permiso `social:delete`, Eliminar
 *    definitivamente (DELETE /social/posts/:id; solo descartadas, 409 si no).
 *  - LINKED: solo lectura (ya existe la publicación del sitio; para editarla/pausarla: "Propias del sitio").
 *
 * Reglas de la spec que se cumplen acá:
 *  - Nada de redes llega al sitio sin esta aprobación humana (AGENTS.md regla 4).
 *  - El consentimiento de imágenes con estudiantes es OBLIGATORIO (`consentConfirmed`, RNF08).
 *  - La sección puede ser Inicio, Novedades o ambas (`section` HOME | NEWS | BOTH).
 *  - Errores: 409 (otra persona ya la resolvió), 422 (fecha o categoría inválida), 502/422 si no se pudo
 *    copiar la imagen (no se crea nada y la publicación sigue pendiente). Si falla la IMAGEN (la API
 *    responde `imageProblem`), se explica la causa y se ofrece "Publicar sin imagen" (con confirmación):
 *    la foto nunca bloquea la publicación (RNF03).
 */
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { FileField, validateFile } from '../../panel-b/components/file-field';
import { ApiError, api } from '@/lib/api';
import { formatDateTimeAR } from '@/lib/dates';
import { deriveSummary, deriveTitle } from '../lib/caption';
import { orNull } from '../lib/dates';
import { toDisplayError } from '../lib/display-error';
import { fieldMessages, humanError } from '../lib/errors';
import type { SocialPostDto } from '../lib/types';
import { categoryOptions, NO_CATEGORY, useCategories } from '../lib/use-categories';
import { PostThumb } from './post-thumb';

interface Props {
  post: SocialPostDto | null;
  onClose: () => void;
  /** Se llama tras aprobar/descartar/restaurar/eliminar para que la pantalla recargue. */
  onChanged: () => void;
  /** Permiso `social:delete` (EDITOR y ADMIN). */
  canDelete?: boolean;
}

export function ModerationDialog({ post, onClose, onChanged, canDelete = false }: Props) {
  if (!post) return null;
  if (post.status === 'DETECTED')
    return <ReviewForm key={post.id} post={post} onClose={onClose} onChanged={onChanged} />;
  return (
    <DetailView
      key={post.id}
      post={post}
      onClose={onClose}
      onChanged={onChanged}
      canDelete={canDelete}
    />
  );
}

/** Vista previa de la publicación original (imagen, leyenda y enlace). */
function PostPreview({ post }: { post: SocialPostDto }) {
  return (
    <div className="flex gap-4 rounded-lg border border-accent-2 bg-base p-4">
      <PostThumb src={post.publication?.coverSrc ?? post.mediaUrl} className="h-24 w-24" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-font-strong">
          <span>
            {post.source === 'manual' ? 'Carga manual' : 'Instagram'} · publicada el{' '}
            {formatDateTimeAR(post.postedAt)}
          </span>
        </p>
        <p className="mt-1 line-clamp-4 whitespace-pre-line text-accent-3">{post.caption}</p>
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
        >
          Ver publicación original
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
      </div>
    </div>
  );
}

function ReviewForm({
  post,
  onClose,
  onChanged,
}: Pick<Props, 'onClose' | 'onChanged'> & { post: SocialPostDto }) {
  const { toast } = useToast();
  const categories = useCategories('PUBLICATION');
  const [title, setTitle] = useState(() => deriveTitle(post.caption));
  const [summary, setSummary] = useState(() => deriveSummary(post.caption));
  const [toNews, setToNews] = useState(true);
  const [toHome, setToHome] = useState(true);
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [visibleFrom, setVisibleFrom] = useState('');
  const [visibleUntil, setVisibleUntil] = useState('');
  const [consent, setConsent] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /** Mensaje de la API cuando la imagen no se pudo usar; habilita "Publicar sin imagen". */
  const [imageProblem, setImageProblem] = useState<string | null>(null);
  const [withoutImage, setWithoutImage] = useState(false);
  /** Imagen subida desde el equipo cuando la de Instagram no está disponible (ADR-045). */
  const [coverFile, setCoverFile] = useState<File | null>(null);
  /** Sin imagen que copiar (carga manual por enlace sin cuenta conectada) o la que había falló. */
  const imageNeeded = !post.mediaUrl || imageProblem !== null;

  /** Validación previa al diálogo de confirmación (la API repite las mismas reglas). */
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!toNews && !toHome) e.section = 'Elegí al menos un destino: Novedades, Inicio o ambos.';
    if (!consent)
      e.consentConfirmed =
        'Confirmá que existe consentimiento para publicar imágenes de estudiantes.';
    if (visibleFrom && visibleUntil && visibleUntil <= visibleFrom)
      e.visibleUntil = 'La fecha de fin debe ser posterior a la fecha de inicio.';
    setErrs(e);
    setFormError(null);
    return Object.keys(e).length === 0;
  }

  async function approve() {
    let publicationId: string;
    try {
      const out = await api.post<{ publication: { id: string } }>(
        `/social/posts/${post.id}/approve`,
        {
          title: title.trim() || null,
          summary: summary.trim() || null,
          section: toNews && toHome ? 'BOTH' : toHome ? 'HOME' : 'NEWS',
          categoryId: categoryId === NO_CATEGORY ? null : categoryId,
          visibleFrom: orNull(visibleFrom),
          visibleUntil: orNull(visibleUntil),
          consentConfirmed: true,
          // Con una imagen subida desde el equipo, primero se aprueba sin portada y después se sube (un paso para la persona).
          ...(withoutImage || coverFile ? { withoutImage: true } : {}),
        },
      );
      publicationId = out.publication.id;
    } catch (e) {
      if (e instanceof ApiError && typeof e.problem.imageProblem === 'string') {
        // La foto no se pudo usar: se explica la causa y se ofrece publicar sin imagen.
        setImageProblem(humanError(e));
        return;
      }
      if (
        e instanceof ApiError &&
        (e.status === 400 || e.status === 422) &&
        Object.keys(e.fieldErrors).length
      ) {
        // Errores de campo: se muestran en el formulario y se cierra la confirmación.
        setErrs(fieldMessages(e));
        setFormError(humanError(e));
        return;
      }
      if (e instanceof ApiError && e.status === 409) onChanged(); // otra persona la resolvió: refrescar
      throw toDisplayError(e);
    }
    if (coverFile && publicationId) {
      try {
        const fd = new FormData();
        fd.set('file', coverFile);
        await api.post(`/publications/${publicationId}/cover`, fd);
      } catch (e) {
        // La publicación ya está aprobada: se avisa y se puede cargar la imagen desde «Propias del sitio».
        toast({
          title: 'Publicación aprobada, pero sin imagen',
          description: `No pudimos subir la imagen (${humanError(e)}). Podés agregarla desde «Propias del sitio».`,
          tone: 'info',
        });
        onChanged();
        onClose();
        return;
      }
    }
    toast({
      title: 'Publicación aprobada',
      description: 'Ya se muestra en el sitio institucional.',
      tone: 'success',
    });
    onChanged();
    onClose();
  }

  async function discard() {
    try {
      await api.post(`/social/posts/${post.id}/discard`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onChanged();
      throw toDisplayError(e);
    }
    toast({
      title: 'Publicación descartada',
      description: 'No se muestra en el sitio. Podés recuperarla desde la pestaña Descartadas.',
      tone: 'success',
    });
    onChanged();
    onClose();
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title="Moderar contenido de red social"
        description="Revisá el contenido y definí si se muestra en el sitio, dónde y por cuánto tiempo."
        footer={
          <>
            <Button
              variant="ghost"
              className="text-danger-text sm:mr-auto"
              onClick={() => setConfirmDiscard(true)}
            >
              Descartar publicación
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (validate()) setConfirmPublish(true);
              }}
            >
              Aprobar y publicar en la web
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <PostPreview post={post} />
          {formError && (
            <p
              role="alert"
              className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text"
            >
              {formError}
            </p>
          )}
          {imageNeeded && !withoutImage && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-md bg-danger-back px-4 py-3 text-sm text-danger-text"
            >
              <p className="font-semibold">
                {imageProblem ? 'No se pudo usar la imagen' : 'Esta publicación no tiene imagen'}
              </p>
              <p>
                {imageProblem ??
                  'Instagram no dejó traerla sola (la cuenta no está conectada o la publicación no se encontró).'}
              </p>
              <FileField
                label="Subir la imagen desde tu equipo"
                file={coverFile}
                onChange={(f) => {
                  setCoverFile(f);
                  if (f && validateFile(f, true)) setCoverFile(null);
                }}
                imagesOnly
              />
              <div className="flex flex-wrap gap-2">
                {coverFile && (
                  <Button
                    onClick={() => {
                      setImageProblem(null);
                      if (validate()) setConfirmPublish(true);
                    }}
                  >
                    Publicar con esta imagen
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCoverFile(null);
                    setWithoutImage(true);
                    setImageProblem(null);
                    if (validate()) setConfirmPublish(true);
                  }}
                >
                  Publicar sin imagen
                </Button>
              </div>
            </div>
          )}
          {withoutImage && (
            <p className="rounded-md bg-surface px-3 py-2 text-sm text-accent-3">
              Se va a publicar <strong>sin imagen</strong>.{' '}
              <button
                type="button"
                className="font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
                onClick={() => setWithoutImage(false)}
              >
                Volver a intentar con la imagen
              </button>
            </p>
          )}
          <Input
            label="Título en el sitio"
            hint="Se arma con la primera oración de la leyenda; podés cambiarlo."
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errs.title}
          />
          <Textarea
            label="Resumen"
            hint="Texto breve que se ve en la tarjeta de Novedades."
            rows={3}
            maxLength={400}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            error={errs.summary}
          />
          <Select
            label="Categoría institucional"
            options={categoryOptions(categories)}
            value={categoryId}
            onValueChange={setCategoryId}
            error={errs.categoryId}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-accent-3">
              Destino en la plataforma web
            </legend>
            <div className="rounded-md border border-accent-2 bg-base p-3">
              <div className="flex flex-col gap-3">
                <Checkbox
                  label="Publicar en la pantalla Novedades"
                  checked={toNews}
                  onCheckedChange={(v) => setToNews(v === true)}
                />
                <Checkbox
                  label="Mostrar en el carrusel de novedades de Inicio"
                  checked={toHome}
                  onCheckedChange={(v) => setToHome(v === true)}
                />
              </div>
            </div>
            {errs.section && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {errs.section}
              </p>
            )}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Visible desde"
              type="date"
              hint="Vacío: se muestra desde que la aprobás."
              value={visibleFrom}
              onChange={(e) => setVisibleFrom(e.target.value)}
              error={errs.visibleFrom}
            />
            <Input
              label="Visible hasta"
              type="date"
              hint="Vacío: sin fecha de fin (no se vence sola)."
              value={visibleUntil}
              onChange={(e) => setVisibleUntil(e.target.value)}
              error={errs.visibleUntil}
            />
          </div>
          <Checkbox
            label="Confirmo que existe consentimiento para publicar imágenes de estudiantes"
            hint="Obligatorio (Ley 25.326). Queda registrado en la auditoría."
            required
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            error={errs.consentConfirmed}
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title="¿Publicar en el sitio?"
        description="La publicación se va a mostrar públicamente en las secciones elegidas."
        details={
          <>
            <strong>{title.trim() || deriveTitle(post.caption)}</strong>
            <br />
            Destino: {toNews && toHome ? 'Novedades e Inicio' : toHome ? 'Inicio' : 'Novedades'}
            {withoutImage && (
              <>
                <br />
                Sin imagen
              </>
            )}
          </>
        }
        confirmLabel="Sí, publicar"
        onConfirm={approve}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="¿Descartar esta publicación?"
        description="No se va a mostrar en el sitio. Podés recuperarla después desde Descartadas."
        details={<strong>{deriveTitle(post.caption)}</strong>}
        confirmLabel="Sí, descartar"
        tone="danger"
        onConfirm={discard}
      />
    </>
  );
}

/** Detalle de una publicación ya resuelta (vinculada o descartada). */
function DetailView({
  post,
  onClose,
  onChanged,
  canDelete,
}: Required<Pick<Props, 'onClose' | 'onChanged' | 'canDelete'>> & { post: SocialPostDto }) {
  const { toast } = useToast();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const discarded = post.status === 'DISCARDED';

  async function restore() {
    try {
      await api.post(`/social/posts/${post.id}/restore`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onChanged();
      throw toDisplayError(e);
    }
    toast({
      title: 'Publicación restaurada',
      description: 'Volvió a la lista de pendientes.',
      tone: 'success',
    });
    onChanged();
    onClose();
  }

  async function remove() {
    try {
      await api.delete(`/social/posts/${post.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onChanged();
      throw toDisplayError(e);
    }
    toast({ title: 'Publicación eliminada', tone: 'success' });
    onChanged();
    onClose();
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        size="md"
        title="Detalle de la publicación"
        description={
          discarded
            ? 'Está descartada: no se muestra en el sitio.'
            : 'Ya está aprobada y vinculada a una publicación del sitio.'
        }
        footer={
          <>
            {discarded && canDelete && (
              <Button
                variant="ghost"
                className="text-danger-text sm:mr-auto"
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar definitivamente
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            {discarded && <Button onClick={() => setConfirmRestore(true)}>Restaurar</Button>}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <PostPreview post={post} />
          <p className="flex flex-wrap items-center gap-2 text-sm text-font-strong">
            <Badge tone={discarded ? 'neutral' : 'success'}>
              {discarded ? 'Descartada' : 'Aprobada'}
            </Badge>
            {post.moderatedAt && (
              <span>
                {formatDateTimeAR(post.moderatedAt)}
                {post.moderatedByName ? ` · ${post.moderatedByName}` : ''}
              </span>
            )}
          </p>
          {post.publication && (
            <p className="text-sm text-accent-3">
              Publicación del sitio: <strong>{post.publication.title}</strong>. Para pausarla,
              editarla o eliminarla usá la pestaña «Propias del sitio».
            </p>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title="¿Restaurar la publicación?"
        description="Vuelve a la lista de pendientes para que decidas si se publica."
        confirmLabel="Sí, restaurar"
        onConfirm={restore}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar definitivamente?"
        description="Se borra la publicación de redes del panel. Esta acción no se puede deshacer y queda registrada."
        details={<strong>{deriveTitle(post.caption)}</strong>}
        tone="danger"
        confirmLabel="Sí, eliminar"
        onConfirm={remove}
      />
    </>
  );
}
