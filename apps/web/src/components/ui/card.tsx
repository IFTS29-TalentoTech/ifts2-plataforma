import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Filete lateral de acento (tarjetas del sitio público). */
  accentBar?: boolean;
  padded?: boolean;
}

export function Card({ accentBar, padded = true, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-accent-2 bg-surface shadow-card',
        accentBar && 'border-l-4 border-l-primary',
        padded && 'p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-display text-lg font-bold text-accent-3', className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-font', className)} {...props} />;
}

/** Etiqueta de sección en mayúsculas ("ACCESOS RÁPIDOS"). */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-xs font-semibold uppercase tracking-wider text-accent', className)}
      {...props}
    />
  );
}
