import { describe, expect, it } from 'vitest';
import { toSiteInfo } from '../src/lib/site';

/** SiteInfo: titular corto, imágenes y galería salen de los ajustes (ADR-22 / ADR-035). */
describe('toSiteInfo: presentación del sitio público', () => {
  it('lee titular, rótulo, logo, imágenes y galería de los ajustes', () => {
    const s = toSiteInfo({
      hero_title: 'Titular corto',
      hero_eyebrow: 'Rótulo',
      logo_url: '/img/logo.webp',
      hero_image_1: '/img/a.webp',
      hero_image_2: 'https://cdn.example.org/b.webp',
      career_image: '/img/c.webp',
      ingreso_image: '/img/d.webp',
      student_gallery: '/img/g1.webp | Uno | Primera\n/img/g2.webp | Dos',
    });
    expect(s).toMatchObject({
      heroTitle: 'Titular corto',
      heroEyebrow: 'Rótulo',
      logoUrl: '/img/logo.webp',
      heroImage1: '/img/a.webp',
      heroImage2: 'https://cdn.example.org/b.webp',
      careerImage: '/img/c.webp',
      ingresoImage: '/img/d.webp',
    });
    expect(s.gallery).toEqual([
      { src: '/img/g1.webp', title: 'Uno', description: 'Primera' },
      { src: '/img/g2.webp', title: 'Dos', description: '' },
    ]);
  });

  it('sin configuración no hay imágenes ni titular (las pantallas no se rompen)', () => {
    const s = toSiteInfo({});
    expect(s.heroTitle).toBe('');
    expect(s.logoUrl).toBe('');
    expect(s.heroImage1).toBe('');
    expect(s.gallery).toEqual([]);
  });
});
