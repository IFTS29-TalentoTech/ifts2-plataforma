'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PUBLIC_NAV } from '@/lib/nav';
import type { SiteInfo } from '@/lib/site';
import { cn } from '@/lib/cn';
import { AccountMenu } from './account-menu';
import { LogoutButton } from './logout-button';
import { SiteLogo } from './site-logo';

export interface MobilePanelItem {
  href: string;
  label: string;
  count?: number;
}

interface Props {
  site: SiteInfo;
  /** En el panel: ítems de "Gestión del sitio" que también se muestran en el menú móvil. */
  panelItems?: MobilePanelItem[];
  /** Nombre del usuario autenticado (muestra el icono de cuenta con su nombre accesible). */
  userName?: string | null;
  /** Nombre visible del rol del usuario (se muestra en el menú de cuenta). */
  userRole?: string | null;
}

/**
 * Nombre de quien tiene la sesión iniciada. En el panel viene resuelto desde el servidor (`userName`).
 * En el sitio público las páginas son estáticas y no pueden leer cookies, así que se consulta
 * `/api/session` desde el navegador. `undefined` = todavía no se sabe (no se muestra ni el botón de
 * ingreso ni "Administración", para que no parpadeen); `null` = sin sesión.
 */
function useSessionUser(
  initialName: string | null | undefined,
  initialRole: string | null | undefined,
): { name: string | null; roleName: string | null } | undefined {
  const [fetched, setFetched] = useState<{ name: string | null; roleName: string | null }>();
  useEffect(() => {
    if (initialName !== undefined) return;
    let alive = true;
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { name: null, roleName: null }))
      .then(
        (d: { name?: string | null; roleName?: string | null }) =>
          alive && setFetched({ name: d.name ?? null, roleName: d.roleName ?? null }),
      )
      .catch(() => alive && setFetched({ name: null, roleName: null }));
    return () => {
      alive = false;
    };
  }, [initialName]);
  if (initialName !== undefined) return { name: initialName, roleName: initialRole ?? null };
  return fetched;
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Barra superior institucional (público y panel). Menú hamburguesa a 390 px.
 * El nombre y la sigla vienen de la configuración del sitio (SiteSetting), no del código.
 */
export function SiteHeader({ site, panelItems, userName: userNameProp, userRole }: Props) {
  const pathname = usePathname();
  const user = useSessionUser(userNameProp, userRole);
  const userName = user?.name;
  // El menú móvil se cierra solo al navegar: el estado recuerda en qué ruta se abrió.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const inPanel = pathname.startsWith('/panel');

  return (
    <header className="sticky top-0 z-40 border-b border-accent-2 bg-surface">
      <div className="mx-auto flex h-16 max-w-container items-center justify-between gap-4 px-gutter lg:px-gutter-lg">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:shadow-focus"
        >
          <SiteLogo short={site.short} src={site.logoUrl || undefined} />
          <span className="font-display text-lg font-bold text-accent-3">{site.short}</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-6 lg:flex">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={cn(
                'rounded-sm border-b-2 border-transparent py-1 text-sm font-medium text-font-strong hover:text-accent-3 focus-visible:outline-none focus-visible:shadow-focus',
                isActive(pathname, item.href) && 'border-accent font-semibold text-accent-3',
              )}
            >
              {item.label}
            </Link>
          ))}
          {userName && (
            <Link
              href="/panel"
              aria-current={inPanel ? 'page' : undefined}
              className={cn(
                'rounded-sm border-b-2 border-transparent py-1 text-sm font-semibold text-accent hover:text-accent-3 focus-visible:outline-none focus-visible:shadow-focus',
                inPanel && 'border-accent',
              )}
            >
              Administración
            </Link>
          )}
          {userName ? (
            <AccountMenu name={userName} roleName={user?.roleName} inPanel={inPanel} />
          ) : userName === null ? (
            <Link
              href="/panel/login"
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-accent-3 hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus"
            >
              Iniciar sesión
            </Link>
          ) : null}
        </nav>

        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-md text-accent-3 hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setOpenAt(open ? null : pathname)}
        >
          {open ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <Menu className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-accent-2 bg-surface lg:hidden"
        >
          <nav aria-label="Principal (móvil)" className="flex flex-col p-3">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={cn(
                  'rounded-md px-4 py-3 text-sm font-medium text-font-strong hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus',
                  isActive(pathname, item.href) && 'bg-accent-2 font-semibold text-accent-3',
                )}
              >
                {item.label}
              </Link>
            ))}
            {userName ? (
              <Link
                href="/panel"
                className={cn(
                  'rounded-md px-4 py-3 text-sm font-semibold text-accent hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus',
                  inPanel && 'bg-accent-2',
                )}
              >
                Administración
              </Link>
            ) : userName === null ? (
              <Link
                href="/panel/login"
                className="rounded-md px-4 py-3 text-sm font-semibold text-accent hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus"
              >
                Iniciar sesión
              </Link>
            ) : null}
          </nav>
          {panelItems && panelItems.length > 0 && (
            <nav aria-label="Gestión del sitio (móvil)" className="bg-accent p-3">
              <p className="px-4 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-accent-2">
                Gestión del sitio
              </p>
              {panelItems.map((item) => {
                // "Resumen" (/panel) solo está activo en su propia ruta; el resto, también en subrutas.
                const current =
                  item.href === '/panel' ? pathname === '/panel' : isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex items-center justify-between rounded-md px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:shadow-focus',
                      // El color del texto va en una u otra rama, nunca en las dos: `text-base` es un color
                      // en este tema y tailwind-merge no lo trata como conflicto con `text-accent-3`
                      // (antes el ítem activo quedaba con texto claro sobre fondo claro).
                      current
                        ? 'bg-base font-semibold text-accent-3'
                        : 'text-base hover:bg-accent-3',
                    )}
                  >
                    {item.label}
                    {item.count ? (
                      <span className="rounded-pill bg-accent-2 px-2 text-xs font-semibold text-accent-3">
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
              {/* Cuenta también en móvil: el menú de cuenta de la cabecera solo se ve en escritorio. */}
              {userName && (
                <div className="mt-2 border-t border-accent-3 pt-2">
                  <Link
                    href="/panel/cuenta"
                    aria-current={pathname === '/panel/cuenta' ? 'page' : undefined}
                    className={cn(
                      'flex items-center rounded-md px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:shadow-focus',
                      pathname === '/panel/cuenta'
                        ? 'bg-base font-semibold text-accent-3'
                        : 'text-base hover:bg-accent-3',
                    )}
                  >
                    Cambiar contraseña
                  </Link>
                  <LogoutButton />
                </div>
              )}
            </nav>
          )}
        </div>
      )}
    </header>
  );
}
