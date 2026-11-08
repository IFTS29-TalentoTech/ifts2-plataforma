'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

/**
 * Barra fina de progreso arriba de todo mientras se cambia de pantalla (en desarrollo Next compila
 * cada ruta al visitarla y el clic parece no hacer nada). Arranca al hacer clic en un enlace
 * interno y termina cuando cambia la ruta o los filtros de la URL. Es solo visual: el estado se
 * anuncia a lectores de pantalla con `role="progressbar"` indeterminado.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const lastUrl = useRef(`${pathname}?${search}`);

  // Termina cuando la URL cambió (la navegación se resolvió).
  useEffect(() => {
    const url = `${pathname}?${search}`;
    if (url === lastUrl.current) return;
    lastUrl.current = url;
    const t1 = setTimeout(() => setState('done'), 0);
    const t2 = setTimeout(() => setState('idle'), 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname, search]);

  // Arranca con el clic en un enlace interno que cambia de URL.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (`${url.pathname}${url.search}` === `${location.pathname}${location.search}`) return;
      setState('loading');
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  if (state === 'idle') return null;
  return (
    <div
      role="progressbar"
      aria-label="Cargando página"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden"
    >
      <div
        className={
          state === 'loading'
            ? 'h-full w-2/3 animate-nav-progress bg-accent'
            : 'h-full w-full bg-accent transition-opacity duration-300'
        }
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
