'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Miniatura de una publicación de redes o propia. Las direcciones de imagen de Instagram EXPIRAN y las de
 * demostración (`*.invalid`) no existen: si la imagen no carga se muestra un recuadro con el texto "IG"
 * (como en el Figma del Resumen) en lugar de un icono roto. La imagen es decorativa (el título ya está al lado).
 */
export function PostThumb({
  src,
  className,
  label = 'IG',
}: {
  src: string | null | undefined;
  className?: string;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Si la imagen ya falló antes de que React enganchara `onError` (carga previa a la hidratación), se detecta acá.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-accent-2 font-display text-sm font-bold text-accent',
        className,
      )}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- URLs externas o firmadas que vencen: no pasan por el optimizador
        <img
          ref={img}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        label
      )}
    </span>
  );
}
