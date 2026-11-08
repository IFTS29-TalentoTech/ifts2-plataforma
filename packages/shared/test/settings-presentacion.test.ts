import { describe, expect, it } from 'vitest';
import { GALLERY_MAX_ITEMS, SETTING_KEYS, parseGallery, settingsUpdateInput } from '../src';

/** Ajustes de presentación del sitio público: titular corto, logo, imágenes y galería. */
describe('ajustes de presentación (titular, imágenes y galería)', () => {
  it('las claves nuevas forman parte del catálogo de ajustes', () => {
    for (const k of [
      'hero_title',
      'hero_eyebrow',
      'logo_url',
      'hero_image_1',
      'hero_image_2',
      'career_image',
      'ingreso_image',
      'student_gallery',
    ]) {
      expect(SETTING_KEYS).toContain(k);
    }
  });

  it('acepta titular, rótulo, rutas del sitio y direcciones web', () => {
    const r = settingsUpdateInput.safeParse({
      hero_title: '  Formamos emprendedores  ',
      hero_eyebrow: 'Educación pública · Formación técnica',
      logo_url: '/img/provisorio/logo.webp',
      hero_image_1: 'https://cdn.example.org/a.webp',
      career_image: '/img/a.webp',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hero_title).toBe('Formamos emprendedores');
  });

  it('permite vaciar titular e imágenes (vuelve al valor por defecto o sin imagen)', () => {
    const r = settingsUpdateInput.safeParse({ hero_title: '', hero_image_1: '', logo_url: '' });
    expect(r.success).toBe(true);
  });

  it.each([
    'foto.jpg',
    '//otro.sitio/x.png',
    'javascript:alert(1)',
    '/con espacio.jpg',
    'ftp://x/y',
  ])('rechaza la imagen %s con un mensaje claro', (bad) => {
    const r = settingsUpdateInput.safeParse({ hero_image_1: bad });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/ruta del sitio|dirección web/);
  });

  it('rechaza un titular demasiado largo', () => {
    const r = settingsUpdateInput.safeParse({ hero_title: 'x'.repeat(121) });
    expect(r.success).toBe(false);
  });

  it('valida cada línea de la galería', () => {
    expect(
      settingsUpdateInput.safeParse({
        student_gallery: '/img/a.webp | Título | Texto\n/img/b.webp',
      }).success,
    ).toBe(true);
    expect(settingsUpdateInput.safeParse({ student_gallery: 'sin ruta | Título' }).success).toBe(
      false,
    );
  });

  describe('parseGallery', () => {
    it('lee ruta, título y descripción por línea', () => {
      expect(
        parseGallery('/img/a.webp | Cocina | Equipo y aprendizaje\r\n/img/b.webp | Solo título'),
      ).toEqual([
        { src: '/img/a.webp', title: 'Cocina', description: 'Equipo y aprendizaje' },
        { src: '/img/b.webp', title: 'Solo título', description: '' },
      ]);
    });

    it('ignora líneas vacías o con ruta inválida y limita la cantidad', () => {
      expect(parseGallery('\n  \nmal | x\n')).toEqual([]);
      expect(parseGallery(null)).toEqual([]);
      const many = Array.from({ length: GALLERY_MAX_ITEMS + 3 }, (_, i) => `/img/${i}.webp`).join(
        '\n',
      );
      expect(parseGallery(many)).toHaveLength(GALLERY_MAX_ITEMS);
    });
  });
});
