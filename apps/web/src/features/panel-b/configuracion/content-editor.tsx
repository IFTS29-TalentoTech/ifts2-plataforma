/**
 * Panel · Páginas del sitio (RF01/RF02, US-25, ADR-041, ADR-042).
 *
 * Para cada página del sitio se listan sus BLOQUES en el orden real en que se ven de arriba hacia abajo
 * (catálogo `PAGE_LAYOUT` de @ifts2/shared). Cada bloque dice qué es y cómo se ve, y tiene su interruptor
 * «Mostrar en el sitio: Sí / No». Tres clases de bloque:
 * - FIJOS (los trae el sitio: encabezado, avisos, contacto, tarjetas de la semilla…): se muestran u
 *   ocultan y se editan, pero NO se eliminan (si se eliminaran no podrían recrearse).
 * - DE OTRA PANTALLA (avisos, horarios, novedades, plantel, enlaces): se explica dónde se cargan y un
 *   botón lleva allí; acá solo se muestran u ocultan.
 * - AGREGADOS por una persona (texto extra o galería de fotos): se editan, se suben o bajan y se
 *   eliminan (manual, con confirmación y solo si están ocultos; una galería quitada de la página no
 *   se borra: sigue en «Galerías»).
 * Mostrar u ocultar no pide confirmación (se deshace con el mismo interruptor); eliminar sí.
 * Solo con `content:manage`; para elegir galería hace falta además `gallery:manage`.
 */
'use client';

import {
  PAGE_LAYOUT,
  SITE_PAGES,
  SITE_PAGE_LABELS,
  SITE_PAGE_PATHS,
  can,
  fixedSectionInfo,
  isFixedSection,
  isHeaderSection,
  type ContentSectionDto,
  type ContentSectionKind,
  type GalleryDto,
  type PageBlockDef,
  type PermissionList,
  type SitePage,
} from '@ifts2/shared';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  Images,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Type,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  ErrorState,
  Input,
  LoadingRegion,
  Select,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { MarkdownPreview } from '../components/markdown-preview';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';
import { PageSettingsDialog, hasPageSettings } from './page-settings-dialog';

interface ContentList {
  page: string;
  items: ContentSectionDto[];
  /** Bloques fijos ocultos (ajuste `hidden_blocks`). */
  hidden: string[];
}

/** Una fila de la lista: un bloque fijo (con su sección, si la tiene) o una sección de texto/galería. */
type Row =
  | { type: 'block'; def: PageBlockDef; section?: ContentSectionDto }
  | { type: 'section'; section: ContentSectionDto; group: ContentSectionDto[] };

/** Arma las filas de la página en el orden real del sitio (ver `PAGE_LAYOUT`). */
function buildRows(page: SitePage, items: ContentSectionDto[]): Row[] {
  const sorted = [...items].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  const headers = sorted.filter((s) => isHeaderSection(page, s.slug));
  const text = sorted.filter((s) => s.kind === 'TEXT' && !isHeaderSection(page, s.slug));
  const galleries = sorted.filter((s) => s.kind === 'GALLERY');
  const rows: Row[] = [];
  for (const slot of PAGE_LAYOUT[page]) {
    if (slot.type === 'block') {
      const section = slot.block.source === 'seccion' ? headers[0] : undefined;
      rows.push({ type: 'block', def: slot.block, section });
    } else {
      const group = slot.type === 'sections' ? text : galleries;
      for (const section of group) rows.push({ type: 'section', section, group });
    }
  }
  return rows;
}

export function ContentEditor({ perms }: { perms: PermissionList }) {
  const { toast } = useToast();
  const [page, setPage] = useState<SitePage>('inicio');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const list = useResource<ContentList>(`/content/${page}`);
  const canGalleries = can(perms, 'gallery:manage');
  const galleries = useResource<{ galleries: GalleryDto[] }>(canGalleries ? '/gallery' : null);
  const [editing, setEditing] = useState<ContentSectionDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ContentSectionDto | null>(null);
  const [busy, setBusy] = useState(false);
  const canDelete = can(perms, 'content:delete');
  const galleryName = (id: string | null) =>
    galleries.data?.galleries.find((g) => g.id === id)?.name ?? 'galería';

  const items = list.data?.page === page ? list.data.items : [];
  const hidden = list.data?.page === page ? list.data.hidden : [];
  const rows = list.data?.page === page ? buildRows(page, items) : [];
  const nextOrder = items.reduce((max, s) => Math.max(max, s.order), 0) + 1;

  /** Ejecuta un cambio y recarga; los errores se avisan sin romper la pantalla. */
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast({ tone: 'success', title: success });
    } catch (e) {
      toast({ tone: 'error', title: errorText(e) });
    } finally {
      setBusy(false);
      list.reload();
    }
  }

  const setSectionVisible = (s: ContentSectionDto, visible: boolean) =>
    run(
      () => api.patch(`/content/${page}/${s.slug}`, { visible }),
      visible ? 'Ahora se muestra en el sitio.' : 'Ahora está oculta: no se ve en el sitio.',
    );
  const setBlockVisible = (id: string, visible: boolean) =>
    run(
      () => api.put(`/content/blocks/${id}`, { visible }),
      visible ? 'Ahora se muestra en el sitio.' : 'Ahora está oculto: no se ve en el sitio.',
    );
  const move = (group: ContentSectionDto[], index: number, delta: -1 | 1) => {
    const slugs = group.map((s) => s.slug);
    [slugs[index], slugs[index + delta]] = [slugs[index + delta]!, slugs[index]!];
    return run(() => api.put(`/content/${page}/order`, { slugs }), 'Orden guardado.');
  };

  return (
    <section aria-labelledby="pages-choose" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 id="pages-choose" className="font-display text-xl font-bold text-accent-3">
          ¿Qué página querés cambiar?
        </h2>
        <div role="group" aria-labelledby="pages-choose" className="flex flex-wrap gap-2">
          {SITE_PAGES.map((p) => (
            <Button
              key={p}
              size="lg"
              variant={p === page ? 'primary' : 'secondary'}
              aria-pressed={p === page}
              onClick={() => setPage(p)}
            >
              {SITE_PAGE_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-accent-2 bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <p className="font-display text-xl font-bold text-accent-3">
            Página «{SITE_PAGE_LABELS[page]}»
          </p>
          <p className="text-md text-font-strong">
            Estas son las partes de la página, de arriba hacia abajo, en el orden en que se ven en
            el sitio. Con «Mostrar en el sitio» elegís cuáles se ven. Las partes que trae el sitio
            no se pueden eliminar, solo ocultar.
          </p>
          <a
            href={SITE_PAGE_PATHS[page]}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-md font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
          >
            Ver la página en el sitio
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
        </div>
        <Button size="lg" onClick={() => setEditing('new')}>
          <Plus className="h-5 w-5" aria-hidden="true" />
          Agregar sección
        </Button>
      </div>

      {list.status === 'loading' && (
        <LoadingRegion label="Cargando la página">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </LoadingRegion>
      )}
      {list.status === 'error' && !list.data && (
        <ErrorState onRetry={list.reload} description={errorText(list.error)} />
      )}

      <ol
        className="flex flex-col gap-4"
        aria-label={`Partes de la página ${SITE_PAGE_LABELS[page]}`}
      >
        {rows.map((row, i) => (
          <li key={row.type === 'block' ? row.def.id : row.section.id}>
            {row.type === 'block' ? (
              <BlockCard
                position={i + 1}
                def={row.def}
                section={row.section}
                visible={row.def.canHide ? !hidden.includes(row.def.id) : true}
                busy={busy}
                canSettings={can(perms, 'settings:manage')}
                hasSettings={hasPageSettings(page)}
                onToggle={(v) =>
                  row.section && row.def.source === 'seccion'
                    ? setSectionVisible(row.section, v)
                    : setBlockVisible(row.def.id, v)
                }
                onEditSection={() => row.section && setEditing(row.section)}
                onEditSettings={() => setSettingsOpen(true)}
              />
            ) : (
              <SectionCard
                position={i + 1}
                page={page}
                section={row.section}
                galleryName={galleryName(row.section.galleryId)}
                busy={busy}
                canDelete={canDelete}
                index={row.group.indexOf(row.section)}
                groupSize={row.group.length}
                onToggle={(v) => setSectionVisible(row.section, v)}
                onEdit={() => setEditing(row.section)}
                onMove={(d) => move(row.group, row.group.indexOf(row.section), d)}
                onDelete={() => setDeleting(row.section)}
                onEditPhoto={
                  page === 'carrera' &&
                  row.section.slug === 'perfil' &&
                  can(perms, 'settings:manage')
                    ? () => setSettingsOpen(true)
                    : undefined
                }
              />
            )}
          </li>
        ))}
      </ol>

      <PageSettingsDialog page={page} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SectionDialog
        page={page}
        section={editing}
        nextOrder={nextOrder}
        galleries={canGalleries ? (galleries.data?.galleries ?? []) : null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast({ tone: 'success', title: 'Sección guardada.' });
          list.reload();
          galleries.reload();
        }}
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          tone="danger"
          title="¿Eliminar esta sección?"
          description={
            deleting.kind === 'GALLERY'
              ? 'Se quita la galería de esta página. La galería y sus fotos no se borran: siguen en «Galerías».'
              : 'Se elimina definitivamente y no se puede recuperar.'
          }
          details={<strong>{deleting.title}</strong>}
          confirmLabel="Eliminar"
          onConfirm={async () => {
            await api.delete(`/content/${page}/${deleting.slug}`);
            toast({ tone: 'success', title: 'Sección eliminada.' });
            list.reload();
            galleries.reload();
          }}
        />
      )}
    </section>
  );
}

/** Etiqueta que dice qué clase de parte de la página es. */
function KindTag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success';
}) {
  return (
    <Badge tone={tone} className="text-sm">
      {children}
    </Badge>
  );
}

/** Número de posición + título de cada bloque: deja claro el orden de arriba hacia abajo. */
function CardHead({
  position,
  name,
  tag,
  description,
}: {
  position: number;
  name: string;
  tag: ReactNode;
  description: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-4">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-accent-2 font-display text-lg font-bold text-accent-3"
      >
        {position}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-display text-xl font-bold text-accent-3">
          <span className="sr-only">Parte {position}: </span>
          {name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">{tag}</div>
        <p className="mt-2 text-md text-font-strong">{description}</p>
      </div>
    </div>
  );
}

/** Interruptor con el estado escrito: «Mostrar en el sitio: Sí / No». */
function ShowSwitch({
  checked,
  disabled,
  onChange,
  name,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  name: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 sm:w-72',
        checked ? 'border-primary bg-base' : 'border-accent-2 bg-surface',
      )}
    >
      <Switch
        aria-label={`Mostrar en el sitio: ${checked ? 'Sí' : 'No'}. ${name}`}
        label={`Mostrar en el sitio: ${checked ? 'Sí' : 'No'}`}
        hint={checked ? 'Las personas lo ven.' : 'Está oculto, nadie lo ve.'}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        data-testid="show-switch"
      />
    </div>
  );
}

/** Bloque fijo: encabezado, avisos, contacto, accesos… (no se elimina). */
function BlockCard({
  position,
  def,
  section,
  visible,
  busy,
  canSettings,
  hasSettings,
  onToggle,
  onEditSection,
  onEditSettings,
}: {
  position: number;
  def: PageBlockDef;
  section?: ContentSectionDto;
  visible: boolean;
  busy: boolean;
  canSettings: boolean;
  hasSettings: boolean;
  onToggle: (visible: boolean) => void;
  onEditSection: () => void;
  onEditSettings: () => void;
}) {
  const isHeader = def.name.startsWith('Encabezado');
  return (
    <Card data-testid="block-row" className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <CardHead
        position={position}
        name={def.name}
        description={def.description}
        tag={
          <>
            <KindTag tone="success">{isHeader ? 'Encabezado' : 'Parte fija del sitio'}</KindTag>
            {def.source === 'otra-pantalla' && <KindTag>Se carga en otra pantalla</KindTag>}
            {def.source === 'enlaces' && <KindTag>Enlaces de interés</KindTag>}
          </>
        }
      />
      <div className="flex flex-col gap-3 lg:items-end">
        {def.canHide ? (
          <ShowSwitch checked={visible} disabled={busy} onChange={onToggle} name={def.name} />
        ) : (
          <p className="rounded-lg border border-accent-2 bg-surface px-4 py-3 text-md font-semibold text-accent-3 sm:w-72">
            Siempre se muestra
          </p>
        )}
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {def.source === 'seccion' && section && (
            <Button size="lg" variant="secondary" onClick={onEditSection}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Cambiar título y texto
            </Button>
          )}
          {def.source === 'textos' && hasSettings && canSettings && (
            <Button size="lg" variant="secondary" onClick={onEditSettings}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Cambiar textos e imágenes
            </Button>
          )}
          {def.editHref && (
            <Button asChild size="lg" variant="secondary">
              <Link href={def.editHref}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {def.editLabel ?? 'Ir a editarlo'}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Sección de texto o de galería: fija (la trae el sitio) o agregada por una persona. */
function SectionCard({
  position,
  page,
  section: s,
  galleryName,
  busy,
  canDelete,
  index,
  groupSize,
  onToggle,
  onEdit,
  onMove,
  onDelete,
  onEditPhoto,
}: {
  position: number;
  page: SitePage;
  section: ContentSectionDto;
  galleryName: string;
  busy: boolean;
  canDelete: boolean;
  index: number;
  groupSize: number;
  onToggle: (visible: boolean) => void;
  onEdit: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  /** Solo en «Perfil profesional» de La carrera: la foto de respaldo cuando no hay galería. */
  onEditPhoto?: () => void;
}) {
  const fixed = isFixedSection(page, s.slug);
  const info = fixedSectionInfo(page, s.slug);
  const isGallery = s.kind === 'GALLERY';
  return (
    <Card data-testid="content-row" className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <CardHead
        position={position}
        name={info?.name ?? s.title}
        description={
          info?.description ??
          (isGallery
            ? `Muestra las fotos de la galería «${galleryName}» como carrusel.`
            : 'Una tarjeta de texto con su título. Se ve debajo de las demás tarjetas de la página.')
        }
        tag={
          fixed ? (
            <KindTag tone="success">Parte fija del sitio</KindTag>
          ) : (
            <>
              <KindTag tone="success">Agregada por vos</KindTag>
              <KindTag>
                {isGallery ? (
                  <span className="inline-flex items-center gap-1">
                    <Images className="h-4 w-4" aria-hidden="true" />
                    Galería de fotos
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Type className="h-4 w-4" aria-hidden="true" />
                    Texto
                  </span>
                )}
              </KindTag>
            </>
          )
        }
      />
      <div className="flex flex-col gap-3 lg:items-end">
        <ShowSwitch checked={s.visible} disabled={busy} onChange={onToggle} name={s.title} />
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            size="lg"
            variant="secondary"
            onClick={onEdit}
            aria-label={`Editar la sección ${s.title}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Editar
          </Button>
          {onEditPhoto && (
            <Button size="lg" variant="secondary" onClick={onEditPhoto}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Cambiar la foto
            </Button>
          )}
          {groupSize > 1 && (
            <>
              <Button
                size="lg"
                variant="secondary"
                disabled={busy || index === 0}
                onClick={() => onMove(-1)}
                aria-label={`Subir la sección ${s.title}`}
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
                Subir
              </Button>
              <Button
                size="lg"
                variant="secondary"
                disabled={busy || index === groupSize - 1}
                onClick={() => onMove(1)}
                aria-label={`Bajar la sección ${s.title}`}
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                Bajar
              </Button>
            </>
          )}
          {!fixed && canDelete && (
            <Button
              size="lg"
              variant="ghost"
              disabled={s.visible}
              onClick={onDelete}
              aria-label={`Eliminar la sección ${s.title}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Eliminar
            </Button>
          )}
        </div>
        {!fixed && canDelete && s.visible && (
          <p className="text-sm text-font-strong lg:text-right">
            Para eliminarla, primero ocultala con el interruptor.
          </p>
        )}
      </div>
    </Card>
  );
}

const KIND_CHOICES: { value: ContentSectionKind; title: string; description: string }[] = [
  { value: 'TEXT', title: 'Texto', description: 'Un título y un texto, como una tarjeta.' },
  {
    value: 'GALLERY',
    title: 'Galería de fotos',
    description: 'Un carrusel con las fotos de una de tus galerías.',
  },
];

function SectionDialog({
  page,
  section,
  nextOrder,
  galleries,
  onClose,
  onSaved,
}: {
  page: SitePage;
  section: ContentSectionDto | 'new' | null;
  /** Posición que toma una sección nueva: al final de la página. */
  nextOrder: number;
  /** Galerías para elegir; `null` si la persona no tiene permiso para verlas. */
  galleries: GalleryDto[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = section === 'new';
  const current = section && section !== 'new' ? section : null;
  const fixed = current ? isFixedSection(page, current.slug) : false;
  const [kind, setKind] = useState<ContentSectionKind>('TEXT');
  const [galleryId, setGalleryId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useResetOn(section ? (current?.id ?? 'nueva') : 'cerrado', () => {
    if (!section) return;
    setKind(current?.kind ?? 'TEXT');
    setGalleryId(current?.galleryId ?? '');
    setTitle(current?.title ?? '');
    setBody(current?.body ?? '');
    setPreview(false);
    setErrors({});
    setFormError(null);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (kind === 'GALLERY' && !galleryId) {
      setErrors({ galleryId: ['Elegí qué galería querés mostrar en esta sección.'] });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        body,
        // Una sección nueva va al final; una existente conserva su lugar (se mueve con Subir y Bajar).
        order: current?.order ?? nextOrder,
        visible: current?.visible ?? true,
        kind,
        galleryId: kind === 'GALLERY' ? galleryId : null,
      };
      if (isNew) await api.post(`/content/${page}`, payload);
      else await api.put(`/content/${page}/${current!.slug}`, payload);
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
      open={!!section}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={isNew ? 'Agregar una sección' : 'Editar sección'}
      description={`Página: ${SITE_PAGE_LABELS[page]}`}
      footer={
        <>
          <Button size="lg" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="section-form" loading={saving}>
            Guardar sección
          </Button>
        </>
      }
    >
      <form id="section-form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {isNew && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-md font-semibold text-accent-3">
              ¿Qué querés agregar?
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {KIND_CHOICES.map((c) => (
                <label
                  key={c.value}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-lg border-2 p-4 focus-within:shadow-focus',
                    kind === c.value
                      ? 'border-primary-strong bg-base'
                      : 'border-accent-2 bg-surface',
                  )}
                >
                  <span className="flex items-center gap-2 text-lg font-bold text-accent-3">
                    <input
                      type="radio"
                      name="section-kind"
                      value={c.value}
                      checked={kind === c.value}
                      onChange={() => setKind(c.value)}
                      className="h-5 w-5"
                    />
                    {c.title}
                  </span>
                  <span className="text-md text-font-strong">{c.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Input
          label="Título de la sección"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
        />
        {kind === 'GALLERY' ? (
          <>
            {galleries === null ? (
              <p className="rounded-md bg-surface px-3 py-2 text-md text-font-strong">
                No tenés permiso para ver las galerías. Pedile a quien administra el panel que te lo
                habilite.
              </p>
            ) : galleries.length === 0 ? (
              <p className="rounded-md bg-surface px-3 py-2 text-md text-font-strong">
                Todavía no hay galerías.{' '}
                <Link href="/panel/galerias" className="font-semibold text-accent underline">
                  Creá una en «Galerías»
                </Link>{' '}
                y volvé acá.
              </p>
            ) : (
              <>
                <Select
                  label="¿Qué galería querés mostrar?"
                  value={galleryId}
                  onValueChange={setGalleryId}
                  placeholder="Elegí una galería"
                  options={galleries.map((g) => ({
                    value: g.id,
                    label: `${g.name} (${g.items.length} fotos)`,
                  }))}
                  error={errors.galleryId}
                />
                <p className="text-md text-font-strong">
                  ¿Necesitás una galería nueva?{' '}
                  <Link href="/panel/galerias" className="font-semibold text-accent underline">
                    Creala en «Galerías»
                  </Link>{' '}
                  y volvé acá.
                </p>
              </>
            )}
            <Textarea
              label="Texto de presentación (opcional)"
              hint="Se muestra arriba de las fotos."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              error={errors.body}
              rows={3}
            />
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-md font-semibold text-accent-3">Texto</span>
              <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
                {preview ? (
                  <>
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                    Volver a editar
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Ver cómo queda
                  </>
                )}
              </Button>
            </div>
            {preview ? (
              <div
                data-testid="md-preview"
                className="min-h-32 rounded-md border border-accent-2 bg-base p-4"
              >
                {body.trim() ? (
                  <MarkdownPreview source={body} />
                ) : (
                  <p className="text-sm">Sin texto.</p>
                )}
              </div>
            ) : (
              <Textarea
                label="Escribí el texto"
                hint="Podés usar # títulos, **negrita**, *cursiva*, listas con - y enlaces [texto](https://…)."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                error={errors.body}
                rows={10}
              />
            )}
          </div>
        )}
        {fixed && (
          <p className="rounded-md bg-surface px-3 py-2 text-md text-font-strong">
            Esta parte la trae el sitio: podés cambiar su título y su texto, ocultarla o mostrarla,
            pero no eliminarla.
          </p>
        )}
        {formError && Object.keys(errors).length === 0 && (
          <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
