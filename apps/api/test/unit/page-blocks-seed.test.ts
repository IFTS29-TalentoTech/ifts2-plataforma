/**
 * Coherencia entre el catálogo de bloques (@ifts2/shared, ADR-042) y la semilla: toda sección de texto
 * que trae la semilla debe figurar como FIJA (se oculta pero no se elimina) y toda sección fija del
 * catálogo debe existir en la semilla. Si alguien agrega una sección a la semilla y no al catálogo,
 * aparecería en el panel como "agregada por una persona" y se podría eliminar sin poder recrearla.
 */
import { describe, expect, it } from 'vitest';
import { FIXED_SECTIONS, isFixedSection, isHeaderSection } from '@ifts2/shared';
import { CONTENT } from '../../../../prisma/seed-data';

describe('catálogo de bloques vs. semilla', () => {
  it('toda sección de texto de la semilla es una sección fija del catálogo', () => {
    for (const s of CONTENT) {
      expect(isFixedSection(s.page, s.slug), `${s.page}/${s.slug}`).toBe(true);
    }
  });

  it('toda sección fija del catálogo existe en la semilla', () => {
    const seeded = new Set(CONTENT.map((s) => `${s.page}/${s.slug}`));
    for (const key of Object.keys(FIXED_SECTIONS)) expect(seeded.has(key), key).toBe(true);
  });

  it('el encabezado de cada página con secciones es la primera sección de la semilla', () => {
    for (const page of ['institucional', 'carrera'] as const) {
      const first = CONTENT.filter((s) => s.page === page).sort((a, b) => a.order - b.order)[0]!;
      expect(isHeaderSection(page, first.slug)).toBe(true);
    }
  });
});
