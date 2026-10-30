import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs, type LoggedIn } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createTerm } from '../helpers/factories';
import {
  createDocumentRow,
  createExamCallRow,
  createScheduleRow,
  DAY,
  fromNow,
} from '../helpers/academic-factories';

let t: TestApp;
let bedelia: LoggedIn;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  bedelia = await loginAs(t.app, 'BEDELIA');
});

const as = (c: string) => ({
  get: (u: string) => request(t.app).get(u).set('Cookie', c),
  post: (u: string, b: object = {}) => request(t.app).post(u).set('Cookie', c).send(b),
  patch: (u: string, b: object = {}) => request(t.app).patch(u).set('Cookie', c).send(b),
  del: (u: string) => request(t.app).delete(u).set('Cookie', c),
});

describe('permisos (horarios y llamados)', () => {
  it('401 sin sesión, 403 EDITOR, 200 BEDELIA y ADMIN', async () => {
    for (const path of ['/api/v1/schedules', '/api/v1/exam-calls']) {
      expect((await request(t.app).get(path)).status).toBe(401);
      const editor = await loginAs(t.app, 'EDITOR');
      expect((await as(editor.cookie).get(path)).status).toBe(403);
      expect((await as(editor.cookie).post(path, {})).status).toBe(403);
      expect((await as(bedelia.cookie).get(path)).status).toBe(200);
      const admin = await loginAs(t.app, 'ADMIN');
      expect((await as(admin.cookie).get(path)).status).toBe(200);
    }
  });
});

describe('Horarios', () => {
  it('crea (sin publicar), lista por ciclo con la forma documentada y audita', async () => {
    const term = await createTerm({ publicCurrent: true });
    const doc = await createDocumentRow({ kind: 'SCHEDULE' });
    const res = await as(bedelia.cookie).post('/api/v1/schedules', {
      termId: term.id,
      commissionName: ' Comisión A y B ',
      documentId: doc.id,
      notes: 'Turno noche',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      termId: term.id,
      term: {
        id: term.id,
        year: 2026,
        kind: 'SECOND',
        label: '2026 · 2.º cuatrimestre',
        publicCurrent: true,
      },
      commissionName: 'Comisión A y B',
      documentId: doc.id,
      document: { id: doc.id, filename: doc.filename, mimeType: 'application/pdf' },
      notes: 'Turno noche',
      published: false,
      visibleNow: false,
      updatedBy: bedelia.user.id,
    });
    expect(await testPrisma.auditLog.count({ where: { action: 'schedule.create' } })).toBe(1);

    const other = await createTerm({ year: 2025 });
    await createScheduleRow({ termId: other.id });
    const list = await as(bedelia.cookie).get(`/api/v1/schedules?termId=${term.id}`);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect((await as(bedelia.cookie).get('/api/v1/schedules')).body.total).toBe(2);
    expect((await as(bedelia.cookie).get('/api/v1/schedules?termId=no')).status).toBe(400);
  });

  it('valida obligatorios, ciclo inexistente, adjunto inválido y duplicados', async () => {
    const term = await createTerm();
    const p = (b: object) => as(bedelia.cookie).post('/api/v1/schedules', b);
    let res = await p({});
    expect(res.status).toBe(400);
    expect(res.body.errors.commissionName[0]).toBe('El nombre de la comisión es obligatorio.');
    expect(res.body.errors.termId).toBeDefined();

    res = await p({ termId: '11111111-1111-4111-8111-111111111111', commissionName: 'X' });
    expect(res.status).toBe(422);
    expect(res.body.errors.termId).toBeDefined();

    res = await p({
      termId: term.id,
      commissionName: 'X',
      documentId: '11111111-1111-4111-8111-111111111111',
    });
    expect(res.status).toBe(422);
    expect(res.body.errors.documentId).toBeDefined();

    expect((await p({ termId: term.id, commissionName: 'Comision Unica' })).status).toBe(201);
    const dup = await p({ termId: term.id, commissionName: 'COMISION unica' });
    expect(dup.status).toBe(409);
    expect(dup.body.errors.commissionName).toBeDefined();
    // el mismo nombre en otro ciclo está permitido
    const other = await createTerm({ year: 2025 });
    expect((await p({ termId: other.id, commissionName: 'Comision Unica' })).status).toBe(201);
  });

  it('publicar requiere archivo; publish/unpublish cambian el estado (409 si repite)', async () => {
    const term = await createTerm({ publicCurrent: true });
    const noFile = await createScheduleRow({ termId: term.id });
    const r = await as(bedelia.cookie).post(`/api/v1/schedules/${noFile.id}/publish`);
    expect(r.status).toBe(422);
    expect(r.body.errors.documentId).toBeDefined();

    const doc = await createDocumentRow();
    const s = await createScheduleRow({ termId: term.id, documentId: doc.id });
    const pub = await as(bedelia.cookie).post(`/api/v1/schedules/${s.id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ published: true, visibleNow: true });
    expect((await as(bedelia.cookie).post(`/api/v1/schedules/${s.id}/publish`)).status).toBe(409);

    const un = await as(bedelia.cookie).post(`/api/v1/schedules/${s.id}/unpublish`);
    expect(un.body).toMatchObject({ published: false, visibleNow: false });
    expect((await as(bedelia.cookie).post(`/api/v1/schedules/${s.id}/unpublish`)).status).toBe(409);
    expect(
      await testPrisma.auditLog.count({ where: { action: { startsWith: 'schedule.' } } }),
    ).toBe(2);
  });

  it('un publicado en ciclo NO público no es visible (visibleNow=false)', async () => {
    const term = await createTerm({ publicCurrent: false });
    const doc = await createDocumentRow();
    const s = await createScheduleRow({ termId: term.id, documentId: doc.id, published: true });
    expect((await as(bedelia.cookie).get(`/api/v1/schedules/${s.id}`)).body.visibleNow).toBe(false);
  });

  it('PATCH edita, no deja quitar el archivo de uno publicado y 404/400', async () => {
    const term = await createTerm({ publicCurrent: true });
    const doc = await createDocumentRow();
    const s = await createScheduleRow({ termId: term.id, documentId: doc.id, published: true });
    const ok = await as(bedelia.cookie).patch(`/api/v1/schedules/${s.id}`, {
      notes: 'Actualizado',
    });
    expect(ok.body.notes).toBe('Actualizado');
    const bad = await as(bedelia.cookie).patch(`/api/v1/schedules/${s.id}`, { documentId: null });
    expect(bad.status).toBe(422);
    expect((await as(bedelia.cookie).patch(`/api/v1/schedules/${s.id}`, {})).status).toBe(400);
    expect(
      (
        await as(bedelia.cookie).patch('/api/v1/schedules/11111111-1111-4111-8111-111111111111', {
          notes: 'x',
        })
      ).status,
    ).toBe(404);
    // renombrar a un nombre ya usado en el ciclo
    await createScheduleRow({ termId: term.id, commissionName: 'Otra' });
    expect(
      (await as(bedelia.cookie).patch(`/api/v1/schedules/${s.id}`, { commissionName: 'otra' }))
        .status,
    ).toBe(409);
  });

  it('DELETE: 409 si se muestra hoy; 204 si no está publicado o su ciclo ya no es el público', async () => {
    const pub = await createTerm({ year: 2026, kind: 'SECOND', publicCurrent: true });
    const old = await createTerm({ year: 2025, kind: 'SECOND' });
    const doc = await createDocumentRow();
    const visible = await createScheduleRow({
      termId: pub.id,
      documentId: doc.id,
      published: true,
    });
    const draft = await createScheduleRow({ termId: pub.id });
    const archivedTerm = await createScheduleRow({
      termId: old.id,
      documentId: doc.id,
      published: true,
    });

    expect((await as(bedelia.cookie).del(`/api/v1/schedules/${visible.id}`)).status).toBe(409);
    expect(await testPrisma.schedule.count({ where: { id: visible.id } })).toBe(1);
    expect((await as(bedelia.cookie).del(`/api/v1/schedules/${draft.id}`)).status).toBe(204);
    expect((await as(bedelia.cookie).del(`/api/v1/schedules/${archivedTerm.id}`)).status).toBe(204);
    expect(await testPrisma.auditLog.count({ where: { action: 'schedule.delete' } })).toBe(2);
    expect((await as(bedelia.cookie).del(`/api/v1/schedules/${draft.id}`)).status).toBe(404);
  });
});

describe('Llamados a examen', () => {
  const body = (termId: string, over: object = {}) => ({
    termId,
    name: 'Turno extraordinario de Diciembre 2026',
    startsOn: '2026-12-01',
    endsOn: '2026-12-18',
    enrollmentOpen: true,
    highlighted: true,
    ...over,
  });

  it('crea con la forma documentada (sin publicar) y audita', async () => {
    const term = await createTerm({ publicCurrent: true });
    const res = await as(bedelia.cookie).post('/api/v1/exam-calls', body(term.id));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      termId: term.id,
      name: 'Turno extraordinario de Diciembre 2026',
      enrollmentOpen: true,
      highlighted: true,
      documentId: null,
      document: null,
      notes: null,
      published: false,
      visibleNow: false,
      updatedBy: bedelia.user.id,
    });
    expect(res.body.startsOn).toBe('2026-12-01T03:00:00.000Z'); // 00:00 en Buenos Aires
    expect(res.body.endsOn).toBe('2026-12-19T02:59:59.999Z'); // 23:59:59.999 en Buenos Aires
    expect(await testPrisma.auditLog.count({ where: { action: 'exam-call.create' } })).toBe(1);
  });

  it('valida: nombre obligatorio, fechas coherentes, duplicado en el ciclo (409)', async () => {
    const term = await createTerm();
    const p = (b: object) => as(bedelia.cookie).post('/api/v1/exam-calls', b);
    let res = await p({ termId: term.id });
    expect(res.status).toBe(400);
    expect(res.body.errors.name[0]).toBe('El nombre del llamado es obligatorio.');
    expect(res.body.errors.startsOn).toBeDefined();

    res = await p(body(term.id, { startsOn: '2026-12-10', endsOn: '2026-12-01' }));
    expect(res.status).toBe(400);
    expect(res.body.errors.endsOn[0]).toMatch(/anterior/);

    expect((await p(body(term.id))).status).toBe(201);
    const dup = await p(body(term.id));
    expect(dup.status).toBe(409);
    expect(dup.body.errors.name).toBeDefined();
  });

  it('lista ordenada por fecha, filtra por ciclo y publicado', async () => {
    const a = await createTerm({ year: 2026, kind: 'SECOND', publicCurrent: true });
    const b = await createTerm({ year: 2025 });
    await createExamCallRow({
      termId: a.id,
      name: 'Tarde',
      startsOn: fromNow(20 * DAY),
      endsOn: fromNow(25 * DAY),
    });
    await createExamCallRow({
      termId: a.id,
      name: 'Temprano',
      startsOn: fromNow(2 * DAY),
      endsOn: fromNow(3 * DAY),
      published: true,
    });
    await createExamCallRow({ termId: b.id, name: 'Viejo' });
    const names = async (qs: string) =>
      (await as(bedelia.cookie).get(`/api/v1/exam-calls?${qs}`)).body.items.map(
        (c: { name: string }) => c.name,
      );
    expect(await names(`termId=${a.id}`)).toEqual(['Temprano', 'Tarde']);
    expect(await names('published=true')).toEqual(['Temprano']);
    expect((await names('')).length).toBe(3);
  });

  it('PATCH valida fechas contra las guardadas y publish/unpublish (409 si repite)', async () => {
    const term = await createTerm({ publicCurrent: true });
    const c = await createExamCallRow({ termId: term.id });
    const bad = await as(bedelia.cookie).patch(`/api/v1/exam-calls/${c.id}`, {
      endsOn: '2000-01-01',
    });
    expect(bad.status).toBe(422);
    const ok = await as(bedelia.cookie).patch(`/api/v1/exam-calls/${c.id}`, {
      enrollmentOpen: true,
      notes: 'ok',
    });
    expect(ok.body).toMatchObject({ enrollmentOpen: true, notes: 'ok' });
    const pub = await as(bedelia.cookie).post(`/api/v1/exam-calls/${c.id}/publish`);
    expect(pub.body).toMatchObject({ published: true, visibleNow: true });
    expect((await as(bedelia.cookie).post(`/api/v1/exam-calls/${c.id}/publish`)).status).toBe(409);
    expect(
      (await as(bedelia.cookie).post(`/api/v1/exam-calls/${c.id}/unpublish`)).body.published,
    ).toBe(false);
    expect((await as(bedelia.cookie).post(`/api/v1/exam-calls/${c.id}/unpublish`)).status).toBe(
      409,
    );
  });

  it('no publica con un archivo archivado; adjuntar uno archivado da 422', async () => {
    const term = await createTerm({ publicCurrent: true });
    const archived = await createDocumentRow({ status: 'ARCHIVED' });
    const res = await as(bedelia.cookie).post(
      '/api/v1/exam-calls',
      body(term.id, { documentId: archived.id }),
    );
    expect(res.status).toBe(422);
    const c = await createExamCallRow({ termId: term.id, documentId: archived.id });
    expect((await as(bedelia.cookie).post(`/api/v1/exam-calls/${c.id}/publish`)).status).toBe(422);
  });

  it('DELETE: 409 publicado en ciclo público; 204 si no lo está; auditado', async () => {
    const pub = await createTerm({ publicCurrent: true });
    const old = await createTerm({ year: 2025 });
    const visible = await createExamCallRow({ termId: pub.id, published: true });
    const draft = await createExamCallRow({ termId: pub.id });
    const oldPublished = await createExamCallRow({ termId: old.id, published: true });
    expect((await as(bedelia.cookie).del(`/api/v1/exam-calls/${visible.id}`)).status).toBe(409);
    expect((await as(bedelia.cookie).del(`/api/v1/exam-calls/${draft.id}`)).status).toBe(204);
    expect((await as(bedelia.cookie).del(`/api/v1/exam-calls/${oldPublished.id}`)).status).toBe(
      204,
    );
    expect(await testPrisma.auditLog.count({ where: { action: 'exam-call.delete' } })).toBe(2);
  });
});
