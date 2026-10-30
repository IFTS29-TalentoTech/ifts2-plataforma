/**
 * Panel B · campo de archivo (zona punteada del Figma "Cargá tu archivo completo aquí").
 *
 * Valida en el navegador el tipo y el tamaño ANTES de subir (E2E-15) con los límites de
 * `FILE_LIMITS` (ADR-08: PDF 10 MB, imagen 5 MB). La API vuelve a validar por la firma real del
 * archivo (415/413), así que esto es solo comodidad: nunca es la defensa.
 */
'use client';

import { FILE_LIMITS } from '@ifts2/shared';
import { FileText, Upload } from 'lucide-react';
import { useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { formatBytes } from '../lib/format';

/** Devuelve un mensaje si el archivo no se puede subir, o null si está bien. */
export function validateFile(file: File): string | null {
  const allowed: readonly string[] = FILE_LIMITS.allowedMime;
  if (!allowed.includes(file.type)) {
    return 'Ese tipo de archivo no está permitido. Subí un PDF o una imagen (JPG, PNG o WebP).';
  }
  const max = file.type === 'application/pdf' ? FILE_LIMITS.pdfMaxBytes : FILE_LIMITS.imageMaxBytes;
  if (file.size > max) {
    return `El archivo pesa ${formatBytes(file.size)} y el máximo es ${formatBytes(max)}. Probá comprimirlo.`;
  }
  return null;
}

export function FileField({
  label,
  file,
  onChange,
  error,
  current,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** Error devuelto por la API (413/415). */
  error?: string;
  /** Nombre del archivo actual (al actualizar un archivo existente). */
  current?: string | null;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const localError = file ? validateFile(file) : null;
  const message = localError ?? error ?? undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-semibold text-accent-3">
        {label}
      </span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-labelledby={`${id}-label ${id}-btn`}
        aria-describedby={message ? `${id}-error` : `${id}-hint`}
        className={cn(
          'flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed bg-base px-4 py-5 text-center text-sm',
          'focus-visible:outline-none focus-visible:shadow-focus',
          message ? 'border-danger-text' : 'border-primary',
        )}
      >
        <span id={`${id}-btn`} className="flex flex-col items-center gap-1">
          {file ? (
            <>
              <FileText className="h-5 w-5 text-accent" aria-hidden="true" />
              <span className="font-semibold text-accent-3">{file.name}</span>
              <span className="text-xs text-font-strong">
                {formatBytes(file.size)} · tocá para cambiarlo
              </span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-accent" aria-hidden="true" />
              <span className="font-semibold text-accent-3 underline">Elegir un archivo</span>
              {current && <span className="text-xs text-font-strong">Actual: {current}</span>}
            </>
          )}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        data-testid="file-input"
        aria-label={label}
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <p id={`${id}-hint`} className="text-xs text-font-strong">
        PDF hasta 10 MB o imagen (JPG, PNG, WebP) hasta 5 MB.
      </p>
      {message && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger-text">
          <span className="sr-only">Error: </span>
          {message}
        </p>
      )}
    </div>
  );
}
