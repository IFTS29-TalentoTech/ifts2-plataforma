import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

/** Esqueleto de carga (estado "cargando" de toda pantalla). Se oculta a lectores de pantalla. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-accent-2', className)}
      {...props}
    />
  );
}

/** Contenedor de carga accesible: anuncia "Cargando" una sola vez. */
export function LoadingRegion({
  children,
  label = 'Cargando',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

/** Estado vacío: mensaje y acción sugerida. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-primary bg-surface px-6 py-10 text-center',
        className,
      )}
    >
      <Inbox className="h-8 w-8 text-accent" aria-hidden="true" />
      <p className="font-display text-lg font-bold text-accent-3">{title}</p>
      {description && <p className="max-w-md text-sm text-font-strong">{description}</p>}
      {action}
    </div>
  );
}

/** Estado de error en lenguaje claro, sin códigos técnicos, con "Reintentar". */
export function ErrorState({
  title = 'No pudimos cargar esta sección',
  description = 'Hubo un problema al obtener la información. Intentá de nuevo.',
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-danger-text bg-danger-back px-6 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle className="h-8 w-8 text-danger-text" aria-hidden="true" />
      <p className="font-display text-lg font-bold text-danger-text">{title}</p>
      <p className="max-w-md text-sm text-danger-text">{description}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/**
 * Carga de pantalla completa del área de contenido (la usan los `loading.tsx` de Next mientras el
 * servidor prepara la ruta). Spinner centrado, con el color del tema y anunciado una sola vez.
 */
export function PageLoading({ label = 'Cargando' }: { label?: string }) {
  return (
    <LoadingRegion label={label}>
      <div className="flex min-h-[40vh] items-center justify-center">
        <span
          aria-hidden="true"
          className="h-10 w-10 animate-spin rounded-pill border-4 border-accent-2 border-t-accent"
        />
      </div>
    </LoadingRegion>
  );
}
