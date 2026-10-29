'use client';

import { useRef } from 'react';

/**
 * Devuelve el foco al elemento que abrió un diálogo controlado (sin <Trigger> de Radix).
 * Uso: const rf = useRestoreFocus(); <Content onOpenAutoFocus={rf.onOpenAutoFocus} onCloseAutoFocus={rf.onCloseAutoFocus} />
 */
export function useRestoreFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const el = document.activeElement;
      opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
    },
    onCloseAutoFocus: (event: Event) => {
      if (opener.current && opener.current.isConnected) {
        event.preventDefault();
        opener.current.focus();
      }
    },
  };
}
