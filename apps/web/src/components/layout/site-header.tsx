'use client';

import { Menu, User, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PUBLIC_NAV } from '@/lib/nav';
import type { SiteInfo } from '@/lib/site';
import { cn } from '@/lib/cn';
import { LogoutButton } from './logout-button';

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
}

/**
 * Nombre de quien tiene la sesión iniciada. En el panel viene resuelto desde el servidor (`userName`).
 * En el sitio público las páginas son estáticas y no pueden leer cookies, así que se consulta
 * `/api/session` desde el navegador. `undefined` = todavía no se sabe (no se muestra ni el botón de
 * ingreso ni "Administración", para que no parpadeen); `null` = sin sesión.
 */
function useSessionName(initial: string | null | undefined): string | null | undefined {
  const [fetched, setFetched] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (initial !== undefined) return;
    let alive = true;
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { name: null }))
      .then((d: { name?: string | null }) => alive && setFetched(d.name ?? null))
      .catch(() => alive && setFetched(null));
    return () => {
      alive = false;
    };
  }, [initial]);
  return initial !== undefined ? initial : fetched;
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Barra superior institucional (público y panel). Menú hamburguesa a 390 px.
 * El nombre y la sigla vienen de la configuración del sitio (SiteSetting), no del código.
 */
export function SiteHeader({ site, panelItems, userName: userNameProp }: Props) {
  const pathname = usePathname();
  const userName = useSessionName(userNameProp);
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
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-3 font-display text-sm font-extrabold text-base"
          >
            {site.short.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 4)}
          </span>
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
            <Link
              href="/panel"
              aria-label={`Cuenta de ${userName}`}
              className="flex h-9 w-9 items-center justify-center rounded-pill border border-accent-2 text-accent-3 hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus"
            >
              <User className="h-4 w-4" aria-hidden="true" />
            </Link>
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
              {panelItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    isActive(pathname, item.href) &&
                    (item.href !== '/panel' || pathname === '/panel')
                      ? 'page'
                      : undefined
                  }
                  className={cn(
                    'flex items-center justify-between rounded-md px-4 py-3 text-sm font-medium text-base hover:bg-accent-3 focus-visible:outline-none focus-visible:shadow-focus',
                    item.href === '/panel'
                      ? pathname === '/panel' && 'bg-base text-accent-3'
                      : isActive(pathname, item.href) && 'bg-base text-accent-3',
                  )}
                >
                  {item.label}
                  {item.count ? (
                    <span className="rounded-pill bg-accent-2 px-2 text-xs font-semibold text-accent-3">
                      {item.count}
                    </span>
                  ) : null}
                </Link>
              ))}
              {/* Cierre de sesión también en móvil (el menú lateral con el botón solo se ve en escritorio). */}
              {userName && (
                <div className="mt-2 border-t border-accent-3 pt-2">
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
