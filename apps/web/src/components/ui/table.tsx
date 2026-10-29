import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Tabla con scroll horizontal en pantallas chicas. Pasá `caption` para describirla a lectores de pantalla. */
export function Table({
  caption,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableElement> & { caption?: string }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-accent-2 bg-surface">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export const THead = ({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead
    className={cn('bg-base text-xs uppercase tracking-wide text-font-strong', className)}
    {...p}
  />
);
export const TBody = ({ className, ...p }: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn('divide-y divide-accent-2', className)} {...p} />
);
export const TR = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('hover:bg-base', className)} {...p} />
);
export const TH = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" className={cn('px-4 py-3 font-semibold', className)} {...p} />
);
export const TD = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-4 py-3 align-middle text-accent-3', className)} {...p} />
);
