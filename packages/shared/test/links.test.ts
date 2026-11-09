/** Enlaces de interés (ADR-039): lugares donde se muestran y orden. */
import { describe, expect, it } from 'vitest';
import { LINK_PLACES, linkInput, linkOrderInput } from '../src';

describe('linkInput · lugares', () => {
  it('por defecto se muestra en Inicio y Estudiantes, no en Inscripciones (como antes)', () => {
    const l = linkInput.parse({ title: 'SIU', url: 'https://siu.test/' });
    expect(l).toMatchObject({ showHome: true, showStudents: true, enrollment: false });
  });

  it('acepta elegir cualquier combinación y rechaza valores que no son sí/no', () => {
    const l = linkInput.parse({
      title: 'SIU',
      url: 'https://siu.test/',
      showHome: false,
      showStudents: false,
      enrollment: true,
    });
    expect(l).toMatchObject({ showHome: false, showStudents: false, enrollment: true });
    expect(
      linkInput.safeParse({ title: 'x', url: 'https://x.test/', showHome: 'si' }).success,
    ).toBe(false);
  });

  it('LINK_PLACES describe cada lugar con una frase para quien edita', () => {
    expect(LINK_PLACES.map((p) => p.key)).toEqual(['showHome', 'showStudents', 'enrollment']);
    for (const p of LINK_PLACES) expect(p.hint.length).toBeGreaterThan(20);
  });
});

describe('linkOrderInput', () => {
  it('pide ids (uuid) y al menos uno', () => {
    expect(linkOrderInput.safeParse({ ids: [] }).success).toBe(false);
    expect(linkOrderInput.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(
      linkOrderInput.safeParse({ ids: ['6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111'] }).success,
    ).toBe(true);
  });
});
