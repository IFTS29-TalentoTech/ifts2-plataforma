import type { ReactNode } from 'react';
import { getSiteInfo } from '@/lib/site';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * Layout del sitio público (TopBar + contenido + Footer). Lo aplica `src/app/(public)/layout.tsx`:
 * las páginas públicas solo devuelven su contenido, sin repetir cabecera ni pie.
 */
export async function PublicLayout({ children }: { children: ReactNode }) {
  const site = await getSiteInfo();
  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-focus"
      >
        Saltar al contenido
      </a>
      <SiteHeader site={site} />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <SiteFooter site={site} />
    </div>
  );
}
