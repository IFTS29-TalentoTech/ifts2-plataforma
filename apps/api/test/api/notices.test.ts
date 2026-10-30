import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs, type LoggedIn } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createCategory, createNotice } from '../helpers/factories';
import { ago, createDocumentRow, DAY, fromNow } from '../helpers/academic-factories';

let t: TestApp;
let bedelia: LoggedIn;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  bedelia = await loginAs(t.app, 'BEDELIA');
});

const get = (url: string, c = bedelia.cookie) => request(t.app).get(url).set('Cookie', c);
const post = (url: string, body: object = {}, c = bedelia.cookie) =>
  request(t.app).post(url).set('Cookie', c).send(body);

describe('permisos', () => {
  it('401 sin sesión y 403 para EDITOR en todas las rutas', async () => {
    const n = await createNotice();
    expect((await request(t.app).get('/api/v1/notices')).status).toBe(401);
    const editor = await loginAs(t.app, 'EDITOR');
    expect((await get('/api/v1/notices', editor.cookie)).status).toBe(403);
    expect((await get(`/api/v1/notices/${n.id}`, editor.cookie)).status).toBe(403);
    expect((await post('/api/v1/notices', { title: 'x', body: 'y' }, editor.cookie)).status).toBe(
      403,
    );
    expect((await post(`/api/v1/notices/${n.id}/pause`, {}, editor.cookie)).status).toBe(403);
    expect(
      (await request(t.app).delete(`/api/v1/notices/${n.id}`).set('Cookie', editor.cookie)).status,
    ).toBe(403);
  });

  it('ADMIN también puede gestionar avisos', async () => {
    const admin = await loginAs(t.app, 'ADMIN');
    const res = await post('/api/v1/notices', { title: 'Aviso', body: 'Texto' }, admin.cookie);
    expect(res.status).toBe(201);
  });
});

describe('POST /notices', () => {
  it('crea un aviso vigente, con la forma documentada, y audita', async () => {
    const cat = await createCategory({ kind: 'NOTICE', name: 'Inscripciones' });
    const doc = await createDocumentRow();
    const until = fromNow(10 * DAY).toISOString();
    const res = await post('/api/v1/notices', {
      title: '  Inscripción al turno extraordinario  ',
      body: 'Del 1 al 10 de diciembre.',
      categoryId: cat.id,
      audience: 'STUDENTS',
      urgent: true,
      highlighted: true,
      visibleUntil: until,
      attachmentId: doc.id,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Inscripción al turno extraordinario',
      status: 'ACTIVE',
      viewStatus: 'ACTIVE',
      visibleNow: true,
      audience: 'STUDENTS',
      urgent: true,
      highlighted: true,
      category: { id: cat.id, name: 'Inscripciones' },
      attachment: { id: doc.id, filename: doc.filename },
      authorId: bedelia.user.id,
    });
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'attachment',
        'attachmentId',
        'audience',
        'authorId',
        'body',
        'category',
        'categoryId',
        'createdAt',
        'highlighted',
        'id',
        'status',
        'title',
        'updatedAt',
        'urgent',
        'viewStatus',
        'visibleFrom',
        'visibleNow',
        'visibleUntil',
      ].sort(),
    );
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'notice.create' } });
    expect(log).toMatchObject({ entityId: res.body.id, userId: bedelia.user.id });
  });

  it('valida: título y texto obligatorios, fin posterior al inicio y fin no pasado', async () => {
    let res = await post('/api/v1/notices', { title: '  ', body: '' });
    expect(res.status).toBe(400);
    expect(res.body.errors.title[0]).toBe('El título es obligatorio.');
    expect(res.body.errors.body[0]).toBe('El texto del aviso es obligatorio.');

    res = await post('/api/v1/notices', {
      title: 'A',
      body: 'B',
      visibleFrom: '2030-02-10',
      visibleUntil: '2030-02-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.visibleUntil[0]).toMatch(/posterior/);

    res = await post('/api/v1/notices', {
      title: 'A',
      body: 'B',
      visibleUntil: ago(DAY).toISOString(),
    });
    expect(res.status).toBe(422);
    expect(res.body.errors.visibleUntil).toBeDefined();
  });

  it('422 si la categoría no es de avisos o el adjunto no existe / está archivado', async () => {
    const wrongCat = await createCategory({ kind: 'PUBLICATION' });
    let res = await post('/api/v1/notices', { title: 'A', body: 'B', categoryId: wrongCat.id });
    expect(res.status).toBe(422);
    expect(res.body.errors.categoryId).toBeDefined();

    res = await post('/api/v1/notices', {
      title: 'A',
      body: 'B',
      attachmentId: '11111111-1111-4111-8111-111111111111',
    });
    expect(res.status).toBe(422);
    expect(res.body.errors.attachmentId).toBeDefined();

    const archived = await createDocumentRow({ status: 'ARCHIVED' });
    res = await post('/api/v1/notices', { title: 'A', body: 'B', attachmentId: archived.id });
    expect(res.status).toBe(422);
    expect(res.body.errors.attachmentId[0]).toMatch(/archivado/);
  });
});

describe('GET /notices (filtros calculados)', () => {
  it('ACTIVE / PAUSED / EXPIRED / ALL se calculan al consultar y EXPIRED no se guarda', async () => {
    const active = await createNotice({ title: 'Vigente' });
    const future = await createNotice({ title: 'Futuro', visibleFrom: fromNow(2 * DAY) });
    const expired = await createNotice({ title: 'Vencido', visibleUntil: ago(DAY) });
    const paused = await createNotice({ title: 'Pausado', status: 'PAUSED' });
    const urgent = await createNotice({ title: 'Urgente', urgent: true });

    const ids = async (qs: string) =>
      (await get(`/api/v1/notices?${qs}`)).body.items.map((n: { title: string }) => n.title);

    expect(await ids('status=ACTIVE')).toEqual(
      expect.arrayContaining(['Vigente', 'Futuro', 'Urgente']),
    );
    expect(await ids('status=ACTIVE')).not.toContain('Vencido');
    expect(await ids('status=EXPIRED')).toEqual(['Vencido']);
    expect(await ids('status=PAUSED')).toEqual(['Pausado']);
    expect((await ids('status=ALL')).length).toBe(5);
    expect((await ids('')).length).toBe(5); // ALL por defecto
    // Urgentes primero
    expect((await ids('status=ALL'))[0]).toBe('Urgente');

    // El estado guardado del vencido sigue siendo ACTIVE: solo se calcula.
    const row = await testPrisma.notice.findUniqueOrThrow({ where: { id: expired.id } });
    expect(row.status).toBe('ACTIVE');
    const res = await get(`/api/v1/notices/${expired.id}`);
    expect(res.body).toMatchObject({ status: 'ACTIVE', viewStatus: 'EXPIRED', visibleNow: false });
    expect((await get(`/api/v1/notices/${future.id}`)).body).toMatchObject({
      viewStatus: 'ACTIVE',
      visibleNow: false,
    });
    expect((await get(`/api/v1/notices/${paused.id}`)).body.viewStatus).toBe('PAUSED');
    expect((await get(`/api/v1/notices/${active.id}`)).body.visibleNow).toBe(true);
    expect(urgent.urgent).toBe(true);
  });

  it('filtra por destinatario, pagina y valida los parámetros', async () => {
    await testPrisma.notice.create({
      data: { title: 'Aspirantes', body: 'x', audience: 'ASPIRANTS', authorId: bedelia.user.id },
    });
    await createNotice();
    await createNotice();
    const res = await get('/api/v1/notices?audience=ASPIRANTS');
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    const page = await get('/api/v1/notices?pageSize=2&page=2');
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBe(3);
    expect((await get('/api/v1/notices?status=FOO')).status).toBe(400);
    expect((await get('/api/v1/notices?audience=NADIE')).status).toBe(400);
  });
});

describe('PATCH /notices/:id', () => {
  it('edita campos, valida contra la vigencia guardada y audita', async () => {
    const n = await createNotice({ title: 'Original' });
    const res = await request(t.app)
      .patch(`/api/v1/notices/${n.id}`)
      .set('Cookie', bedelia.cookie)
      .send({ title: 'Editado', urgent: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Editado', urgent: true });
    expect(await testPrisma.auditLog.count({ where: { action: 'notice.update' } })).toBe(1);

    const bad = await request(t.app)
      .patch(`/api/v1/notices/${n.id}`)
      .set('Cookie', bedelia.cookie)
      .send({ visibleUntil: ago(10 * DAY).toISOString() }); // antes del visibleFrom guardado
    expect(bad.status).toBe(422);
    expect(bad.body.errors.visibleUntil).toBeDefined();

    const empty = await request(t.app)
      .patch(`/api/v1/notices/${n.id}`)
      .set('Cookie', bedelia.cookie)
      .send({});
    expect(empty.status).toBe(400);
    expect(
      (
        await request(t.app)
          .patch('/api/v1/notices/11111111-1111-4111-8111-111111111111')
          .set('Cookie', bedelia.cookie)
          .send({ title: 'x' })
      ).status,
    ).toBe(404);
  });

  it('puede quitar el adjunto y la categoría con null', async () => {
    const doc = await createDocumentRow();
    const created = await post('/api/v1/notices', { title: 'A', body: 'B', attachmentId: doc.id });
    const res = await request(t.app)
      .patch(`/api/v1/notices/${created.body.id}`)
      .set('Cookie', bedelia.cookie)
      .send({ attachmentId: null, categoryId: null });
    expect(res.body).toMatchObject({ attachmentId: null, attachment: null, categoryId: null });
  });
});

describe('pausar y reanudar', () => {
  it('pause -> PAUSED (409 si ya lo estaba) y resume -> ACTIVE, con auditoría', async () => {
    const n = await createNotice();
    const paused = await post(`/api/v1/notices/${n.id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body).toMatchObject({
      status: 'PAUSED',
      viewStatus: 'PAUSED',
      visibleNow: false,
    });
    expect((await post(`/api/v1/notices/${n.id}/pause`)).status).toBe(409);

    const resumed = await post(`/api/v1/notices/${n.id}/resume`);
    expect(resumed.status).toBe(200);
    expect(resumed.body).toMatchObject({
      status: 'ACTIVE',
      viewStatus: 'ACTIVE',
      visibleNow: true,
    });
    expect((await post(`/api/v1/notices/${n.id}/resume`)).status).toBe(409); // ya vigente
    expect(await testPrisma.auditLog.count({ where: { action: 'notice.pause' } })).toBe(1);
    expect(await testPrisma.auditLog.count({ where: { action: 'notice.resume' } })).toBe(1);
  });

  it('reactivar un vencido exige nueva fecha de fin futura (RF03)', async () => {
    const n = await createNotice({ visibleUntil: ago(DAY) });
    let res = await post(`/api/v1/notices/${n.id}/resume`);
    expect(res.status).toBe(422);
    expect(res.body.errors.visibleUntil).toBeDefined();

    res = await post(`/api/v1/notices/${n.id}/resume`, { visibleUntil: ago(DAY).toISOString() });
    expect(res.status).toBe(422);

    res = await post(`/api/v1/notices/${n.id}/resume`, {
      visibleUntil: fromNow(5 * DAY).toISOString(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ viewStatus: 'ACTIVE', visibleNow: true });
    expect(await testPrisma.auditLog.count({ where: { action: 'notice.reactivate' } })).toBe(1);
  });

  it('un pausado cuya vigencia ya terminó tampoco se reanuda sin nueva fecha', async () => {
    const n = await createNotice({ status: 'PAUSED', visibleUntil: ago(DAY) });
    expect((await post(`/api/v1/notices/${n.id}/resume`)).status).toBe(422);
    expect(
      (await post(`/api/v1/notices/${n.id}/resume`, { visibleUntil: fromNow(DAY).toISOString() }))
        .status,
    ).toBe(200);
  });
});

describe('DELETE /notices/:id (solo manual y no vigente)', () => {
  const del = (id: string, c = bedelia.cookie) =>
    request(t.app).delete(`/api/v1/notices/${id}`).set('Cookie', c);

  it('409 si está vigente (y sigue existiendo)', async () => {
    const n = await createNotice();
    const res = await del(n.id);
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/vigente/);
    expect(await testPrisma.notice.count({ where: { id: n.id } })).toBe(1);
  });

  it('409 también si empieza en el futuro (está ACTIVE, no vencido ni pausado)', async () => {
    const n = await createNotice({ visibleFrom: fromNow(DAY) });
    expect((await del(n.id)).status).toBe(409);
  });

  it('204 si está vencido o pausado y queda auditado con quién', async () => {
    const expired = await createNotice({ visibleUntil: ago(DAY), title: 'Viejo' });
    const paused = await createNotice({ status: 'PAUSED' });
    expect((await del(expired.id)).status).toBe(204);
    expect((await del(paused.id)).status).toBe(204);
    expect(await testPrisma.notice.count()).toBe(0);
    const logs = await testPrisma.auditLog.findMany({ where: { action: 'notice.delete' } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.userId === bedelia.user.id)).toBe(true);
  });

  it('404 si no existe', async () => {
    expect((await del('11111111-1111-4111-8111-111111111111')).status).toBe(404);
  });

  it('el borde: venció hace un instante => se puede eliminar', async () => {
    const n = await createNotice({ visibleUntil: new Date(Date.now() - 1) });
    expect((await del(n.id)).status).toBe(204);
  });
});
