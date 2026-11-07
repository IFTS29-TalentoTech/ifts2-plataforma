import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  GALLERY_MAX_PER_AREA,
  PERMISSION_GROUPS,
  can,
  galleryCreateFields,
  galleryOrderInput,
  galleryUpdateInput,
  publicGalleryQuery,
} from '../src';

describe('permiso gallery:manage (RF09, ADR-036)', () => {
  it('lo traen ADMIN y EDITOR, no BEDELIA', () => {
    expect(can(DEFAULT_ROLE_PERMISSIONS.ADMIN, 'gallery:manage')).toBe(true);
    expect(can(DEFAULT_ROLE_PERMISSIONS.EDITOR, 'gallery:manage')).toBe(true);
    expect(can(DEFAULT_ROLE_PERMISSIONS.BEDELIA, 'gallery:manage')).toBe(false);
  });

  it('figura una sola vez en el catálogo de la pantalla de roles, como "Galerías"', () => {
    const entries = PERMISSION_GROUPS.flatMap((g) => g.resources).filter((r) =>
      r.permissions.some((p) => p.action === 'gallery:manage'),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.label).toBe('Galerías');
  });
});

describe('esquemas de galería', () => {
  it('el alta exige un área válida y completa los textos con vacío', () => {
    const ok = galleryCreateFields.parse({ area: 'CAREER' });
    expect(ok).toEqual({ area: 'CAREER', title: '', caption: '', alt: '' });
    expect(galleryCreateFields.safeParse({ area: 'OTRA' }).success).toBe(false);
    expect(galleryCreateFields.safeParse({}).success).toBe(false);
  });

  it('recorta espacios y limita el largo de los textos con mensajes claros', () => {
    expect(galleryCreateFields.parse({ area: 'STUDENTS', title: '  Cocina  ' }).title).toBe(
      'Cocina',
    );
    const long = galleryCreateFields.safeParse({ area: 'STUDENTS', title: 'x'.repeat(81) });
    expect(long.success).toBe(false);
    if (!long.success) expect(long.error.issues[0]!.message).toMatch(/80 caracteres/);
  });

  it('la edición necesita al menos un campo', () => {
    expect(galleryUpdateInput.safeParse({}).success).toBe(false);
    expect(galleryUpdateInput.safeParse({ caption: 'nueva' }).success).toBe(true);
  });

  it('el orden pide ids válidos y no más del máximo por galería', () => {
    const id = '6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111';
    expect(galleryOrderInput.safeParse({ area: 'STUDENTS', ids: [id] }).success).toBe(true);
    expect(galleryOrderInput.safeParse({ area: 'STUDENTS', ids: [] }).success).toBe(false);
    expect(galleryOrderInput.safeParse({ area: 'STUDENTS', ids: ['x'] }).success).toBe(false);
    expect(
      galleryOrderInput.safeParse({
        area: 'STUDENTS',
        ids: Array.from({ length: GALLERY_MAX_PER_AREA + 1 }, () => id),
      }).success,
    ).toBe(false);
  });

  it('la lectura pública exige el área', () => {
    expect(publicGalleryQuery.safeParse({}).success).toBe(false);
    expect(publicGalleryQuery.safeParse({ area: 'STUDENTS' }).success).toBe(true);
  });
});
