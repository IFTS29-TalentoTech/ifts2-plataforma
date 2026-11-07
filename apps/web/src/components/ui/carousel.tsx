'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Carrusel accesible (RF09, ADR-036), sin reproducción automática.
 *
 * - Patrón WAI-ARIA de carrusel: la región se anuncia como "carrusel" (`aria-roledescription`) con su
 *   nombre, y cada diapositiva como "diapositiva n de N".
 * - Mejora progresiva: la pista es un contenedor con scroll horizontal y `scroll-snap`; sin
 *   JavaScript se puede desplazar con el dedo, el mouse o el teclado (la pista recibe foco y las
 *   flechas ← → la desplazan). Con JavaScript se suman botones Anterior/Siguiente y puntos.
 * - Los controles aparecen solo si hay algo para desplazar (con 3 tarjetas visibles en escritorio no
 *   se muestran; en el celular sí). Los botones se deshabilitan en los extremos.
 * - Respeta `prefers-reduced-motion`: el desplazamiento es instantáneo, sin animación.
 * - Sin trampas de foco: los botones están en el orden normal de tabulación y nada captura el foco.
 * - Ids fijos y sin `useId` (un id generado difería entre servidor y cliente en producción).
 */
export function Carousel({
  label,
  slides,
  slideClassName = 'w-full',
  className,
}: {
  /** Nombre de la región ("Vida en la cocina"). */
  label: string;
  /** Una entrada por diapositiva. */
  slides: ReactNode[];
  /** Ancho de cada diapositiva (clases del tema): define cuántas se ven a la vez. */
  slideClassName?: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [overflow, setOverflow] = useState(false);

  const total = slides.length;

  /** Recalcula índice activo y extremos a partir de la posición de la pista. */
  const sync = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setOverflow(max > 1);
    setCanPrev(track.scrollLeft > 1);
    setCanNext(track.scrollLeft < max - 1);
    // Diapositiva activa: la más cercana al borde izquierdo; al final de la pista, la última.
    let best = 0;
    let bestDist = Infinity;
    slideRefs.current.forEach((el, i) => {
      if (!el) return;
      const d = Math.abs(el.offsetLeft - track.scrollLeft);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    setActive(max > 1 && track.scrollLeft >= max - 1 ? total - 1 : best);
  }, [total]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    sync();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(track);
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [sync]);

  function goTo(index: number) {
    const track = trackRef.current;
    const el = slideRefs.current[Math.max(0, Math.min(total - 1, index))];
    if (!track || !el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ left: el.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
  }

  const controls = overflow && total > 1;

  return (
    <section
      aria-roledescription="carrusel"
      aria-label={label}
      className={cn('flex flex-col gap-4', className)}
      data-testid="carousel"
    >
      <div
        ref={trackRef}
        // Foco en la pista: así quien navega con teclado puede desplazarla con las flechas aun si
        // las diapositivas no tienen nada enfocable (requisito de axe "scrollable-region-focusable").
        tabIndex={0}
        className={cn(
          'relative flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth rounded-xl pb-1 motion-reduce:scroll-auto',
          'focus-visible:outline-none focus-visible:shadow-focus',
          // Con botones propios, la barra de desplazamiento sobra.
          controls && '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${total}`}
            className={cn('shrink-0 snap-start', slideClassName)}
          >
            {slide}
          </div>
        ))}
      </div>

      {controls && (
        <div className="flex items-center justify-center gap-3" data-testid="carousel-controls">
          <ul className="flex items-center" aria-label="Elegir diapositiva">
            {slides.map((_, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Ir a la diapositiva ${i + 1} de ${total}`}
                  aria-current={i === active ? 'true' : undefined}
                  className="flex h-6 min-w-6 items-center justify-center rounded-pill focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-2 rounded-pill transition-all motion-reduce:transition-none',
                      // Contraste de componente (WCAG 1.4.11): el punto inactivo y el activo se distinguen del fondo.
                      i === active ? 'w-6 bg-accent-3' : 'w-2 bg-font-strong',
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo(active - 1)}
              disabled={!canPrev}
              aria-label="Diapositiva anterior"
              className="flex h-10 w-10 items-center justify-center rounded-pill border border-accent-2 bg-surface text-accent-3 hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => goTo(active + 1)}
              disabled={!canNext}
              aria-label="Diapositiva siguiente"
              className="flex h-10 w-10 items-center justify-center rounded-pill border border-accent-2 bg-surface text-accent-3 hover:bg-accent-2 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
