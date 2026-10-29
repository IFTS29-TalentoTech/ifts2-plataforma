'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { useRestoreFocus } from './use-restore-focus';

/**
 * DIÁLOGO DE CONFIRMACIÓN ÚNICO (ADR-11). Se usa en TODAS las confirmaciones: publicar, pausar,
 * descartar, restaurar, eliminar, guardar cambios globales. Radix AlertDialog atrapa el foco, cierra con
 * Escape y devuelve el foco al elemento que lo abrió.
 *
 * Dos formas de uso:
 *  1) Controlado:  <ConfirmDialog open={open} onOpenChange={setOpen} title="¿Confirmar publicación?" ... onConfirm={fn} />
 *  2) Imperativo:  const confirm = useConfirm();
 *                  if (await confirm({ title: '¿Eliminar el aviso?', tone: 'danger', confirmLabel: 'Sí, eliminar' })) { ... }
 *     (requiere <ConfirmProvider>, ya montado en el layout raíz)
 */
export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  /** Recuadro con el dato afectado, p. ej. "Título: Jornada gastronómica". */
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'primary' (publicar, restaurar) | 'danger' (eliminar, descartar). */
  tone?: 'primary' | 'danger';
  /** Icono del encabezado. Por defecto: check para primary, advertencia para danger. */
  icon?: 'success' | 'warning' | 'info';
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Puede ser asíncrona: el botón muestra carga y, si falla, el error aparece en el diálogo. */
  onConfirm: () => void | Promise<void>;
}

const icons = { success: Check, warning: AlertTriangle, info: Info };

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  icon,
  onConfirm,
}: ConfirmDialogProps) {
  const rf = useRestoreFocus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = icons[icon ?? (tone === 'danger' ? 'warning' : 'success')];

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.userMessage : 'No pudimos completar la acción. Intentá de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!loading) {
          setError(null);
          onOpenChange(o);
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-accent-3 opacity-60" />
        <AlertDialog.Content
          onOpenAutoFocus={rf.onOpenAutoFocus}
          onCloseAutoFocus={rf.onCloseAutoFocus}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-6 text-center shadow-popover focus:outline-none"
        >
          <div
            className={cn(
              'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-pill',
              tone === 'danger'
                ? 'bg-danger-back text-danger-text'
                : 'bg-success-back text-success-text',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <AlertDialog.Title className="font-display text-xl font-bold text-accent-3">
            {title}
          </AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="mt-2 text-sm text-font-strong">
              {description}
            </AlertDialog.Description>
          ) : (
            <AlertDialog.Description className="sr-only">{title}</AlertDialog.Description>
          )}
          {details && (
            <div className="mt-4 rounded-md border border-accent-2 bg-base px-3 py-2 text-left text-sm text-accent-3">
              {details}
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md bg-danger-back px-3 py-2 text-left text-sm text-danger-text"
            >
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" disabled={loading}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            {/* Action de Radix cierra solo; usamos un botón propio para esperar a la promesa */}
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// ---- Uso imperativo ----

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <ConfirmDialog
          {...options}
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) settle(false);
          }}
          onConfirm={() => {
            settle(true);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm requiere <ConfirmProvider> (ya está en el layout raíz).');
  return ctx;
}
