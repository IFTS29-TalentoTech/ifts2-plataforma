'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * Logo del encabezado. Sale del ajuste `logo_url` (ruta del sitio o dirección https, ADR-035).
 * Sin logo configurado, o si la imagen no carga (RNF03), se muestran las iniciales de la sigla:
 * el encabezado nunca queda con una imagen rota.
 */
export function SiteLogo({ short, src }: { short: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <Image
        src={src}
        alt=""
        width={40}
        height={40}
        priority
        // Solo las rutas propias pasan por el optimizador de Next; las direcciones externas se cargan directo.
        unoptimized={!src.startsWith('/')}
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-md object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-3 font-display text-sm font-extrabold text-base"
    >
      {short.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 4)}
    </span>
  );
}
