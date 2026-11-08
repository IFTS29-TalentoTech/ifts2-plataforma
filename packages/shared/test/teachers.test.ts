import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  TEACHER_MAX_SUBJECTS,
  can,
  teacherInput,
  teacherOrderInput,
  teacherUpdateInput,
} from '../src';

describe('permiso teachers:manage (RF10, ADR-037)', () => {
  it('lo traen ADMIN y EDITOR, no BEDELIA', () => {
    expect(can(DEFAULT_ROLE_PERMISSIONS.ADMIN, 'teachers:manage')).toBe(true);
    expect(can(DEFAULT_ROLE_PERMISSIONS.EDITOR, 'teachers:manage')).toBe(true);
    expect(can(DEFAULT_ROLE_PERMISSIONS.BEDELIA, 'teachers:manage')).toBe(false);
  });

  it('figura una sola vez en el catálogo de la pantalla de roles, como "Plantel docente"', () => {
    const entries = PERMISSION_GROUPS.flatMap((g) => g.resources).filter((r) =>
      r.permissions.some((p) => p.action === 'teachers:manage'),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.label).toBe('Plantel docente');
  });
});

describe('esquemas del plantel', () => {
  it('el alta exige nombre y completa cargo, materias y visibilidad', () => {
    expect(teacherInput.parse({ name: '  Ana  ' })).toEqual({
      name: 'Ana',
      role: '',
      subjects: [],
      visible: true,
    });
    const sin = teacherInput.safeParse({ name: '   ' });
    expect(sin.success).toBe(false);
    if (!sin.success) expect(sin.error.issues[0]!.message).toBe('El nombre es obligatorio.');
    expect(teacherInput.safeParse({}).success).toBe(false);
  });

  it('limita el largo del nombre, del cargo y de cada materia con mensajes claros', () => {
    expect(teacherInput.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
    const role = teacherInput.safeParse({ name: 'A', role: 'x'.repeat(81) });
    expect(role.success).toBe(false);
    if (!role.success) expect(role.error.issues[0]!.message).toMatch(/80 caracteres/);
    expect(teacherInput.safeParse({ name: 'A', subjects: ['x'.repeat(121)] }).success).toBe(false);
  });

  it('las materias se recortan y se descartan las vacías y las repetidas (sin mayúsculas)', () => {
    const r = teacherInput.parse({
      name: 'A',
      subjects: [' Química ', '', 'QUÍMICA', 'Panadería'],
    });
    expect(r.subjects).toEqual(['Química', 'Panadería']);
  });

  it(`admite hasta ${TEACHER_MAX_SUBJECTS} materias`, () => {
    const ok = Array.from({ length: TEACHER_MAX_SUBJECTS }, (_, i) => `M${i}`);
    expect(teacherInput.safeParse({ name: 'A', subjects: ok }).success).toBe(true);
    expect(teacherInput.safeParse({ name: 'A', subjects: [...ok, 'otra'] }).success).toBe(false);
  });

  it('la edición necesita al menos un campo y acepta ocultar', () => {
    expect(teacherUpdateInput.safeParse({}).success).toBe(false);
    expect(teacherUpdateInput.parse({ visible: false })).toEqual({ visible: false });
  });

  it('el orden pide ids válidos', () => {
    expect(teacherOrderInput.safeParse({ ids: [] }).success).toBe(false);
    expect(teacherOrderInput.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(
      teacherOrderInput.safeParse({ ids: ['00000000-0000-4000-8000-000000000000'] }).success,
    ).toBe(true);
  });
});
