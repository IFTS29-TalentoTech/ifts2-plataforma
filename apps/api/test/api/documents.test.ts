import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs, type LoggedIn } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createNotice, createTerm } from '../helpers/factories';
import {
  ago,
  createDocumentRow,
  createExamCallRow,
  createScheduleRow,
  DAY,
  PDF_BYTES,
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
  upload: (fields: Record<string, string>, file?: { buf: Buffer; name: string }) => {
    let r = request(t.app).post('/api/v1/documents').set('Cookie', c);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    if (file) r = r.attach('file', file.buf, file.name);
    return r;
  },
});

describe('permisos', () => {
  it('401 sin sesión, 403 EDITOR, BEDELIA y ADMIN pueden', async () => {
    const d = await createDocumentRow();
    expect((await request(t.app).get('/api/v1/documents')).status).toBe(401);
    expect((await request(t.app).post('/api/v1/documents')).status).toBe(401);
    const editor = await loginAs(t.app, 'EDITOR');
    for (const call of [
      as(editor.cookie).get('/api/v1/documents'),
      as(editor.cookie).get(`/api/v1/documents/${d.id}`),
      as(editor.cookie).get(`/api/v1/documents/${d.id}/file`),
      as(editor.cookie).post(`/api/v1/documents/${d.id}/archive`),
      as(editor.cookie).post(`/api/v1/documents/${d.id}/restore`),
      as(editor.cookie).patch(`/api/v1/documents/${d.id}`, { title: 'x' }),
      as(editor.cookie).del(`/api/v1/documents/${d.id}`),
      as(editor.cookie).upload({ title: 'x' }, { buf: PDF_BYTES, name: 'a.pdf' }),
    ]) {
      expect((await call).status).toBe(403);
    }
    const admin = await loginAs(t.app, 'ADMIN');
    expect((await as(admin.cookie).get('/api/v1/documents')).status).toBe(200);
  });
});

describe('POST /documents (multipart)', () => {
  it('sube un PDF, guarda metadatos, no expone la clave y audita', async () => {
    const res = await as(bedelia.cookie).upload(
      {
        title: 'Horarios 2.º cuatrimestre',
        kind: 'SCHEDULE',
        category: 'Cursada',
        cycleYear: '2026',
        termLabel: '2.° Cuat.',
        resolutionCode: 'RES-123/2026',
      },
      { buf: PDF_BYTES, name: 'Horarios 2026.pdf' },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Horarios 2.º cuatrimestre',
      kind: 'SCHEDULE',
      category: 'Cursada',
      cycleYear: 2026,
      termLabel: '2.° Cuat.',
      resolutionCode: 'RES-123/2026',
      mimeType: 'application/pdf',
      sizeBytes: PDF_BYTES.length,
      status: 'ACTIVE',
      archivedAt: null,
      restoredAt: null,
      uploadedBy: bedelia.user.id,
      usage: { notices: 0, schedules: 0, examCalls: 0 },
    });
    expect(res.body.filename).toBe('Horarios 2026.pdf');
    expect(res.body.storageKey).toBeUndefined(); // nunca sale
    const row = await testPrisma.document.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(await t.storage.exists(row.storageKey)).toBe(true);
    expect(await testPrisma.auditLog.count({ where: { action: 'document.create' } })).toBe(1);
  });

  it('una imagen se guarda como WebP', async () => {
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#888' } })
      .png()
      .toBuffer();
    const res = await as(bedelia.cookie).upload({ title: 'Foto' }, { buf: png, name: 'foto.png' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      mimeType: 'image/webp',
      filename: 'foto.webp',
      kind: 'OTHER',
    });
  });

  it('valida: archivo obligatorio, título obligatorio, año inválido', async () => {
    let res = await as(bedelia.cookie).upload({ title: 'Sin archivo' });
    expect(res.status).toBe(400);
    expect(res.body.errors.file).toBeDefined();

    res = await as(bedelia.cookie).upload({ title: ' ' }, { buf: PDF_BYTES, name: 'a.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.errors.title[0]).toBe('El título del documento es obligatorio.');

    res = await as(bedelia.cookie).upload(
      { title: 'x', cycleYear: 'abc' },
      { buf: PDF_BYTES, name: 'a.pdf' },
    );
    expect(res.status).toBe(400);
    expect(res.body.errors.cycleYear).toBeDefined();
    expect(await testPrisma.document.count()).toBe(0);
  });

  it('415 con un tipo no permitido (aunque se llame .pdf) y 413 con un PDF de más de 10 MB', async () => {
    const fake = await as(bedelia.cookie).upload(
      { title: 'Script' },
      { buf: Buffer.from('#!/bin/sh\necho hola\n'), name: 'inocente.pdf' },
    );
    expect(fake.status).toBe(415);
    expect(fake.body.code).toBe('unsupported-media-type');

    const big = Buffer.concat([PDF_BYTES, Buffer.alloc(10 * 1024 * 1024 + 100)]);
    const tooBig = await as(bedelia.cookie).upload(
      { title: 'Grande' },
      { buf: big, name: 'big.pdf' },
    );
    expect(tooBig.status).toBe(413);

    const huge = Buffer.concat([PDF_BYTES, Buffer.alloc(11 * 1024 * 1024)]);
    expect(
      (await as(bedelia.cookie).upload({ title: 'Enorme' }, { buf: huge, name: 'h.pdf' })).status,
    ).toBe(413);
    expect(await testPrisma.document.count()).toBe(0);
  });

  it('si el almacenamiento falla responde 502, no deja filas a medias y el resto de la API sigue', async () => {
    const original = t.storage.put.bind(t.storage);
    t.storage.put = async () => {
      throw new Error('almacenamiento caído');
    };
    const res = await as(bedelia.cookie).upload({ title: 'x' }, { buf: PDF_BYTES, name: 'a.pdf' });
    expect(res.status).toBe(502);
    expect(await testPrisma.document.count()).toBe(0);
    t.storage.put = original;
    expect((await as(bedelia.cookie).get('/api/v1/documents')).status).toBe(200);
  });
});

describe('GET /documents', () => {
  it('busca por título, código de resolución y año; filtra por tipo y estado; pagina', async () => {
    await createDocumentRow({
      title: 'Plan de estudios',
      kind: 'PLAN',
      cycleYear: 2024,
      resolutionCode: 'RES-1202/07',
    });
    await createDocumentRow({
      title: 'Mesas de diciembre',
      kind: 'EXAM_CALENDAR',
      cycleYear: 2025,
    });
    await createDocumentRow({
      title: 'Horarios',
      kind: 'SCHEDULE',
      cycleYear: 2026,
      status: 'ARCHIVED',
    });
    const titles = async (qs: string) =>
      (await as(bedelia.cookie).get(`/api/v1/documents?${qs}`)).body.items.map(
        (d: { title: string }) => d.title,
      );

    expect(await titles('q=plan')).toEqual(['Plan de estudios']);
    expect(await titles('q=1202')).toEqual(['Plan de estudios']);
    expect(await titles('q=2025')).toEqual(['Mesas de diciembre']);
    expect(await titles('cycleYear=2026')).toEqual(['Horarios']);
    expect(await titles('kind=SCHEDULE')).toEqual(['Horarios']);
    expect(await titles('status=ARCHIVED')).toEqual(['Horarios']);
    expect((await titles('status=ACTIVE')).length).toBe(2);
    const page = await as(bedelia.cookie).get('/api/v1/documents?pageSize=2&page=2');
    expect(page.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page.body.items).toHaveLength(1);
    expect((await as(bedelia.cookie).get('/api/v1/documents?kind=XX')).status).toBe(400);
    expect((await as(bedelia.cookie).get('/api/v1/documents?status=ALL')).status).toBe(400);
  });
});

describe('detalle y descarga', () => {
  it('GET /:id trae las referencias y marca cuáles están visibles; 404 si no existe', async () => {
    const doc = await createDocumentRow();
    const term = await createTerm({ publicCurrent: true });
    const visibleNotice = await createNotice({ title: 'Aviso vigente' });
    await testPrisma.notice.update({
      where: { id: visibleNotice.id },
      data: { attachmentId: doc.id },
    });
    const expired = await createNotice({ title: 'Aviso viejo', visibleUntil: ago(DAY) });
    await testPrisma.notice.update({ where: { id: expired.id }, data: { attachmentId: doc.id } });
    await createScheduleRow({
      termId: term.id,
      commissionName: 'Comisión A',
      documentId: doc.id,
      published: true,
    });
    await createExamCallRow({ termId: term.id, name: 'Llamado borrador', documentId: doc.id });

    const res = await as(bedelia.cookie).get(`/api/v1/documents/${doc.id}`);
    expect(res.status).toBe(200);
    expect(res.body.usage).toEqual({ notices: 2, schedules: 1, examCalls: 1 });
    expect(res.body.visibleReferences).toBe(2);
    const byLabel = Object.fromEntries(
      res.body.references.map((r: { label: string; visible: boolean }) => [r.label, r.visible]),
    );
    expect(byLabel).toEqual({
      'Aviso vigente': true,
      'Aviso viejo': false,
      'Comisión A': true,
      'Llamado borrador': false,
    });
    expect(
      (await as(bedelia.cookie).get('/api/v1/documents/11111111-1111-4111-8111-111111111111'))
        .status,
    ).toBe(404);
  });

  it('GET /:id/file devuelve una URL firmada', async () => {
    const created = await as(bedelia.cookie).upload(
      { title: 'x' },
      { buf: PDF_BYTES, name: 'a.pdf' },
    );
    const res = await as(bedelia.cookie).get(`/api/v1/documents/${created.body.id}/file`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ filename: 'a.pdf', mimeType: 'application/pdf' });
    expect(res.body.url).toMatch(/^memory:\/\/|^https?:\/\//);
  });
});

describe('PATCH /documents/:id', () => {
  it('edita metadatos, valida y audita', async () => {
    const d = await createDocumentRow({ title: 'Viejo' });
    const ok = await as(bedelia.cookie).patch(`/api/v1/documents/${d.id}`, {
      title: 'Nuevo',
      resolutionCode: 'R-9',
      cycleYear: 2025,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ title: 'Nuevo', resolutionCode: 'R-9', cycleYear: 2025 });
    expect(await testPrisma.auditLog.count({ where: { action: 'document.update' } })).toBe(1);
    expect(
      (await as(bedelia.cookie).patch(`/api/v1/documents/${d.id}`, { title: '' })).status,
    ).toBe(400);
    expect((await as(bedelia.cookie).patch(`/api/v1/documents/${d.id}`, {})).status).toBe(400);
  });
});

describe('archivar y restaurar', () => {
  it('archiva (archivedAt), no se puede archivar dos veces, restaura (restoredAt) y audita', async () => {
    const d = await createDocumentRow();
    const arch = await as(bedelia.cookie).post(`/api/v1/documents/${d.id}/archive`);
    expect(arch.status).toBe(200);
    expect(arch.body.status).toBe('ARCHIVED');
    expect(arch.body.archivedAt).toBeTruthy();
    expect((await as(bedelia.cookie).post(`/api/v1/documents/${d.id}/archive`)).status).toBe(409);

    const rest = await as(bedelia.cookie).post(`/api/v1/documents/${d.id}/restore`);
    expect(rest.body).toMatchObject({ status: 'ACTIVE' });
    expect(rest.body.restoredAt).toBeTruthy();
    expect((await as(bedelia.cookie).post(`/api/v1/documents/${d.id}/restore`)).status).toBe(409);
    expect(await testPrisma.auditLog.count({ where: { action: 'document.archive' } })).toBe(1);
    expect(await testPrisma.auditLog.count({ where: { action: 'document.restore' } })).toBe(1);
  });

  it('adjunto a algo visible: 409 con requiresConfirmation; con force:true archiva y deja el adjunto', async () => {
    const d = await createDocumentRow();
    const n = await createNotice();
    await testPrisma.notice.update({ where: { id: n.id }, data: { attachmentId: d.id } });

    const refuse = await as(bedelia.cookie).post(`/api/v1/documents/${d.id}/archive`);
    expect(refuse.status).toBe(409);
    expect(refuse.body.requiresConfirmation).toBe(true);
    expect(refuse.body.references).toEqual([
      { type: 'notice', id: n.id, label: n.title, visible: true },
    ]);
    expect((await testPrisma.document.findUniqueOrThrow({ where: { id: d.id } })).status).toBe(
      'ACTIVE',
    );

    const forced = await as(bedelia.cookie).post(`/api/v1/documents/${d.id}/archive`, {
      force: true,
    });
    expect(forced.status).toBe(200);
    expect(forced.body.status).toBe('ARCHIVED');
    expect((await testPrisma.notice.findUniqueOrThrow({ where: { id: n.id } })).attachmentId).toBe(
      d.id,
    );
    const log = await testPrisma.auditLog.findFirstOrThrow({
      where: { action: 'document.archive' },
    });
    expect(log.detail).toEqual({ forced: true, visibleReferences: 1 });
  });

  it('adjunto solo a algo NO visible (aviso vencido, llamado sin publicar): archiva sin confirmación', async () => {
    const d = await createDocumentRow();
    const term = await createTerm({ publicCurrent: true });
    const n = await createNotice({ visibleUntil: ago(DAY) });
    await testPrisma.notice.update({ where: { id: n.id }, data: { attachmentId: d.id } });
    await createExamCallRow({ termId: term.id, documentId: d.id, published: false });
    expect((await as(bedelia.cookie).post(`/api/v1/documents/${d.id}/archive`)).status).toBe(200);
  });

  it('force inválido da 400', async () => {
    const d = await createDocumentRow();
    expect(
      (await as(bedelia.cookie).post(`/api/v1/documents/${d.id}/archive`, { force: 'si' })).status,
    ).toBe(400);
  });
});

describe('DELETE /documents/:id', () => {
  it('409 si no está archivado', async () => {
    const d = await createDocumentRow();
    const res = await as(bedelia.cookie).del(`/api/v1/documents/${d.id}`);
    expect(res.status).toBe(409);
    expect(await testPrisma.document.count()).toBe(1);
  });

  it('409 si algún aviso, horario o llamado lo referencia (con la lista de referencias)', async () => {
    const term = await createTerm();
    for (const attach of ['notice', 'schedule', 'examCall'] as const) {
      const d = await createDocumentRow({ status: 'ARCHIVED' });
      if (attach === 'notice') {
        const n = await createNotice({ visibleUntil: ago(DAY) });
        await testPrisma.notice.update({ where: { id: n.id }, data: { attachmentId: d.id } });
      } else if (attach === 'schedule') {
        await createScheduleRow({ termId: term.id, documentId: d.id });
      } else {
        await createExamCallRow({ termId: term.id, documentId: d.id });
      }
      const res = await as(bedelia.cookie).del(`/api/v1/documents/${d.id}`);
      expect(res.status).toBe(409);
      expect(res.body.references).toHaveLength(1);
      expect(await testPrisma.document.count({ where: { id: d.id } })).toBe(1);
    }
  });

  it('204 si está archivado y libre: borra la fila y el archivo, y audita', async () => {
    const created = await as(bedelia.cookie).upload(
      { title: 'Para borrar' },
      { buf: PDF_BYTES, name: 'a.pdf' },
    );
    const row = await testPrisma.document.findUniqueOrThrow({ where: { id: created.body.id } });
    await as(bedelia.cookie).post(`/api/v1/documents/${row.id}/archive`);
    const res = await as(bedelia.cookie).del(`/api/v1/documents/${row.id}`);
    expect(res.status).toBe(204);
    expect(await testPrisma.document.count()).toBe(0);
    expect(await t.storage.exists(row.storageKey)).toBe(false);
    expect(await testPrisma.auditLog.count({ where: { action: 'document.delete' } })).toBe(1);
    expect((await as(bedelia.cookie).del(`/api/v1/documents/${row.id}`)).status).toBe(404);
  });
});
