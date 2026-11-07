import { describe, expect, it } from 'vitest';
import { getImageProps } from 'next/image';
import { canOptimizeCover } from '../src/features/public/cover-policy';

const api = 'https://api.example.test:444';

describe('portadas: selección del optimizador', () => {
  it.each([`${api}/cover.webp`, '/cover.webp'])(
    'optimiza únicamente una imagen propia sin parámetros: %s',
    (src) => expect(canOptimizeCover(src, api)).toBe(true),
  );

  it.each([
    'https://externa.example.test/cover.webp',
    'https://api.example.test/cover.webp',
    'http://api.example.test:444/cover.webp',
    'https://api.example.test.evil.test:444/cover.webp',
    '//externa.example.test/cover.webp',
    `${api}/api/v1/files/social/cover.webp?exp=123&sig=abc`,
    '/api/v1/files/social/cover.webp?exp=123&sig=abc',
    'https://bucket.example.test/social/cover.webp?X-Amz-Signature=abc',
    'http://localhost:4000/cover.webp',
    'http://127.0.0.1:4000/cover.webp',
    'http://[::1]:4000/cover.webp',
    'memory://cover.webp',
  ])('carga directamente sin ampliar remotePatterns: %s', (src) => {
    const origin = src.includes('4000') ? new URL(src).origin : api;
    expect(canOptimizeCover(src, origin)).toBe(false);
    const { props } = getImageProps({
      src,
      alt: '',
      width: 640,
      height: 360,
      unoptimized: !canOptimizeCover(src, origin),
    });
    expect(props.src).toBe(src);
    expect(props.srcSet).toBeUndefined();
    expect(props.loading).toBe('lazy');
    expect(props.width).toBe(640);
    expect(props.height).toBe(360);
  });

  it('rechaza credenciales y configuración inválida sin lanzar errores', () => {
    expect(canOptimizeCover('https://user:pass@api.example.test:444/a.webp', api)).toBe(false);
    expect(canOptimizeCover('https://[', api)).toBe(false);
    expect(canOptimizeCover('/a.webp', 'incorrecta')).toBe(false);
  });
});
