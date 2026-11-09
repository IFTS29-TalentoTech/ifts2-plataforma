import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteLogo } from '@/components/layout/site-logo';
import type { SiteInfo } from '@/lib/site';

/**
 * Marco de las pantallas de acceso (login y cambio obligatorio de contraseña), FUERA del shell del panel
 * (Figma 13-login y "Mobile · Login"): barra superior mínima, con el logo configurado (o las iniciales), con "Volver al portal institucional",
 * tarjeta centrada y el pie institucional. El nombre y los textos salen de la configuración del sitio
 * (ADR-22): nada institucional escrito en el código.
 */
export function AuthFrame({ site, children }: { site: SiteInfo; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <header className="border-b border-accent-2 bg-surface">
        <div className="mx-auto flex h-16 max-w-container items-center justify-between gap-4 px-gutter lg:px-gutter-lg">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:shadow-focus"
          >
            <SiteLogo short={site.short} src={site.logoUrl || undefined} />
            <span className="font-display text-lg font-bold text-accent-3">{site.short}</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-sm text-sm font-medium text-font-strong hover:text-accent-3 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al portal institucional
          </Link>
        </div>
      </header>
      <main
        id="contenido"
        className="flex flex-1 items-center justify-center px-gutter py-10 lg:px-gutter-lg"
      >
        <div className="w-full max-w-md rounded-xl border border-accent-2 bg-surface p-6 shadow-card sm:p-8">
          {children}
          {site.footerText && (
            <p className="mt-6 border-t border-accent-2 pt-4 text-center text-xs text-font-strong">
              {site.footerText}
            </p>
          )}
        </div>
      </main>
      <SiteFooter site={site} />
    </div>
  );
}
