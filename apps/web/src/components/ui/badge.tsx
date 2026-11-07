import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'urgent';

const tones: Record<BadgeTone, string> = {
  success: 'bg-success-back text-success-text',
  // warning-strong: el color original (#B77A3A) sobre warning-back da 3.0:1; este da 4.7:1.
  warning: 'bg-warning-back text-warning-strong',
  danger: 'bg-danger-back text-danger-text',
  neutral: 'bg-accent-2 text-font-strong',
  urgent: 'bg-danger-back text-danger-text uppercase tracking-wide',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Insignia de estado. El significado va en el texto (no solo en el color). Tono `urgent` = "Urgente". */
export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        // justify-center + text-center + leading-4: si el texto baja a dos líneas queda centrado y
        // con poco interlineado (antes quedaba alineado a la izquierda y con aire de más).
        'inline-flex items-center justify-center gap-1 rounded-pill px-2.5 py-1 text-center text-xs font-semibold leading-4',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
