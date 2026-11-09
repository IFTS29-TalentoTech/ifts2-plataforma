import { describe, expect, it } from 'vitest';
import { SETTING_IMAGE_KEYS, SETTING_KEYS, settingsUpdateInput } from '../src';

/** Ajustes de presentación del sitio público: titular corto, logo e imágenes. */
describe('ajustes de presentación (titular e imágenes)', () => {
  it('las claves nuevas forman parte del catálogo de ajustes', () => {
    for (const k of [
      'hero_title',
      'hero_eyebrow',
      'logo_url',
      'hero_image_1',
      'hero_image_2',
      'career_image',
      'ingreso_image',
    ]) {
      expect(SETTING_KEYS).toContain(k);
    }
  });

  it('las imágenes que se suben como archivo son claves del catálogo y la galería de texto ya no existe', () => {
    for (const k of SETTING_IMAGE_KEYS) expect(SETTING_KEYS).toContain(k);
    expect(SETTING_KEYS).not.toContain('student_gallery');
    expect(settingsUpdateInput.safeParse({ student_gallery: '/img/a.webp | T' }).success).toBe(
      false,
    );
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
});
