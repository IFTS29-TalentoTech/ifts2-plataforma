/**
 * Configuración · campo de imagen del sitio (logo, fotos de Inicio, La carrera, Ingreso).
 *
 * Muestra la imagen actual (no su ruta) y permite subir una desde el equipo o quitarla. Se aplica al
 * instante (`POST/DELETE /settings/image/:key`): la API reduce la foto a 1600 px, la guarda como WebP y
 * borra la anterior. Quitar pide confirmación (ConfirmDialog único) y el sitio vuelve a su respaldo.
 * Si la imagen actual es una ruta provisoria de la semilla (`/img/provisorio/...`) se la muestra igual
 * y se avisa que es provisoria.
 */
'use client';

import { validateFile } from '../components/file-field';
import { ImageOff, Upload } from 'lucide-react';
import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { Button, ConfirmDialog, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText } from '../lib/format';

export function ImageSettingField({
  settingKey,
  label,
  hint,
  value,
  onChanged,
}: {
  settingKey: string;
  label: string;
  hint?: string;
  /** URL o ruta actual (ya resuelta por la API); vacío = sin imagen. */
  value: string | null | undefined;
  /** Se llama después de subir o quitar, para recargar los ajustes. */
  onChanged: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function upload(file: File | null) {
    if (!file) return;
    const invalid = validateFile(file, true);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      await api.post(`/settings/image/${settingKey}`, fd);
      toast({ tone: 'success', title: `${label}: imagen actualizada.` });
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = ''; // permite volver a elegir el mismo archivo
    }
  }

  const provisional = !!value && value.startsWith('/img/provisorio/');

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-sm font-semibold text-accent-3">
        {label}
      </span>
      <div className="flex items-center gap-4 rounded-lg border border-accent-2 bg-base p-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent-2">
          {value ? (
            <Image
              src={value}
              alt=""
              width={112}
              height={80}
              unoptimized
              className="h-20 w-28 object-contain"
            />
          ) : (
            <span className="flex flex-col items-center text-xs text-font-strong">
              <ImageOff className="h-5 w-5" aria-hidden="true" />
              Sin imagen
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          {provisional && (
            <span className="text-xs text-font-strong">
              Imagen provisoria hasta tener la oficial.
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={() => input.current?.click()}
              aria-label={`${value ? 'Cambiar imagen' : 'Subir imagen'}: ${label}`}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {value ? 'Cambiar imagen' : 'Subir imagen'}
            </Button>
            {value && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setRemoving(true)}
                aria-label={`Quitar: ${label}`}
              >
                Quitar
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        data-testid="file-input"
        aria-label={`Archivo de imagen: ${label}`}
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void upload(e.target.files?.[0] ?? null)}
      />
      <p className="text-xs text-font-strong">
        {hint ? `${hint} ` : ''}Imagen (JPG, PNG, WebP) hasta 5 MB.
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(false)}
          tone="danger"
          title="¿Quitar esta imagen?"
          description="El sitio vuelve a mostrar su imagen por defecto. Podés subir otra cuando quieras."
          details={<strong>{label}</strong>}
          confirmLabel="Quitar"
          onConfirm={async () => {
            await api.delete(`/settings/image/${settingKey}`);
            toast({ tone: 'success', title: 'Imagen quitada.' });
            onChanged();
          }}
        />
      )}
    </div>
  );
}
