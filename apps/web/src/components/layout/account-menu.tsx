'use client';

import { User } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LogoutButton } from './logout-button';

/**
 * Menú de cuenta de la cabecera (A16): nombre, rol, acceso al panel y "Cerrar sesión".
 * Sin dependencias nuevas: es un botón con `aria-expanded` y un panel que se cierra con Escape
 * (devolviendo el foco al botón), al hacer clic afuera o al salir del menú con el teclado.
 * Los datos vienen de la sesión que ya tiene la cabecera; acá no se consulta nada.
 */
export function AccountMenu({
  name,
  roleName,
  inPanel,
}: {
  name: string;
  roleName?: string | null;
  inPanel: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Id fijo (una sola cuenta por página): evita useId, cuyos ids pueden diferir entre servidor y cliente.
  const panelId = 'account-menu-panel';

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onFocusIn(e: FocusEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Cuenta de ${name}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-pill border border-accent-2 text-accent-3 hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus"
      >
        <User className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-accent-2 bg-surface p-3 shadow-popover"
        >
          <p className="truncate font-display text-sm font-bold text-accent-3">{name}</p>
          {roleName && <p className="truncate text-xs text-font-strong">{roleName}</p>}
          <div className="mt-3 flex flex-col gap-1 border-t border-accent-2 pt-3">
            {!inPanel && (
              <Link
                href="/panel"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-accent-3 hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus"
              >
                Ir al panel
              </Link>
            )}
            <LogoutButton tone="light" />
          </div>
        </div>
      )}
    </div>
  );
}
