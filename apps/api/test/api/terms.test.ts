import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createTerm } from '../helpers/factories';
import { createExamCallRow, createScheduleRow } from '../helpers/academic-factories';
import { setPublicTerm } from '../../src/modules/terms/terms.service';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
});

describe('permisos de /terms', () => {
  it('401 sin sesión, 403 para EDITOR; BEDELIA lista/crea pero NO cambia el ciclo público', async () => {
    const term = await createTerm();
    expect((await request(t.app).get('/api/v1/terms')).status).toBe(401);
    const editor = await loginAs(t.app, 'EDITOR');
    expect((await request(t.app).get('/api/v1/terms').set('Cookie', editor.cookie)).status).toBe(
      403,
    );

    const bedelia = await loginAs(t.app, 'BEDELIA');
    expect((await request(t.app).get('/api/v1/terms').set('Cookie', bedelia.cookie)).status).toBe(
      200,
    );
    expect(
      (
        await request(t.app)
          .post('/api/v1/terms')
          .set('Cookie', bedelia.cookie)
          .send({ year: 2027, kind: 'FIRST' })
      ).status,
    ).toBe(201);
    const put = await request(t.app)
      .put(`/api/v1/terms/${term.id}/public-current`)
      .set('Cookie', bedelia.cookie);
    expect(put.status).toBe(403);
    expect((await request(t.app).put(`/api/v1/terms/${term.id}/public-current`)).status).toBe(401);
  });
});

describe('GET/POST/PATCH /terms', () => {
  it('lista con la forma documentada, más nuevos primero, con contadores', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    const old = await createTerm({ year: 2025, kind: 'SECOND' });
    const cur = await createTerm({ year: 2026, kind: 'SECOND', publicCurrent: true });
    await createScheduleRow({ termId: cur.id });
    await createExamCallRow({ termId: cur.id });
    await createExamCallRow({ termId: cur.id });

    const res = await request(t.app).get('/api/v1/terms').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 50, total: 2 });
    expect(res.body.items[0]).toEqual({
      id: cur.id,
      year: 2026,
      kind: 'SECOND',
      label: '2026 · 2.º cuatrimestre',
      startsOn: null,
      endsOn: null,
      publicCurrent: true,
      counts: { schedules: 1, examCalls: 2 },
    });
    expect(res.body.items[1].id).toBe(old.id);
  });

  it('crea (no público), rechaza duplicados año+período (409) y valida', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    const post = (body: object) =>
      request(t.app).post('/api/v1/terms').set('Cookie', admin.cookie).send(body);
    const ok = await post({
      year: 2026,
      kind: 'FIRST',
      startsOn: '2026-03-02',
      endsOn: '2026-07-10',
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ year: 2026, kind: 'FIRST', publicCurrent: false });
    expect(await testPrisma.auditLog.count({ where: { action: 'term.create' } })).toBe(1);

    const dup = await post({ year: 2026, kind: 'FIRST' });
    expect(dup.status).toBe(409);
    expect(dup.body.errors.year[0]).toMatch(/Ya existe un ciclo/);

    expect((await post({ year: 1999, kind: 'FIRST' })).body.errors.year).toBeDefined();
    expect((await post({ year: 2026, kind: 'OTRO' })).status).toBe(400);
    expect(
      (await post({ year: 2027, kind: 'FIRST', startsOn: '2027-05-01', endsOn: '2027-04-01' }))
        .status,
    ).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it('PATCH cambia solo fechas y valida el orden', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    const term = await createTerm();
    const patch = (body: object) =>
      request(t.app).patch(`/api/v1/terms/${term.id}`).set('Cookie', admin.cookie).send(body);
    const ok = await patch({ startsOn: '2026-08-03', endsOn: '2026-12-18' });
    expect(ok.status).toBe(200);
    expect(ok.body.startsOn).toBeTruthy();
    expect((await patch({ endsOn: '2026-07-01' })).status).toBe(422);
    expect((await patch({})).status).toBe(400);
  });
});

describe('PUT /terms/:id/public-current', () => {
  it('deja EXACTAMENTE un ciclo público y audita el cambio', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    const a = await createTerm({ year: 2026, kind: 'FIRST', publicCurrent: true });
    const b = await createTerm({ year: 2026, kind: 'SECOND' });

    const res = await request(t.app)
      .put(`/api/v1/terms/${b.id}/public-current`)
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: b.id, publicCurrent: true });

    const rows = await testPrisma.academicTerm.findMany({ where: { publicCurrent: true } });
    expect(rows.map((r) => r.id)).toEqual([b.id]);
    expect(
      (await testPrisma.academicTerm.findUniqueOrThrow({ where: { id: a.id } })).publicCurrent,
    ).toBe(false);

    const log = await testPrisma.auditLog.findFirstOrThrow({
      where: { action: 'term.set-public' },
    });
    expect(log).toMatchObject({ entityId: b.id, userId: admin.user.id });
    expect(log.detail).toEqual({ previousTermIds: [a.id] });
  });

  it('es idempotente: repetirlo no cambia nada ni duplica la auditoría', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    const a = await createTerm({ publicCurrent: true });
    const res = await request(t.app)
      .put(`/api/v1/terms/${a.id}/public-current`)
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(await testPrisma.auditLog.count({ where: { action: 'term.set-public' } })).toBe(0);
  });

  it('funciona cuando todavía no hay ciclo público y responde 404 si el ciclo no existe', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    const a = await createTerm();
    expect(
      (await request(t.app).put(`/api/v1/terms/${a.id}/public-current`).set('Cookie', admin.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        await request(t.app)
          .put('/api/v1/terms/11111111-1111-4111-8111-111111111111/public-current')
          .set('Cookie', admin.cookie)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(t.app)
          .put('/api/v1/terms/no-es-uuid/public-current')
          .set('Cookie', admin.cookie)
      ).status,
    ).toBe(400);
  });

  it('dos cambios simultáneos nunca dejan dos ciclos públicos (índice único parcial)', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    const a = await createTerm({ year: 2026, kind: 'FIRST', publicCurrent: true });
    const b = await createTerm({ year: 2026, kind: 'SECOND' });
    const c = await createTerm({ year: 2026, kind: 'EXTRAORDINARY' });
    const results = await Promise.all([
      request(t.app).put(`/api/v1/terms/${b.id}/public-current`).set('Cookie', admin.cookie),
      request(t.app).put(`/api/v1/terms/${c.id}/public-current`).set('Cookie', admin.cookie),
    ]);
    for (const r of results) expect([200, 409]).toContain(r.status);
    expect(await testPrisma.academicTerm.count({ where: { publicCurrent: true } })).toBe(1);
    expect(a.id).toBeTruthy();
  });

  it('la base rechaza dos ciclos públicos aunque se intente por fuera de la API', async () => {
    await createTerm({ year: 2026, kind: 'FIRST', publicCurrent: true });
    await expect(createTerm({ year: 2026, kind: 'SECOND', publicCurrent: true })).rejects.toThrow();
  });
});

describe('setPublicTerm (servicio, contra la base)', () => {
  it('apaga el anterior y enciende el nuevo en una transacción; si falla, no cambia nada', async () => {
    const a = await createTerm({ year: 2026, kind: 'FIRST', publicCurrent: true });
    const b = await createTerm({ year: 2026, kind: 'SECOND' });

    await expect(
      testPrisma.$transaction(async (tx) => {
        await setPublicTerm(tx, b.id);
        throw new Error('falla a mitad de camino');
      }),
    ).rejects.toThrow('falla a mitad');
    // Rollback: el ciclo anterior sigue siendo el público.
    expect(
      (await testPrisma.academicTerm.findUniqueOrThrow({ where: { id: a.id } })).publicCurrent,
    ).toBe(true);
    expect(
      (await testPrisma.academicTerm.findUniqueOrThrow({ where: { id: b.id } })).publicCurrent,
    ).toBe(false);

    const r = await testPrisma.$transaction((tx) => setPublicTerm(tx, b.id));
    expect(r).toMatchObject({ changed: true, previousIds: [a.id] });
  });
});
