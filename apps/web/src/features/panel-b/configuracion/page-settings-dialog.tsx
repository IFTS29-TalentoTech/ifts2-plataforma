/**
 * Configuración · "Ajustes de la página": los textos e imágenes que se ven DENTRO de una página del
 * sitio (titular y fotos de Inicio, foto de La carrera, imagen de Ingreso) se editan en la ventana de
 * esa página, no en la pantalla general. Así quien edita una página encuentra todo en un solo lugar.
 *
 * - Textos: `PUT /settings` (solo lo modificado, validado con los mismos esquemas que la API).
 * - Imágenes: se suben como archivo y se aplican al instante (ver `ImageSettingField`).
 * Resuelve Q64 (titular corto de Inicio) y reemplaza las rutas de texto por carga de archivos.
 */
'use client';

import { settingsUpdateInput, type SettingKey, type SettingsDto } from '@ifts2/shared';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  ErrorState,
  Input,
  LoadingRegion,
  Skeleton,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';
import { ImageSettingField } from './image-setting-field';

type TextKey = Exclude<SettingKey, 'exam_enrollment_open'>;

/** Qué se configura en cada página. `inicio` no tiene secciones de texto, solo estos ajustes. */
export const PAGE_SETTINGS = {
  inicio: {
    label: 'Inicio',
    texts: [
      {
        key: 'hero_eyebrow',
        label: 'Rótulo sobre el titular',
        hint: 'Ejemplo: Educación pública · Formación técnica. Vacío = se usa el subtítulo institucional.',
      },
      {
        key: 'hero_title',
        label: 'Titular',
        hint: 'Título corto y destacado. Vacío = se usa la frase institucional como titular.',
      },
      {
        key: 'tagline',
        label: 'Frase institucional',
        hint: 'Se muestra debajo del titular.',
      },
    ],
    images: [
      { key: 'hero_image_1', label: 'Imagen principal' },
      { key: 'hero_image_2', label: 'Imagen secundaria' },
    ],
  },
  institucional: { label: 'Institucional', texts: [], images: [] },
  estudiantes: { label: 'Estudiantes', texts: [], images: [] },
  inscripciones: { label: 'Inscripciones', texts: [], images: [] },
  carrera: {
    label: 'La carrera',
    texts: [],
    images: [
      {
        key: 'career_image',
        label: 'Imagen del perfil',
        hint: 'Se usa cuando no hay fotos cargadas en Galerías.',
      },
    ],
  },
  ingreso: {
    label: 'Ingreso',
    texts: [],
    images: [{ key: 'ingreso_image', label: 'Imagen del encabezado' }],
  },
} as const satisfies Record<
  string,
  {
    label: string;
    texts: readonly { key: TextKey; label: string; hint?: string }[];
    images: readonly { key: TextKey; label: string; hint?: string }[];
  }
>;

export type SettingsPage = keyof typeof PAGE_SETTINGS;

/** ¿Esta página tiene ajustes propios (textos o imágenes)? */
export const hasPageSettings = (page: SettingsPage) =>
  PAGE_SETTINGS[page].texts.length + PAGE_SETTINGS[page].images.length > 0;

/**
 * Se monta solo mientras está abierta: así cada apertura arranca con los ajustes recién leídos y no
 * con datos viejos de la vez anterior.
 */
export function PageSettingsDialog({
  page,
  open,
  onClose,
}: {
  page: SettingsPage;
  open: boolean;
  onClose: () => void;
}) {
  return open ? <PageSettingsForm page={page} onClose={onClose} /> : null;
}

function PageSettingsForm({ page, onClose }: { page: SettingsPage; onClose: () => void }) {
  const { toast } = useToast();
  const cfg = PAGE_SETTINGS[page];
  const texts: readonly { key: TextKey; label: string; hint?: string }[] = cfg.texts;
  const images: readonly { key: TextKey; label: string; hint?: string }[] = cfg.images;
  const settings = useResource<SettingsDto>('/settings');
  const [form, setForm] = useState<Partial<Record<TextKey, string>>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Los textos se cargan una vez, al llegar los ajustes; las imágenes se recargan solas tras cada subida
  // sin pisar lo que se esté escribiendo.
  useResetOn(settings.data ? 'listo' : 'cargando', () => {
    if (!settings.data) return;
    const next: Partial<Record<TextKey, string>> = {};
    for (const f of texts) next[f.key] = (settings.data[f.key] as string | null) ?? '';
    setForm(next);
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!settings.data) return;
    const changes: Record<string, string> = {};
    for (const f of texts) {
      const now = (form[f.key] ?? '').trim();
      if (now !== ((settings.data[f.key] as string | null) ?? '')) changes[f.key] = now;
    }
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    const parsed = settingsUpdateInput.safeParse(changes);
    if (!parsed.success) {
      const next: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (next[String(issue.path[0] ?? '_')] ??= []).push(issue.message);
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.put('/settings', changes);
      toast({ tone: 'success', title: `Ajustes de ${cfg.label} guardados.` });
      onClose();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Ajustes de la página: ${cfg.label}`}
      description="Textos e imágenes que se ven en esta página. Las imágenes se aplican apenas las subís."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {texts.length > 0 ? 'Cancelar' : 'Cerrar'}
          </Button>
          {texts.length > 0 && (
            <Button type="submit" form="page-settings-form" loading={saving}>
              Guardar textos
            </Button>
          )}
        </>
      }
    >
      {settings.status === 'loading' && !settings.data && (
        <LoadingRegion label="Cargando ajustes">
          <Skeleton className="h-40" />
        </LoadingRegion>
      )}
      {settings.status === 'error' && !settings.data && (
        <ErrorState onRetry={settings.reload} description={errorText(settings.error)} />
      )}
      {settings.data && (
        <form id="page-settings-form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
          {texts.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              hint={f.hint}
              value={form[f.key] ?? ''}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              error={errors[f.key]}
            />
          ))}
          {images.map((f) => (
            <ImageSettingField
              key={f.key}
              settingKey={f.key}
              label={f.label}
              hint={f.hint}
              value={settings.data![f.key] as string | null}
              onChanged={settings.reload}
            />
          ))}
          {formError && (
            <p
              role="alert"
              className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text"
            >
              {formError}
            </p>
          )}
        </form>
      )}
    </Dialog>
  );
}
