import { describe, expect, it } from 'vitest';
import {
  ALL_PAGE_BLOCKS,
  CONTENT_PAGES,
  FIXED_SECTIONS,
  HIDEABLE_BLOCK_IDS,
  PAGE_LAYOUT,
  SETTING_KEYS,
  SITE_PAGES,
  blockIdParams,
  contentOrderInput,
  contentVisibleInput,
  isBlockVisible,
  isFixedSection,
  isHeaderSection,
  parseHiddenBlocks,
} from '../src';

/** Catálogo de bloques de cada página (ADR-042): la fuente única del panel y del sitio público. */
describe('catálogo de bloques de las páginas', () => {
  it('todas las páginas del sitio aceptan secciones agregadas', () => {
    expect([...SITE_PAGES].sort()).toEqual([...CONTENT_PAGES].sort());
  });

  it('cada página tiene un encabezado que siempre se muestra, y es lo primero', () => {
    for (const page of SITE_PAGES) {
      const first = PAGE_LAYOUT[page][0]!;
      expect(first.type).toBe('block');
      if (first.type !== 'block') continue;
      expect(first.block.id).toBe(`${page}.encabezado`);
      expect(first.block.canHide).toBe(false);
    }
  });

  it('los identificadores son únicos, llevan el nombre de su página y cada bloque se explica', () => {
    const ids = ALL_PAGE_BLOCKS.map((b) => b.block.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { page, block } of ALL_PAGE_BLOCKS) {
      expect(block.id.startsWith(`${page}.`)).toBe(true);
      expect(block.name.length).toBeGreaterThan(3);
      expect(block.description.length).toBeGreaterThan(10);
      // Un bloque que se carga en otra pantalla debe decir a cuál llevar.
      if (block.source === 'otra-pantalla' || block.source === 'enlaces') {
        expect(block.editHref?.startsWith('/panel/')).toBe(true);
      }
    }
  });

  it('solo se pueden ocultar los bloques que lo permiten', () => {
    expect(HIDEABLE_BLOCK_IDS).toContain('estudiantes.avisos');
    expect(HIDEABLE_BLOCK_IDS).toContain('inicio.enlaces');
    expect(HIDEABLE_BLOCK_IDS).not.toContain('inicio.encabezado');
    expect(blockIdParams.safeParse({ blockId: 'estudiantes.avisos' }).success).toBe(true);
    expect(blockIdParams.safeParse({ blockId: 'inicio.encabezado' }).success).toBe(false);
    expect(blockIdParams.safeParse({ blockId: 'inventado' }).success).toBe(false);
  });

  it('cada página tiene lugar para las secciones y las galerías que se agregan', () => {
    for (const page of SITE_PAGES) {
      const types = PAGE_LAYOUT[page].map((s) => s.type);
      expect(types).toContain('sections');
      expect(types).toContain('galleries');
    }
  });

  it('las secciones fijas: el encabezado es de Institucional y La carrera; las demás son tarjetas', () => {
    expect(isHeaderSection('institucional', 'presentacion')).toBe(true);
    expect(isHeaderSection('carrera', 'titulo-y-duracion')).toBe(true);
    expect(isHeaderSection('institucional', 'sede')).toBe(false);
    expect(isFixedSection('institucional', 'sede')).toBe(true);
    expect(isFixedSection('institucional', 'una-seccion-agregada')).toBe(false);
    // La clave lleva la página: el mismo identificador en otra página no es fijo.
    expect(isFixedSection('estudiantes', 'sede')).toBe(false);
    for (const info of Object.values(FIXED_SECTIONS)) {
      expect(info.name.length).toBeGreaterThan(3);
      expect(info.description.length).toBeGreaterThan(10);
    }
  });
});

describe('bloques ocultos', () => {
  it('el ajuste hidden_blocks forma parte del catálogo de ajustes', () => {
    expect(SETTING_KEYS).toContain('hidden_blocks');
  });

  it('parseHiddenBlocks tolera vacío, JSON roto y valores ajenos', () => {
    expect(parseHiddenBlocks(undefined)).toEqual([]);
    expect(parseHiddenBlocks('')).toEqual([]);
    expect(parseHiddenBlocks('{no es json')).toEqual([]);
    expect(parseHiddenBlocks('{"a":1}')).toEqual([]);
    expect(parseHiddenBlocks('["estudiantes.avisos","inicio.encabezado",3,"x"]')).toEqual([
      'estudiantes.avisos',
    ]);
  });

  it('isBlockVisible: se muestra salvo que esté en la lista de ocultos', () => {
    expect(isBlockVisible([], 'estudiantes.avisos')).toBe(true);
    expect(isBlockVisible(['estudiantes.avisos'], 'estudiantes.avisos')).toBe(false);
    expect(isBlockVisible(['estudiantes.avisos'], 'estudiantes.horarios')).toBe(true);
  });

  it('validan los cuerpos de mostrar/ocultar y de ordenar', () => {
    expect(contentVisibleInput.safeParse({ visible: false }).success).toBe(true);
    expect(contentVisibleInput.safeParse({}).success).toBe(false);
    expect(contentOrderInput.safeParse({ slugs: ['a', 'b'] }).success).toBe(true);
    expect(contentOrderInput.safeParse({ slugs: ['a'] }).success).toBe(false);
  });
});
