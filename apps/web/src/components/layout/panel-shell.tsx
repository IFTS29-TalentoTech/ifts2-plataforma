import type { ReactNode } from 'react';
import { PANEL_NAV, canAccessNav } from '@/lib/nav';
import type { Session } from '@/lib/session';
import type { SiteInfo } from '@/lib/site';
import { LogoutButton } from './logout-button';
import { PanelNav } from './panel-nav';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

export interface PanelShellProps {
  session: Session;
  site: SiteInfo;
  /** Contadores del menú: { publications: 3, notices: 4 } (vienen de GET /dashboard). */
  counts?: Partial<Record<'publications' | 'notices', number>>;
  /** true si alguna integración corre en modo demostración (GET /health -> demoMode). */
  demoMode?: boolean;
  children: ReactNode;
}

/**
 * Estructura común del panel: barra superior, menú lateral "Gestión del sitio" (drawer en móvil desde
 * el menú hamburguesa) y área de contenido. Los ítems se filtran por permisos del rol.
 * Lo aplica `src/app/panel/(shell)/layout.tsx`; las páginas usan <PageHeader> y su contenido.
 */
export function PanelShell({ session, site, counts = {}, demoMode, children }: PanelShellProps) {
  const items = PANEL_NAV.filter((i) => canAccessNav(session.permissions, i)).map((i) => ({
    href: i.href,
    label: i.label,
    count: i.countKey ? counts[i.countKey] : undefined,
  }));

  // En escritorio (lg) el panel ocupa la ventana: cabecera y pie siempre visibles, menú lateral fijo
  // y solo el contenido central hace scroll. En móvil la página scrollea completa.
  return (
    <div className="flex min-h-dvh flex-col bg-base lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-focus"
      >
        Saltar al contenido
      </a>
      <SiteHeader
        site={site}
        panelItems={items}
        userName={session.name}
        userRole={session.roleName}
      />
      <div className="flex flex-1 lg:min-h-0">
        <aside className="hidden w-sidebar shrink-0 flex-col justify-between overflow-y-auto bg-accent p-5 lg:flex">
          <div>
            <p className="mb-4 mt-2 text-xs font-semibold uppercase tracking-wider text-accent-2">
              Gestión del sitio
            </p>
            <PanelNav items={items} />
          </div>
          <div className="text-xs text-accent-2">
            <p className="font-semibold text-base">{session.name}</p>
            <p className="mb-2">{session.roleName}</p>
            <LogoutButton />
            <p className="mt-3">Panel administrativo</p>
            <p>{site.short}</p>
          </div>
        </aside>
        {/* `relative`: el <main> es el que hace scroll en escritorio. Sin posición propia, los elementos
            con `position: absolute` de adentro (por ejemplo los textos `sr-only` para lectores de
            pantalla) se ubicaban respecto de la página, escapaban del scroll y la estiraban: quedaba un
            espacio en blanco debajo del pie. */}
        <main
          id="contenido"
          className="relative min-w-0 flex-1 px-gutter py-8 lg:overflow-y-auto lg:px-gutter-lg"
        >
          {demoMode && (
            <p
              role="status"
              className="mb-6 rounded-md border border-warning-strong bg-warning-back px-4 py-2 text-sm font-medium text-warning-strong"
            >
              Modo demostración: hay servicios (Instagram, correo o archivos) funcionando con datos
              de ejemplo. Se configuran en Configuración.
            </p>
          )}
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
      <div className="lg:shrink-0">
        <SiteFooter site={site} />
      </div>
    </div>
  );
}
