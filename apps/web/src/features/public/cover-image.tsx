'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

/** RNF03: una portada caída o vencida no impide leer la publicación. */
export function CoverImage(props: ImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        role="img"
        aria-label={props.alt ? `${props.alt}. Imagen no disponible` : 'Imagen no disponible'}
        className={`${props.className ?? ''} flex aspect-video items-center justify-center bg-base p-4 text-sm text-font-strong`}
      >
        <span aria-hidden="true">Imagen no disponible</span>
      </div>
    );
  }
  return <Image {...props} onError={() => setFailed(true)} />;
}
