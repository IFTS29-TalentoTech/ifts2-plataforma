import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createTerm } from '../helpers/factories';
import { createDocumentRow, createScheduleRow } from '../helpers/academic-factories';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

beforeEach(resetDb);

describe('B08: publicar y quitar adjunto con lecturas anteriores al primer commit', () => {
  for (const publicCurrent of [false, true]) {
    for (const first of ['remove', 'publish'] as const) {
      it(`ciclo público=${publicCurrent}; confirma primero ${first}`, async () => {
        const term = await createTerm({ publicCurrent });
        const doc = await createDocumentRow();
        const schedule = await createScheduleRow({ termId: term.id, documentId: doc.id });
        const bothRead = gate();
        const firstCommitted = gate();
        let reads = 0;
        // Solo retenemos operaciones reales de Prisma: ambos handlers leen el mismo estado,
        // y el segundo UPDATE no llega a PostgreSQL hasta el commit completo del primero.
        const db = testPrisma.$extends({
          query: {
            schedule: {
              async findUnique({ args, query }) {
                const row = await query(args);
                if (args.where.id === schedule.id && ++reads <= 2) {
                  if (reads === 2) bothRead.release();
                  await bothRead.promise;
                }
                return row;
              },
              async update({ args, query }) {
                const operation = args.data.published === true ? 'publish' : 'remove';
                if (args.where.id === schedule.id && operation !== first) {
                  await firstCommitted.promise;
                }
                return query(args);
              },
            },
          },
        });
        const { app } = await createTestApp({ prisma: db as unknown as PrismaClient });
        const { cookie } = await loginAs(app, 'BEDELIA');
        const run = async (operation: 'remove' | 'publish') => {
          try {
            const base = `/api/v1/schedules/${schedule.id}`;
            return await (operation === 'remove'
              ? request(app)
                  .patch(base)
                  .set('Cookie', cookie)
                  .send({ documentId: null, notes: 'retirado' })
              : request(app).post(`${base}/publish`).set('Cookie', cookie));
          } finally {
            if (operation === first) firstCommitted.release();
          }
        };
        const [remove, publish] = await Promise.all([run('remove'), run('publish')]);
        expect(reads).toBe(2);
        expect(first === 'remove' ? remove.status : publish.status).toBe(200);
        expect(first === 'remove' ? publish.status : remove.status).toBe(409);
        const row = await testPrisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } });
        expect(row).toMatchObject(
          first === 'remove'
            ? { published: false, documentId: null, notes: 'retirado' }
            : { published: true, documentId: doc.id, notes: null },
        );
        const logs = await testPrisma.auditLog.findMany({ where: { entityId: schedule.id } });
        expect(logs.map((log) => log.action)).toEqual([
          first === 'remove' ? 'schedule.update' : 'schedule.publish',
        ]);
        const get = await request(app)
          .get(`/api/v1/schedules/${schedule.id}`)
          .set('Cookie', cookie);
        expect(get.body).toMatchObject({
          published: row.published,
          documentId: row.documentId,
          visibleNow: row.published && publicCurrent,
        });
      });
    }
  }
});

it('B08: una eliminación de documento que leyó ausencia de referencias no desadjunta un horario publicado', async () => {
  const term = await createTerm({ publicCurrent: true });
  const original = await createDocumentRow();
  const replacement = await createDocumentRow();
  const schedule = await createScheduleRow({
    termId: term.id,
    documentId: original.id,
    published: true,
  });
  const attachValidated = gate();
  const continueAttach = gate();
  const deleteValidated = gate();
  const attachCommitted = gate();
  const db = testPrisma.$extends({
    query: {
      document: {
        async findUnique({ args, query }) {
          const row = await query(args);
          // La comprobación de adjuntabilidad leyó ACTIVE antes del archivado concurrente.
          if (args.where.id === replacement.id && args.select?.status) {
            attachValidated.release();
            await continueAttach.promise;
          }
          return row;
        },
        async delete({ args, query }) {
          if (args.where.id === replacement.id) {
            // El handler ya comprobó que está archivado y todavía no tiene referencias.
            deleteValidated.release();
            await attachCommitted.promise;
          }
          return query(args);
        },
      },
    },
  });
  const { app } = await createTestApp({ prisma: db as unknown as PrismaClient });
  const { cookie } = await loginAs(app, 'ADMIN');
  const patch = request(app)
    .patch(`/api/v1/schedules/${schedule.id}`)
    .set('Cookie', cookie)
    .send({ documentId: replacement.id })
    .then((res) => {
      attachCommitted.release();
      return res;
    });
  await attachValidated.promise;
  expect(
    (
      await request(app)
        .post(`/api/v1/documents/${replacement.id}/archive`)
        .set('Cookie', cookie)
        .send({})
    ).status,
  ).toBe(200);
  const deletion = request(app)
    .delete(`/api/v1/documents/${replacement.id}`)
    .set('Cookie', cookie)
    .then((res) => res);
  await deleteValidated.promise;
  continueAttach.release();
  const [updated, removed] = await Promise.all([patch, deletion]);
  const final = await testPrisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } });
  expect({
    updateStatus: updated.status,
    deleteStatus: removed.status,
    published: final.published,
    documentId: final.documentId,
  }).toEqual({
    updateStatus: 200,
    deleteStatus: 409,
    published: true,
    documentId: replacement.id,
  });
  expect(await testPrisma.document.count({ where: { id: replacement.id } })).toBe(1);
  expect(
    await testPrisma.auditLog.count({
      where: { action: 'document.delete', entityId: replacement.id },
    }),
  ).toBe(0);
});
