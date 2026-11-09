import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ASSIGNABLE_ACTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  can,
  effectivePermissions,
  isSubsetOf,
  roleCreateInput,
  rolePermissionsInput,
  contactInput,
  examCallCreateInput,
  loginInput,
  noticeCreateInput,
  publicationCreateInput,
  settingsUpdateInput,
  socialApproveInput,
  termCreateInput,
  userCreateInput,
  socialManualInput,
  text,
  email,
  url,
} from '../src';

const msgs = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

// Matriz inicial de la semilla (RF11): después el Superadministrador la edita desde el panel.
const BEDELIA = DEFAULT_ROLE_PERMISSIONS.BEDELIA;
const EDITOR = DEFAULT_ROLE_PERMISSIONS.EDITOR;
const ADMIN = DEFAULT_ROLE_PERMISSIONS.ADMIN;

describe('can(permisos, acción) con la matriz inicial', () => {
  it('ADMIN arranca con todo salvo roles:manage', () => {
    for (const a of ACTIONS) expect(can(ADMIN, a)).toBe(a !== 'roles:manage');
  });
  it('BEDELIA: avisos, horarios y archivo sí; usuarios, configuración y redes no', () => {
    expect(can(BEDELIA, 'notices:manage')).toBe(true);
    expect(can(BEDELIA, 'schedules:manage')).toBe(true);
    expect(can(BEDELIA, 'documents:manage')).toBe(true);
    expect(can(BEDELIA, 'users:manage')).toBe(false);
    expect(can(BEDELIA, 'settings:manage')).toBe(false);
    expect(can(BEDELIA, 'social:moderate')).toBe(false);
    expect(can(BEDELIA, 'audit:read')).toBe(false);
    // Q41: Bedelía lee mensajes de contacto pero no puede eliminarlos.
    expect(can(BEDELIA, 'contact:read')).toBe(true);
    expect(can(BEDELIA, 'contact:delete')).toBe(false);
    expect(can(ADMIN, 'contact:delete')).toBe(true);
  });
  it('EDITOR: publicaciones y redes sí; avisos, horarios y usuarios no', () => {
    expect(can(EDITOR, 'publications:manage')).toBe(true);
    expect(can(EDITOR, 'social:moderate')).toBe(true);
    expect(can(EDITOR, 'notices:manage')).toBe(false);
    expect(can(EDITOR, 'documents:manage')).toBe(false);
    expect(can(EDITOR, 'integrations:manage')).toBe(false);
  });
  it('sin permisos no puede nada (denegar por defecto)', () => {
    expect(can(null, 'dashboard:read')).toBe(false);
    expect(can(undefined, 'dashboard:read')).toBe(false);
    expect(can([], 'dashboard:read')).toBe(false);
  });
  it('solo ADMIN gestiona configuración, integraciones, usuarios y ve auditoría', () => {
    for (const a of [
      'settings:manage',
      'integrations:manage',
      'users:manage',
      'audit:read',
      'terms:setPublic',
    ] as const) {
      expect(can(BEDELIA, a)).toBe(false);
      expect(can(EDITOR, a)).toBe(false);
    }
  });
});

describe('catálogo de permisos (RF11)', () => {
  it('cada acción asignable aparece exactamente una vez en las casillas; roles:manage no aparece', () => {
    const shown = PERMISSION_GROUPS.flatMap((g) =>
      g.resources.flatMap((r) => r.permissions.map((p) => p.action)),
    );
    expect([...shown].sort()).toEqual([...ASSIGNABLE_ACTIONS].sort());
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown).not.toContain('roles:manage');
  });
  it('SUPERADMIN tiene todo; otro rol nunca obtiene roles:manage aunque esté guardado', () => {
    expect(effectivePermissions('SUPERADMIN', [])).toEqual([...ACTIONS]);
    expect(effectivePermissions('ADMIN', ['roles:manage', 'notices:manage', 'inventado'])).toEqual([
      'notices:manage',
    ]);
  });
  it('isSubsetOf: base de la regla anti-escalada', () => {
    expect(isSubsetOf(EDITOR, ADMIN)).toBe(true);
    expect(isSubsetOf(ADMIN, EDITOR)).toBe(false);
    expect(isSubsetOf([], EDITOR)).toBe(true);
  });
  it('rolePermissionList: rechaza permisos inexistentes y roles:manage, y quita repetidos', () => {
    const bad = rolePermissionsInput.safeParse({ permissions: ['roles:manage', 'no:existe'] });
    expect(msgs(bad)).toEqual([
      'El permiso roles:manage es exclusivo del Superadministrador.',
      'El permiso no:existe no existe.',
    ]);
    expect(
      rolePermissionsInput.parse({ permissions: ['notices:manage', 'notices:manage'] }).permissions,
    ).toEqual(['notices:manage']);
  });
  it('roleCreateInput: nombre obligatorio', () => {
    expect(msgs(roleCreateInput.safeParse({ name: ' ' }))).toContain(
      'El nombre del rol es obligatorio.',
    );
  });
});

describe('esquemas zod: mensajes claros', () => {
  it('aviso: título vacío y fin anterior al inicio', () => {
    const r = noticeCreateInput.safeParse({
      title: '  ',
      body: 'x',
      visibleFrom: '2026-11-10',
      visibleUntil: '2026-11-01',
    });
    expect(r.success).toBe(false);
    expect(msgs(r)).toContain('El título es obligatorio.');
    expect(msgs(r)).toContain('La fecha de fin debe ser posterior a la fecha de inicio.');
  });
  it('aviso: acepta fechas como día y las lleva a Buenos Aires', () => {
    const r = noticeCreateInput.parse({
      title: 'Aviso',
      body: 'Texto',
      visibleUntil: '2026-11-25',
    });
    expect(r.visibleUntil?.toISOString()).toBe('2026-11-26T02:59:59.999Z');
    expect(r.audience).toBe('ALL');
  });
  it('usuario: correo inválido, rol inválido', () => {
    const r = userCreateInput.safeParse({ name: 'Ana', email: 'no-es-correo', roleId: 'SUPER' });
    expect(r.success).toBe(false);
    expect(msgs(r).some((m) => m.includes('formato válido'))).toBe(true);
    expect(msgs(r).some((m) => m.includes('El rol'))).toBe(true);
  });
  it('usuario: normaliza el correo a minúsculas', () => {
    expect(
      userCreateInput.parse({
        name: 'Ana',
        email: 'ANA@Bue.edu.ar',
        roleId: '8d4e7b0e-1c1f-4c8e-9a43-2f5a3a3b7e11',
      }).email,
    ).toBe('ana@bue.edu.ar');
  });
  it('login: campos obligatorios', () => {
    const r = loginInput.safeParse({});
    expect(msgs(r)).toEqual(
      expect.arrayContaining(['El correo es obligatorio.', 'La contraseña es obligatoria.']),
    );
  });
  it('ciclo: año obligatorio y período válido', () => {
    expect(msgs(termCreateInput.safeParse({ kind: 'SECOND' }))).toContain(
      'El año lectivo es obligatorio.',
    );
    expect(termCreateInput.safeParse({ year: 2026, kind: 'SECOND' }).success).toBe(true);
  });
  it('llamado: fin anterior al inicio', () => {
    const r = examCallCreateInput.safeParse({
      termId: '8d4e7b0e-1c1f-4c8e-9a43-2f5a3a3b7e11',
      name: 'Turno',
      startsOn: '2026-12-10',
      endsOn: '2026-12-01',
    });
    expect(msgs(r)).toContain('La fecha de fin no puede ser anterior a la de inicio.');
  });
  it('publicación: evento con fin anterior al inicio', () => {
    const r = publicationCreateInput.safeParse({
      title: 'Jornada',
      summary: 'Resumen',
      kind: 'EVENT',
      eventStart: '2026-11-10',
      eventEnd: '2026-11-01',
    });
    expect(msgs(r)).toContain('El fin del evento no puede ser anterior a su inicio.');
  });
  it('moderación: exige confirmar consentimiento', () => {
    const r = socialApproveInput.safeParse({ section: 'HOME', consentConfirmed: false });
    expect(msgs(r)[0]).toMatch(/consentimiento/);
    expect(socialApproveInput.safeParse({ section: 'HOME', consentConfirmed: true }).success).toBe(
      true,
    );
  });
  it('contacto: exige consentimiento', () => {
    const r = contactInput.safeParse({
      name: 'A',
      email: 'a@b.com',
      subject: 's',
      message: 'm',
      consent: false,
    });
    expect(msgs(r)[0]).toMatch(/aviso de uso de datos/);
  });
  it('ajustes: hashtag se normaliza con # y rechaza claves desconocidas', () => {
    expect(settingsUpdateInput.parse({ instagram_hashtag: 'ifts2web' }).instagram_hashtag).toBe(
      '#ifts2web',
    );
    expect(settingsUpdateInput.safeParse({ inventada: 'x' }).success).toBe(false);
    expect(settingsUpdateInput.safeParse({}).success).toBe(false);
  });
});

describe('mensajes de validación: concordancia de género y número', () => {
  const first = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
    r.error?.issues[0]?.message;
  it('femenino: "La leyenda es obligatoria."', () => {
    expect(first(text('La leyenda').safeParse(''))).toBe('La leyenda es obligatoria.');
  });
  it('masculino: "El título es obligatorio."', () => {
    expect(first(text('El título').safeParse(''))).toBe('El título es obligatorio.');
  });
  it('plural: "Las notas son obligatorias." y "Los datos son obligatorios."', () => {
    expect(first(text('Las notas').safeParse(''))).toBe('Las notas son obligatorias.');
    expect(first(text('Los datos').safeParse(''))).toBe('Los datos son obligatorios.');
  });
  it('género explícito para rótulos sin artículo', () => {
    expect(first(text('Dirección web', 200, 'f').safeParse(''))).toBe(
      'Dirección web es obligatoria.',
    );
  });
  it('largo máximo y tipo inválido concuerdan', () => {
    expect(first(text('La leyenda', 3).safeParse('abcd'))).toBe(
      'La leyenda no puede superar los 3 caracteres.',
    );
    expect(first(text('La leyenda').safeParse(5))).toBe('La leyenda no es válida.');
    expect(first(email('El correo').safeParse(5))).toBe('El correo no es válido.');
    expect(first(url('El enlace').safeParse(''))).toBe('El enlace es obligatorio.');
    expect(first(url('La dirección').safeParse(''))).toBe('La dirección es obligatoria.');
  });
  it('esquemas reales: enlace de la publicación (la leyenda y la fecha son opcionales, ADR-045)', () => {
    const r = socialManualInput.safeParse({});
    const m = (r as { error?: { issues: { message: string }[] } }).error?.issues.map(
      (i) => i.message,
    );
    expect(m).toContain('El enlace a la publicación es obligatorio.');
    expect(m).not.toContain('El enlace a la publicación es obligatoria.');
    // Solo con el enlace alcanza: la leyenda y la imagen se resuelven con la API o se completan después.
    expect(
      socialManualInput.safeParse({ permalink: 'https://www.instagram.com/p/AbCdE12/' }).success,
    ).toBe(true);
    expect(
      socialManualInput.safeParse({
        permalink: 'https://www.instagram.com/p/AbCdE12/',
        mediaUrl: '',
      }).success,
    ).toBe(true);
  });
});
