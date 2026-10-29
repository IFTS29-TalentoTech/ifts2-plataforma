'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Avisos breves de éxito/error. No dependen solo del color: llevan icono y texto.
 *   const { toast } = useToast();
 *   toast({ title: 'Aviso publicado', description: 'Ya se ve en Estudiantes.', tone: 'success' });
 */
export type ToastTone = 'success' | 'error' | 'info';
export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ toast: (t: ToastInput) => void } | null>(null);

const tones: Record<ToastTone, { box: string; Icon: typeof Check }> = {
  success: { box: 'border-success-text bg-success-back text-success-text', Icon: Check },
  error: { box: 'border-danger-text bg-danger-back text-danger-text', Icon: AlertTriangle },
  info: { box: 'border-primary bg-surface text-accent-3', Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((t: ToastInput) => {
    setItems((prev) => [...prev, { ...t, id: Date.now() + Math.random() }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider duration={5000} label="Notificación">
        {children}
        {items.map((t) => {
          const { box, Icon } = tones[t.tone ?? 'info'];
          return (
            <ToastPrimitive.Root
              key={t.id}
              onOpenChange={(open) => !open && setItems((p) => p.filter((x) => x.id !== t.id))}
              className={cn('flex items-start gap-3 rounded-lg border p-4 shadow-popover', box)}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <ToastPrimitive.Title className="text-sm font-bold">{t.title}</ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-0.5 text-sm">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="Cerrar aviso"
                className="rounded-sm p-1 focus-visible:outline-none focus-visible:shadow-focus"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast requiere <ToastProvider> (ya está en el layout raíz).');
  return ctx;
}
