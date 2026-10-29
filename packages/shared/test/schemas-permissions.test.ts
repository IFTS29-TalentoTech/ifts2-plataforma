import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  can,
  contactInput,
  examCallCreateInput,
  loginInput,
  noticeCreateInput,
  publicationCreateInput,
  settingsUpdateInput,
  socialApproveInput,
  termCreateInput,
  userCreateInput,
} from '../src';

const msgs = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

describe('can(role, action)', () => {
  it('ADMIN puede todo', () => {
    for (const a of ACTIONS) expect(can('ADMIN', a)).toBe(true);
  });
  it('BEDELIA: avisos, horarios y archivo sí; usuarios, configuración y redes no', () => {
    expect(can('BEDELIA', 'notices:manage')).toBe(true);
    expect(can('BEDELIA', 'schedules:manage')).toBe(true);
    expect(can('BEDELIA', 'documents:manage')).toBe(true);
    expect(can('BEDELIA', 'users:manage')).toBe(false);
    expect(can('BEDELIA', 'settings:manage')).toBe(false);
    expect(can('BEDELIA', 'social:moderate')).toBe(false);
    expect(can('BEDELIA', 'audit:read')).toBe(false);
  });
  it('EDITOR: publicaciones y redes sí; avisos, horarios y usuarios no', () => {
    expect(can('EDITOR', 'publications:manage')).toBe(true);
    expect(can('EDITOR', 'social:moderate')).toBe(true);
    expect(can('EDITOR', 'notices:manage')).toBe(false);
    expect(can('EDITOR', 'documents:manage')).toBe(false);
    expect(can('EDITOR', 'integrations:manage')).toBe(false);
  });
  it('sin rol no puede nada', () => {
    expect(can(null, 'dashboard:read')).toBe(false);
    expect(can(undefined, 'dashboard:read')).toBe(false);
  });
  it('solo ADMIN gestiona configuración, integraciones, usuarios y ve auditoría', () => {
    for (const a of ['settings:manage', 'integrations:manage', 'users:manage', 'audit:read', 'terms:setPublic'] as const) {
      expect(can('BEDELIA', a)).toBe(false);
      expect(can('EDITOR', a)).toBe(false);
    }
  });
});

describe('esquemas zod: mensajes claros', () => {
  it('aviso: título vacío y fin anterior al inicio', () => {
    const r = noticeCreateInput.safeParse({ title: '  ', body: 'x', visibleFrom: '2026-11-10', visibleUntil: '2026-11-01' });
    expect(r.success).toBe(false);
    expect(msgs(r)).toContain('El título es obligatorio.');
    expect(msgs(r)).toContain('La fecha de fin debe ser posterior a la fecha de inicio.');
  });
  it('aviso: acepta fechas como día y las lleva a Buenos Aires', () => {
    const r = noticeCreateInput.parse({ title: 'Aviso', body: 'Texto', visibleUntil: '2026-11-25' });
    expect(r.visibleUntil?.toISOString()).toBe('2026-11-26T02:59:59.999Z');
    expect(r.audience).toBe('ALL');
  });
  it('usuario: correo inválido, rol inválido', () => {
    const r = userCreateInput.safeParse({ name: 'Ana', email: 'no-es-correo', role: 'SUPER' });
    expect(r.success).toBe(false);
    expect(msgs(r).some((m) => m.includes('formato válido'))).toBe(true);
    expect(msgs(r).some((m) => m.includes('El rol'))).toBe(true);
  });
  it('usuario: normaliza el correo a minúsculas', () => {
    expect(userCreateInput.parse({ name: 'Ana', email: 'ANA@Bue.edu.ar', role: 'EDITOR' }).email).toBe('ana@bue.edu.ar');
  });
  it('login: campos obligatorios', () => {
    const r = loginInput.safeParse({});
    expect(msgs(r)).toEqual(expect.arrayContaining(['El correo es obligatorio.', 'La contraseña es obligatoria.']));
  });
  it('ciclo: año obligatorio y período válido', () => {
    expect(msgs(termCreateInput.safeParse({ kind: 'SECOND' }))).toContain('El año lectivo es obligatorio.');
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
    expect(socialApproveInput.safeParse({ section: 'HOME', consentConfirmed: true }).success).toBe(true);
  });
  it('contacto: exige consentimiento', () => {
    const r = contactInput.safeParse({ name: 'A', email: 'a@b.com', subject: 's', message: 'm', consent: false });
    expect(msgs(r)[0]).toMatch(/aviso de uso de datos/);
  });
  it('ajustes: hashtag se normaliza con # y rechaza claves desconocidas', () => {
    expect(settingsUpdateInput.parse({ instagram_hashtag: 'ifts2web' }).instagram_hashtag).toBe('#ifts2web');
    expect(settingsUpdateInput.safeParse({ inventada: 'x' }).success).toBe(false);
    expect(settingsUpdateInput.safeParse({}).success).toBe(false);
  });
});
