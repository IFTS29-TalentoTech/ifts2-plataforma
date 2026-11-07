'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * MENÚ DE ACCIONES (Radix DropdownMenu). Para un puñado de acciones sobre un elemento, por ejemplo
 * "Cambiar rol / Restablecer contraseña / Desactivar" sobre un usuario. Se abre con clic, Enter o
 * espacio; se recorre con las flechas; Escape lo cierra y el foco vuelve al disparador.
 * Las acciones que borran o desactivan igual pasan por el <ConfirmDialog> único.
 *
 *   <DropdownMenu>
 *     <DropdownMenuTrigger asChild><button>…</button></DropdownMenuTrigger>
 *     <DropdownMenuContent label="Ana Pérez">
 *       <DropdownMenuItem onSelect={…}>Cambiar rol</DropdownMenuItem>
 *       <DropdownMenuSeparator />
 *       <DropdownMenuItem tone="danger" onSelect={…}>Desactivar</DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  label,
  className,
  children,
  align = 'end',
  ...props
}: ComponentPropsWithoutRef<typeof Menu.Content> & {
  /** Encabezado opcional del menú (por ejemplo, el nombre de la persona). */
  label?: ReactNode;
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        collisionPadding={16}
        className={cn(
          'z-50 min-w-[14rem] max-w-[calc(100vw-2rem)] rounded-lg border border-accent-2 bg-surface p-1 shadow-popover focus:outline-none',
          className,
        )}
        {...props}
      >
        {label && (
          <Menu.Label className="break-words px-3 pb-1 pt-2 text-xs text-font-strong">
            {label}
          </Menu.Label>
        )}
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  tone = 'default',
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Menu.Item> & { tone?: 'default' | 'danger' }) {
  return (
    <Menu.Item
      className={cn(
        // 44 px de alto: objetivo táctil cómodo (WCAG 2.2, 2.5.8).
        'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-md px-3 text-sm font-medium outline-none',
        'data-[highlighted]:bg-base data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
        tone === 'danger' ? 'text-danger-text' : 'text-accent-3',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn('my-1 h-px bg-accent-2', className)} />;
}
