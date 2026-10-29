'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useRestoreFocus } from './use-restore-focus';

/**
 * Modal para FORMULARIOS (nuevo aviso, moderar publicación, configurar llamado...).
 * Para confirmaciones sí/no usá <ConfirmDialog>. Atrapa el foco y cierra con Escape.
 *
 *   <Dialog open={open} onOpenChange={setOpen} title="Nuevo aviso" description="..."
 *           footer={<><Button variant="ghost">Cancelar</Button><Button>Guardar</Button></>}>
 *     ...campos...
 *   </Dialog>
 */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: DialogProps) {
  const rf = useRestoreFocus();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-accent-3 opacity-60" />
        <DialogPrimitive.Content
          onOpenAutoFocus={rf.onOpenAutoFocus}
          onCloseAutoFocus={rf.onCloseAutoFocus}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface shadow-popover focus:outline-none',
            sizes[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-accent-2 px-6 py-4">
            <div>
              <DialogPrimitive.Title className="font-display text-xl font-bold text-accent-3">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-font-strong">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="rounded-md p-1.5 text-font-strong hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse justify-end gap-2 border-t border-accent-2 px-6 py-4 sm:flex-row">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
