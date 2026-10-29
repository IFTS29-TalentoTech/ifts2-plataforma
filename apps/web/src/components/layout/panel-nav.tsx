'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export interface PanelNavLink {
  href: string;
  label: string;
  count?: number;
}

/** Menú lateral "Gestión del sitio" con contadores. El ítem activo lleva punto y fondo oscuro. */
export function PanelNav({ items }: { items: PanelNavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Gestión del sitio" className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === '/panel' ? pathname === '/panel' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-base',
              'hover:bg-accent-3 focus-visible:outline-none focus-visible:shadow-focus',
              active && 'bg-accent-3 font-semibold',
            )}
          >
            {item.label}
            {item.count ? (
              <span className="rounded-pill bg-primary-strong px-2 text-xs font-semibold text-surface">
                <span className="sr-only">Pendientes: </span>
                {item.count}
              </span>
            ) : active ? (
              <span aria-hidden="true" className="h-2 w-2 rounded-pill bg-base" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
