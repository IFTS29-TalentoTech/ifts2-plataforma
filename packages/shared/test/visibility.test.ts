import { describe, expect, it } from 'vitest';
import {
  endOfDayBA,
  hasSinglePublicTerm,
  isExamCallVisible,
  isNoticeExpiringSoon,
  isNoticeVisible,
  isPublicationVisible,
  isScheduleVisible,
  startOfDayBA,
  toDateStrBA,
} from '../src';

const d = (s: string) => new Date(s);
const NOW = d('2026-10-29T15:00:00Z');

describe('isPublicationVisible', () => {
  it('PUBLISHED sin fechas es visible', () => {
    expect(isPublicationVisible({ status: 'PUBLISHED' }, NOW)).toBe(true);
  });
  it('PUBLISHED con visibleFrom/visibleUntil nulos o indefinidos es visible', () => {
    expect(isPublicationVisible({ status: 'PUBLISHED', visibleFrom: null, visibleUntil: null }, NOW)).toBe(true);
  });
  it('visibleFrom es inclusivo: justo en el límite es visible, un ms antes no', () => {
    expect(isPublicationVisible({ status: 'PUBLISHED', visibleFrom: NOW }, NOW)).toBe(true);
    expect(isPublicationVisible({ status: 'PUBLISHED', visibleFrom: new Date(NOW.getTime() + 1) }, NOW)).toBe(false);
  });
  it('visibleUntil es exclusivo: justo en el límite ya no es visible, un ms antes sí', () => {
    expect(isPublicationVisible({ status: 'PUBLISHED', visibleUntil: NOW }, NOW)).toBe(false);
    expect(isPublicationVisible({ status: 'PUBLISHED', visibleUntil: new Date(NOW.getTime() + 1) }, NOW)).toBe(true);
  });
  it('PAUSED, DRAFT nunca son visibles aunque estén en ventana', () => {
    expect(isPublicationVisible({ status: 'PAUSED' }, NOW)).toBe(false);
    expect(isPublicationVisible({ status: 'DRAFT' }, NOW)).toBe(false);
  });
  it('SCHEDULED pasa a visible al llegar visibleFrom y deja de serlo al vencer', () => {
    const from = d('2026-10-30T03:00:00Z');
    expect(isPublicationVisible({ status: 'SCHEDULED', visibleFrom: from }, d('2026-10-30T02:59:59.999Z'))).toBe(false);
    expect(isPublicationVisible({ status: 'SCHEDULED', visibleFrom: from }, from)).toBe(true);
    expect(isPublicationVisible({ status: 'SCHEDULED', visibleFrom: from, visibleUntil: d('2026-11-01T03:00:00Z') }, d('2026-11-02T00:00:00Z'))).toBe(false);
  });
  it('SCHEDULED sin visibleFrom nunca se activa sola', () => {
    expect(isPublicationVisible({ status: 'SCHEDULED' }, NOW)).toBe(false);
  });
});

describe('isNoticeVisible', () => {
  it('ACTIVE dentro de vigencia es visible', () => {
    expect(isNoticeVisible({ status: 'ACTIVE', visibleFrom: d('2026-10-01T00:00:00Z'), visibleUntil: d('2026-11-26T02:59:59.999Z') }, NOW)).toBe(true);
  });
  it('vencido (visibleUntil pasado) no es visible', () => {
    expect(isNoticeVisible({ status: 'ACTIVE', visibleUntil: d('2026-10-01T00:00:00Z') }, NOW)).toBe(false);
  });
  it('PAUSED no es visible', () => {
    expect(isNoticeVisible({ status: 'PAUSED' }, NOW)).toBe(false);
  });
  it('aún no empezó: no es visible', () => {
    expect(isNoticeVisible({ status: 'ACTIVE', visibleFrom: d('2026-11-01T00:00:00Z') }, NOW)).toBe(false);
  });
  it('un fin dado como día incluye todo el día en Buenos Aires', () => {
    const until = endOfDayBA('2026-11-25');
    expect(isNoticeVisible({ status: 'ACTIVE', visibleUntil: until }, d('2026-11-26T02:59:00Z'))).toBe(true); // 23:59 BA
    expect(isNoticeVisible({ status: 'ACTIVE', visibleUntil: until }, d('2026-11-26T03:00:00Z'))).toBe(false); // 00:00 BA del 26
  });
});

describe('isNoticeExpiringSoon', () => {
  it('vence dentro de 7 días: true', () => {
    expect(isNoticeExpiringSoon({ status: 'ACTIVE', visibleUntil: d('2026-11-03T15:00:00Z') }, NOW)).toBe(true);
  });
  it('vence exactamente a los 7 días: true (borde inclusivo)', () => {
    expect(isNoticeExpiringSoon({ status: 'ACTIVE', visibleUntil: d('2026-11-05T15:00:00Z') }, NOW)).toBe(true);
  });
  it('vence en más de 7 días: false', () => {
    expect(isNoticeExpiringSoon({ status: 'ACTIVE', visibleUntil: d('2026-11-05T15:00:01Z') }, NOW)).toBe(false);
  });
  it('sin fecha de fin, ya vencido o pausado: false', () => {
    expect(isNoticeExpiringSoon({ status: 'ACTIVE' }, NOW)).toBe(false);
    expect(isNoticeExpiringSoon({ status: 'ACTIVE', visibleUntil: d('2026-10-01T00:00:00Z') }, NOW)).toBe(false);
    expect(isNoticeExpiringSoon({ status: 'PAUSED', visibleUntil: d('2026-11-01T00:00:00Z') }, NOW)).toBe(false);
  });
});

describe('ciclo público', () => {
  it('horarios y llamados solo son visibles si están publicados y su ciclo es el público', () => {
    expect(isScheduleVisible({ published: true }, { publicCurrent: true })).toBe(true);
    expect(isScheduleVisible({ published: true }, { publicCurrent: false })).toBe(false);
    expect(isScheduleVisible({ published: false }, { publicCurrent: true })).toBe(false);
    expect(isExamCallVisible({ published: true }, { publicCurrent: true })).toBe(true);
    expect(isExamCallVisible({ published: true }, { publicCurrent: false })).toBe(false);
  });
  it('un ciclo que deja de ser público oculta sus horarios', () => {
    const term = { publicCurrent: true };
    const s = { published: true };
    expect(isScheduleVisible(s, term)).toBe(true);
    term.publicCurrent = false;
    expect(isScheduleVisible(s, term)).toBe(false);
  });
  it('debe haber exactamente un ciclo publicCurrent', () => {
    expect(hasSinglePublicTerm([{ publicCurrent: true }, { publicCurrent: false }])).toBe(true);
    expect(hasSinglePublicTerm([{ publicCurrent: true }, { publicCurrent: true }])).toBe(false);
    expect(hasSinglePublicTerm([{ publicCurrent: false }])).toBe(false);
  });
});

describe('zona horaria Buenos Aires', () => {
  it('medianoche en Buenos Aires es 03:00 UTC', () => {
    expect(startOfDayBA('2026-12-01').toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(endOfDayBA('2026-12-01').toISOString()).toBe('2026-12-02T02:59:59.999Z');
  });
  it('a las 23:30 BA del 31/12 todavía es 31/12; a las 00:00 BA ya es 01/01', () => {
    expect(toDateStrBA(d('2027-01-01T02:30:00Z'))).toBe('2026-12-31');
    expect(toDateStrBA(d('2027-01-01T03:00:00Z'))).toBe('2027-01-01');
  });
});
