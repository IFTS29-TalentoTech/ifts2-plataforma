import { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAs } from '../helpers/auth';
import { createTestApp, type TestApp } from '../helpers/app';
import { resetDb, testPrisma } from '../helpers/db';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  EDITOR_ID = (await testPrisma.role.findUniqueOrThrow({ where: { key: 'EDITOR' } })).id;
});
afterEach(() => vi.restoreAllMocks());

// RF11: la regla de "último" se aplica ahora al rol SUPERADMIN (los ADMIN pueden desactivarse entre sí).
const activeAdmins = () =>
  testPrisma.user.count({ where: { role: { key: 'SUPERADMIN' }, active: true } });
let EDITOR_ID: string;
const mutationLogs = () =>
  testPrisma.auditLog.findMany({ where: { action: { startsWith: 'user.' } } });
const serializationConflict = () =>
  new Prisma.PrismaClientKnownRequestError('serialization failure', {
    code: 'P2034',
    clientVersion: Prisma.prismaVersion.client,
  });

function interceptTransactions(
  run: (tx: Prisma.TransactionClient, operation: () => Promise<unknown>) => Promise<unknown>,
) {
  const transaction = testPrisma.$transaction.bind(testPrisma);
  return vi
    .spyOn(testPrisma, '$transaction')
    .mockImplementation((operation, options) =>
      transaction((tx) => run(tx, () => operation(tx)), options),
    );
}

function synchronizeAdminChecks() {
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => (release = resolve));
  const conflicts: unknown[] = [];
  const original = testPrisma.$transaction.bind(testPrisma);
  const transaction = vi
    .spyOn(testPrisma, '$transaction')
    .mockImplementation(async (operation, options) => {
      try {
        return await original(async (tx) => {
          const count = tx.user.count.bind(tx.user);
          vi.spyOn(tx.user, 'count').mockImplementation((args) => {
            const result = (async () => {
              const value = await count(args);
              // Ambas transacciones leen PostgreSQL antes de permitir cualquiera de las escrituras.
              if (arrivals < 2) {
                if (++arrivals === 2) release();
                await barrier;
              }
              return value;
            })();
            return Object.defineProperty(result, Symbol.toStringTag, {
              value: 'PrismaPromise',
            }) as Prisma.PrismaPromise<number>;
          });
          return operation(tx);
        }, options);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          conflicts.push(error);
        }
        throw error;
      }
    });
  return { transaction, conflicts, arrivals: () => arrivals };
}

describe('protección del último administrador', () => {
  it('desactiva otro administrador, revoca sus sesiones y audita una vez', async () => {
    const admin = await loginAs(t.app, 'SUPERADMIN');
    const target = await loginAs(t.app, 'SUPERADMIN');
    await request(t.app)
      .post(`/api/v1/users/${target.user.id}/deactivate`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(await activeAdmins()).toBe(1);
    expect(await testPrisma.session.count({ where: { userId: target.user.id } })).toBe(0);
    expect(await mutationLogs()).toMatchObject([
      { action: 'user.deactivate', userId: admin.user.id, entityId: target.user.id },
    ]);
  });

  it('rechaza desactivar al último administrador y conserva usuario, sesiones y auditoría', async () => {
    const admin = await loginAs(t.app, 'SUPERADMIN');
    const target = await loginAs(t.app, 'SUPERADMIN');
    const current = await testPrisma.user.findUnique({ where: { id: target.user.id } });
    // Conserva una solicitud ya autenticada mientras cambia el estado del actor en PostgreSQL.
    interceptTransactions(async (_tx, run) => {
      await testPrisma.user.update({ where: { id: admin.user.id }, data: { roleId: EDITOR_ID } });
      return run();
    });
    const sessions = await testPrisma.session.findMany();
    const logs = await testPrisma.auditLog.findMany();
    const res = await request(t.app)
      .post(`/api/v1/users/${target.user.id}/deactivate`)
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/Superadministrador/);
    expect(await activeAdmins()).toBe(1);
    expect(await testPrisma.user.findUnique({ where: { id: target.user.id } })).toEqual(current);
    expect(await testPrisma.session.findMany()).toEqual(sessions);
    expect(await testPrisma.auditLog.findMany()).toEqual(logs);
  });

  it('rechaza degradar al último administrador sin guardar otros campos ni revocar sesiones', async () => {
    const admin = await loginAs(t.app, 'SUPERADMIN');
    const sessions = await testPrisma.session.findMany();
    const logs = await testPrisma.auditLog.findMany();
    const current = await testPrisma.user.findUnique({ where: { id: admin.user.id } });
    const res = await request(t.app)
      .patch(`/api/v1/users/${admin.user.id}`)
      .set('Cookie', admin.cookie)
      .send({ roleId: EDITOR_ID, name: 'No debe guardarse', email: 'cambio@prueba.local' });
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/Superadministrador/);
    expect(await activeAdmins()).toBe(1);
    expect(await testPrisma.user.findUnique({ where: { id: admin.user.id } })).toEqual(current);
    expect(await testPrisma.session.findMany()).toEqual(sessions);
    expect(await testPrisma.auditLog.findMany()).toEqual(logs);
  });

  it('PATCH no admite active ni evita la prohibición de desactivarse', async () => {
    const admin = await loginAs(t.app, 'SUPERADMIN');
    const call = (body: object) =>
      request(t.app).patch(`/api/v1/users/${admin.user.id}`).set('Cookie', admin.cookie).send(body);
    expect((await call({ active: false })).status).toBe(400);
    const res = await call({ active: false, name: 'Nombre permitido' });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect((await call({ active: false, roleId: EDITOR_ID })).status).toBe(409);
    await request(t.app)
      .post(`/api/v1/users/${admin.user.id}/deactivate`)
      .set('Cookie', admin.cookie)
      .expect(422); // desactivarse a uno mismo sigue siendo 422
    expect(await activeAdmins()).toBe(1);
    expect(await testPrisma.session.count({ where: { userId: admin.user.id } })).toBe(1);
    expect(await mutationLogs()).toHaveLength(1);
  });

  for (const operations of [
    ['deactivate', 'deactivate'],
    ['demote', 'demote'],
    ['deactivate', 'demote'],
  ] as const) {
    it(`serializa ${operations.join(' + ')} concurrentes sobre PostgreSQL`, async () => {
      const a = await loginAs(t.app, 'SUPERADMIN');
      const b = await loginAs(t.app, 'SUPERADMIN');
      const before = await testPrisma.user.findMany();
      const race = synchronizeAdminChecks();
      const call = (actor: typeof a, target: typeof a, operation: string) =>
        operation === 'deactivate'
          ? request(t.app)
              .post(`/api/v1/users/${target.user.id}/deactivate`)
              .set('Cookie', actor.cookie)
          : request(t.app)
              .patch(`/api/v1/users/${target.user.id}`)
              .set('Cookie', actor.cookie)
              .send({ roleId: EDITOR_ID });
      const responses = await Promise.all([call(a, b, operations[0]), call(b, a, operations[1])]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(responses.find((r) => r.status === 409)?.body.detail).toMatch(/Superadministrador/);
      expect(race.arrivals()).toBe(2);
      expect(race.conflicts).toEqual([expect.objectContaining({ code: 'P2034' })]);
      expect(race.transaction).toHaveBeenCalledTimes(3);
      expect(await activeAdmins()).toBe(1);
      const winner = responses.find((r) => r.status === 200)!.body;
      const survivor = before.find((u) => u.id !== winner.id)!;
      expect(await testPrisma.user.findUnique({ where: { id: survivor.id } })).toEqual(survivor);
      expect(await testPrisma.session.count({ where: { userId: survivor.id } })).toBe(1);
      expect(await testPrisma.session.count({ where: { userId: winner.id } })).toBe(0);
      expect(await mutationLogs()).toMatchObject([{ entityId: winner.id }]);
    });
  }

  for (const operation of ['deactivate', 'demote'] as const) {
    for (const exhaust of [false, true]) {
      it(`${operation}: revierte efectos de P2034 y ${exhaust ? 'agota reintentos' : 'confirma una vez al reintentar'}`, async () => {
        const admin = await loginAs(t.app, 'SUPERADMIN');
        const target = await loginAs(t.app, 'SUPERADMIN');
        const current = await testPrisma.user.findUnique({ where: { id: target.user.id } });
        const sessions = await testPrisma.session.findMany();
        const logs = await testPrisma.auditLog.findMany();
        let attempts = 0;
        const transaction = interceptTransactions(async (_tx, run) => {
          const result = await run();
          if (++attempts === 1 || exhaust) throw serializationConflict();
          return result;
        });
        const res =
          operation === 'deactivate'
            ? await request(t.app)
                .post(`/api/v1/users/${target.user.id}/deactivate`)
                .set('Cookie', admin.cookie)
            : await request(t.app)
                .patch(`/api/v1/users/${target.user.id}`)
                .set('Cookie', admin.cookie)
                .send({ roleId: EDITOR_ID });
        expect(res.status).toBe(exhaust ? 409 : 200);
        expect(transaction).toHaveBeenCalledTimes(exhaust ? 3 : 2);
        expect(await activeAdmins()).toBe(exhaust ? 2 : 1);
        if (exhaust) {
          expect(res.headers['content-type']).toContain('application/problem+json');
          expect(res.body).toMatchObject({
            code: 'conflict',
            detail: expect.stringContaining('Intentá de nuevo'),
          });
          expect(await testPrisma.user.findUnique({ where: { id: target.user.id } })).toEqual(
            current,
          );
          expect(await testPrisma.session.findMany()).toEqual(sessions);
          expect(await testPrisma.auditLog.findMany()).toEqual(logs);
        } else {
          expect(await testPrisma.session.count({ where: { userId: target.user.id } })).toBe(0);
          expect(await mutationLogs()).toHaveLength(1);
        }
      });
    }
  }
});
