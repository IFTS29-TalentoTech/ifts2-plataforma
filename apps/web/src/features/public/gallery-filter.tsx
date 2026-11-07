/**
 * Galería de Estudiantes con filtro por categoría (RF09, US-30).
 *
 * Recibe las tarjetas ya dibujadas por el servidor (`node`) y solo decide cuáles mostrar:
 * - Si ninguna diapositiva tiene categoría, no hay filtro: se ve el carrusel de siempre.
 * - Los botones son un grupo con `aria-pressed` ("Todas" por defecto); el cambio se anuncia en una
 *   región `role="status"` ("Mostrando n de N fotos") para quien usa lector de pantalla.
 * - Sin JavaScript se ve el carrusel completo (mejora progresiva: el filtro solo reduce lo mostrado).
 * - Al cambiar de categoría el carrusel se vuelve a montar (`key`) para volver a la primera tarjeta.
 * - Ids fijos y sin `useId` (un id generado difería entre servidor y cliente en producción).
 */
'use client';

import { useState, type ReactNode } from 'react';
import { Carousel } from '@/components/ui';

export interface FilterableSlide {
  key: string;
  /** Categoría; vacía = sin categoría (solo aparece en "Todas"). */
  category: string;
  node: ReactNode;
}

export function GalleryFilter({
  label,
  slides,
  slideClassName,
}: {
  label: string;
  slides: FilterableSlide[];
  slideClassName?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null); // null = Todas
  const categories = [...new Set(slides.map((s) => s.category).filter(Boolean))];
  const visible = selected ? slides.filter((s) => s.category === selected) : slides;

  return (
    <div className="flex flex-col gap-4">
      {categories.length > 0 && (
        <div role="group" aria-label="Filtrar por categoría" className="flex flex-wrap gap-2">
          {[null, ...categories].map((c) => {
            const pressed = selected === c;
            return (
              <button
                key={c ?? '__todas'}
                type="button"
                aria-pressed={pressed}
                onClick={() => setSelected(c)}
                // Sin `cn`: tailwind-merge confunde `text-base` (color del tema) con un tamaño de fuente.
                className={
                  'min-h-10 rounded-pill border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-focus ' +
                  (pressed
                    ? 'border-accent-3 bg-accent-3 text-base'
                    : 'border-accent-2 bg-surface text-accent-3 hover:bg-accent-2')
                }
              >
                {c ?? 'Todas'}
              </button>
            );
          })}
        </div>
      )}
      {categories.length > 0 && (
        <p role="status" className="sr-only">
          {selected
            ? `Mostrando ${visible.length} de ${slides.length} fotos de la categoría ${selected}.`
            : `Mostrando las ${slides.length} fotos.`}
        </p>
      )}
      <Carousel
        key={selected ?? '__todas'}
        label={label}
        slideClassName={slideClassName}
        slides={visible.map((s) => s.node)}
      />
    </div>
  );
}
