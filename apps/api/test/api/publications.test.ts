import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createCategory } from '../helpers/factories';
import { createPublicationRow, createSocialPostRow } from '../helpers/social-factories';

let t: TestApp;
let cookie: string;
const url = '/api/v1/publications';
const day = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  cookie = (await loginAs(t.app, 'EDITOR')).cookie;
});

const valid = { title: 'Jornada abierta', summary: 'Resumen corto', section: 'BOTH' };
const create = (body: object = valid, c = cookie) =>
  request(t.app).post(url).set('Cookie', c).send(body);
const act = (id: string, action: string, body: object = {}, c = cookie) =>
  request(t.app).post(`${url}/${id}/${action}`).set('Cookie', c).send(body);
const audited = (action: string) => testPrisma.auditLog.count({ where: { action } });

describe('permisos', () => {
  it('401 sin sesión', async () => {
    const p = await createPublicationRow();
    expect((await request(t.app).get(url)).status).toBe(401);
    expect((await request(t.app).post(url).send(valid)).status).toBe(401);
    expect((await request(t.app).get(`${url}/${p.id}`)).status).toBe(401);
    expect((await request(t.app).patch(`${url}/${p.id}`).send({ title: 'x' })).status).toBe(401);
    expect((await request(t.app).post(`${url}/${p.id}/publish`)).status).toBe(401);
    expect((await request(t.app).delete(`${url}/${p.id}`)).status).toBe(401);
  });

  it('403 para BEDELIA en todos los endpoints', async () => {
    const { cookie: c } = await loginAs(t.app, 'BEDELIA');
    const p = await createPublicationRow();
    expect((await request(t.app).get(url).set('Cookie', c)).status).toBe(403);
    expect((await create(valid, c)).status).toBe(403);
    expect((await request(t.app).get(`${url}/${p.id}`).set('Cookie', c)).status).toBe(403);
    expect(
      (await request(t.app).patch(`${url}/${p.id}`).set('Cookie', c).send({ title: 'x' })).status,
    ).toBe(403);
    for (const a of ['publish', 'pause', 'schedule', 'reactivate']) {
      expect((await act(p.id, a, {}, c)).status).toBe(403);
    }
    expect((await request(t.app).delete(`${url}/${p.id}`).set('Cookie', c)).status).toBe(403);
  });

  it('ADMIN también puede', async () => {
    const { cookie: c } = await loginAs(t.app, 'ADMIN');
    expect((await create(valid, c)).status).toBe(201);
  });
});

describe('POST /publications y GET', () => {
  it('crea en borrador con origen MANUAL, autor y auditoría', async () => {
    const cat = await createCategory({ name: 'Eventos', kind: 'PUBLICATION' });
    const res = await create({ ...valid, categoryId: cat.id, visibleUntil: '2030-12-31' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'DRAFT',
      origin: 'MANUAL',
      kind: 'NEWS',
      visible: false,
      expired: false,
      category: { id: cat.id, name: 'Eventos' },
    });
    expect(await audited('publication.create')).toBe(1);
  });

  it('valida con mensajes en español', async () => {
    const res = await create({ title: '', summary: '' });
    expect(res.status).toBe(400);
    expect(res.body.errors.title[0]).toBe('El título es obligatorio.');
    expect(res.body.errors.summary[0]).toBe('El resumen es obligatorio.');
    const win = await create({ ...valid, visibleFrom: '2026-12-10', visibleUntil: '2026-12-01' });
    expect(win.status).toBe(400);
    expect(win.body.errors.visibleUntil[0]).toMatch(/posterior a la fecha de inicio/);
  });

  it('422 si la categoría no es de publicaciones y 400 si la portada no es una dirección web', async () => {
    const aviso = await createCategory({ name: 'Aviso', kind: 'NOTICE' });
    const r1 = await create({ ...valid, categoryId: aviso.id });
    expect(r1.status).toBe(422);
    expect(r1.body.errors.categoryId).toBeDefined();
    const r2 = await create({ ...valid, coverUrl: 'covers/otro-archivo.webp' });
    expect(r2.status).toBe(400);
    expect(r2.body.errors.coverUrl).toBeDefined();
    expect((await create({ ...valid, coverUrl: 'https://cdn.ejemplo.com/a.jpg' })).status).toBe(
      201,
    );
  });

  it('lista con filtros de estado y origen, paginación y vigencia calculada', async () => {
    await createPublicationRow({ status: 'PUBLISHED', title: 'Vigente' });
    await createPublicationRow({ status: 'PUBLISHED', visibleUntil: day(-1), title: 'Vencida' });
    await createPublicationRow({ status: 'DRAFT', title: 'Borrador' });
    await createPublicationRow({ status: 'PUBLISHED', origin: 'INSTAGRAM', title: 'De Instagram' });

    const all = await request(t.app).get(`${url}?pageSize=2&page=1`).set('Cookie', cookie);
    expect(all.body).toMatchObject({ page: 1, pageSize: 2, total: 4 });
    expect(all.body.items).toHaveLength(2);

    const pub = await request(t.app).get(`${url}?status=PUBLISHED`).set('Cookie', cookie);
    const byTitle = Object.fromEntries(pub.body.items.map((i: { title: string }) => [i.title, i]));
    expect(byTitle['Vigente']).toMatchObject({ visible: true, expired: false });
    expect(byTitle['Vencida']).toMatchObject({ visible: false, expired: true });

    const ig = await request(t.app).get(`${url}?origin=INSTAGRAM`).set('Cookie', cookie);
    expect(ig.body.items.map((i: { title: string }) => i.title)).toEqual(['De Instagram']);

    const q = await request(t.app).get(`${url}?q=borra`).set('Cookie', cookie);
    expect(q.body.total).toBe(1);

    const bad = await request(t.app).get(`${url}?status=NOPE`).set('Cookie', cookie);
    expect(bad.status).toBe(400);
  });

  it('GET /:id devuelve el detalle, 404 si no existe y 400 si el id no es válido', async () => {
    const p = await createPublicationRow({ title: 'Detalle' });
    const ok = await request(t.app).get(`${url}/${p.id}`).set('Cookie', cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.title).toBe('Detalle');
    expect(
      (
        await request(t.app)
          .get(`${url}/6f1c8a5e-1d3b-4c55-9b1e-2f0c1a7b9d11`)
          .set('Cookie', cookie)
      ).status,
    ).toBe(404);
    expect((await request(t.app).get(`${url}/no-es-uuid`).set('Cookie', cookie)).status).toBe(400);
  });
});

describe('PATCH /publications/:id', () => {
  it('edita campos y audita cuáles', async () => {
    const p = await createPublicationRow();
    const res = await request(t.app)
      .patch(`${url}/${p.id}`)
      .set('Cookie', cookie)
      .send({ title: 'Nuevo título', location: 'Sede Lugano' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Nuevo título', location: 'Sede Lugano' });
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'publication.update' } });
    expect(log?.detail).toEqual({ fields: ['title', 'location'] });
  });

  it('valida: vacío, ventana incoherente con lo guardado, 404', async () => {
    const p = await createPublicationRow({ visibleFrom: day(5) });
    const patch = (body: object) =>
      request(t.app).patch(`${url}/${p.id}`).set('Cookie', cookie).send(body);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ title: '' })).status).toBe(400);
    const win = await patch({ visibleUntil: day(1).toISOString() });
    expect(win.status).toBe(422);
    expect(win.body.errors.visibleUntil[0]).toMatch(/posterior/);
    expect(
      (
        await request(t.app)
          .patch(`${url}/6f1c8a5e-1d3b-4c55-9b1e-2f0c1a7b9d11`)
          .set('Cookie', cookie)
          .send({ title: 'x' })
      ).status,
    ).toBe(404);
  });

  it('cambiar la portada por otra dirección borra la imagen propia anterior', async () => {
    await t.storage.put({
      key: 'covers/vieja.webp',
      body: Buffer.from('x'),
      contentType: 'image/webp',
    });
    const p = await createPublicationRow({ coverUrl: 'covers/vieja.webp' });
    const res = await request(t.app)
      .patch(`${url}/${p.id}`)
      .set('Cookie', cookie)
      .send({ coverUrl: 'https://cdn.ejemplo.com/nueva.jpg' });
    expect(res.status).toBe(200);
    expect(await t.storage.exists('covers/vieja.webp')).toBe(false);
  });
});

describe('POST /publications/:id/cover', () => {
  it('sube la imagen, la guarda como WebP y devuelve una URL para mostrarla', async () => {
    const p = await createPublicationRow();
    const png = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#888888' },
    })
      .png()
      .toBuffer();
    const res = await request(t.app)
      .post(`${url}/${p.id}/cover`)
      .set('Cookie', cookie)
      .attach('file', png, 'portada.png');
    expect(res.status).toBe(200);
    expect(res.body.coverUrl).toMatch(/^covers\/.+\.webp$/);
    expect(res.body.coverSrc).toBeTruthy();
    expect(await t.storage.exists(res.body.coverUrl)).toBe(true);
    expect(await audited('publication.cover')).toBe(1);
  });

  it('rechaza archivos que no son imagen y pedidos sin archivo', async () => {
    const p = await createPublicationRow();
    const pdf = Buffer.from('%PDF-1.4 contenido');
    const bad = await request(t.app)
      .post(`${url}/${p.id}/cover`)
      .set('Cookie', cookie)
      .attach('file', pdf, 'doc.pdf');
    expect(bad.status).toBe(415);
    const none = await request(t.app).post(`${url}/${p.id}/cover`).set('Cookie', cookie);
    expect(none.status).toBe(400);
  });
});

describe('cambios de estado', () => {
  it('publish: borrador -> publicada (visible) y audita', async () => {
    const p = await createPublicationRow({ status: 'DRAFT' });
    const res = await act(p.id, 'publish');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PUBLISHED', visible: true });
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'publication.publish' } });
    expect(log?.detail).toEqual({ from: 'DRAFT', to: 'PUBLISHED' });
  });

  it('publish: 409 si ya está publicada y orienta a "reactivar" si está pausada; 422 si ya venció', async () => {
    const pub = await createPublicationRow({ status: 'PUBLISHED' });
    expect((await act(pub.id, 'publish')).status).toBe(409);
    const paused = await createPublicationRow({ status: 'PAUSED' });
    const r = await act(paused.id, 'publish');
    expect(r.status).toBe(409);
    expect(r.body.detail).toMatch(/reactivar/);
    const old = await createPublicationRow({ status: 'DRAFT', visibleUntil: day(-2) });
    expect((await act(old.id, 'publish')).status).toBe(422);
  });

  it('pause: publicada o programada -> pausada, deja de ser visible y NO se borra; 409 desde borrador', async () => {
    const p = await createPublicationRow({ status: 'PUBLISHED' });
    const res = await act(p.id, 'pause');
    expect(res.body).toMatchObject({ status: 'PAUSED', visible: false });
    expect(await testPrisma.publication.count()).toBe(1);
    expect((await act(p.id, 'pause')).status).toBe(409);
    const d = await createPublicationRow({ status: 'DRAFT' });
    expect((await act(d.id, 'pause')).status).toBe(409);
  });

  it('schedule: exige fecha de inicio futura; la programada se muestra recién cuando llega la fecha', async () => {
    const p = await createPublicationRow({ status: 'DRAFT' });
    const noBody = await act(p.id, 'schedule', {});
    expect(noBody.status).toBe(400);
    expect(noBody.body.errors.visibleFrom).toBeDefined();
    const past = await act(p.id, 'schedule', { visibleFrom: day(-1).toISOString() });
    expect(past.status).toBe(422);
    const ok = await act(p.id, 'schedule', {
      visibleFrom: day(3).toISOString(),
      visibleUntil: day(10).toISOString(),
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'SCHEDULED', visible: false });
    // ya programada: no se puede volver a programar
    expect((await act(p.id, 'schedule', { visibleFrom: day(4).toISOString() })).status).toBe(409);
  });

  it('schedule: 422 si el fin no es posterior al inicio', async () => {
    const p = await createPublicationRow({ status: 'DRAFT' });
    const res = await act(p.id, 'schedule', {
      visibleFrom: day(5).toISOString(),
      visibleUntil: day(2).toISOString(),
    });
    expect(res.status).toBe(400); // lo detecta el esquema compartido
    expect(res.body.errors.visibleUntil[0]).toMatch(/posterior/);
  });

  it('una programada cuya fecha de inicio ya llegó es visible (la vigencia se calcula al consultar)', async () => {
    const p = await createPublicationRow({ status: 'SCHEDULED', visibleFrom: day(-1) });
    const res = await request(t.app).get(`${url}/${p.id}`).set('Cookie', cookie);
    expect(res.body).toMatchObject({ status: 'SCHEDULED', visible: true });
  });

  it('reactivate: una vencida exige NUEVA fecha de fin futura', async () => {
    const p = await createPublicationRow({ status: 'PUBLISHED', visibleUntil: day(-3) });
    const sinFecha = await act(p.id, 'reactivate', {});
    expect(sinFecha.status).toBe(422);
    expect(sinFecha.body.errors.visibleUntil[0]).toMatch(/futura/);
    const pasada = await act(p.id, 'reactivate', { visibleUntil: day(-1).toISOString() });
    expect(pasada.status).toBe(422);
    const ok = await act(p.id, 'reactivate', { visibleUntil: day(20).toISOString() });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'PUBLISHED', visible: true, expired: false });
    expect(await audited('publication.reactivate')).toBe(1);
  });

  it('reactivate: una pausada con vigencia abierta vuelve a publicarse; una vigente o borrador dan 409', async () => {
    const paused = await createPublicationRow({ status: 'PAUSED' });
    expect((await act(paused.id, 'reactivate', {})).body).toMatchObject({
      status: 'PUBLISHED',
      visible: true,
    });
    const live = await createPublicationRow({ status: 'PUBLISHED' });
    expect((await act(live.id, 'reactivate', {})).status).toBe(409);
    const draft = await createPublicationRow({ status: 'DRAFT' });
    expect((await act(draft.id, 'reactivate', {})).status).toBe(409);
  });

  it('las acciones sobre una publicación inexistente dan 404', async () => {
    const id = '6f1c8a5e-1d3b-4c55-9b1e-2f0c1a7b9d11';
    for (const a of ['publish', 'pause', 'reactivate']) expect((await act(id, a)).status).toBe(404);
  });
});

describe('DELETE /publications/:id (eliminación manual)', () => {
  const del = (id: string, c = cookie) => request(t.app).delete(`${url}/${id}`).set('Cookie', c);

  it('borrador, pausada y vencida se pueden eliminar (204) y queda auditado', async () => {
    for (const over of [
      { status: 'DRAFT' as const },
      { status: 'PAUSED' as const },
      { status: 'PUBLISHED' as const, visibleUntil: day(-1) },
    ]) {
      const p = await createPublicationRow(over);
      expect((await del(p.id)).status).toBe(204);
      expect(await testPrisma.publication.findUnique({ where: { id: p.id } })).toBeNull();
    }
    expect(await audited('publication.delete')).toBe(3);
  });

  it('409 si está vigente o programada, y no se borra', async () => {
    const live = await createPublicationRow({ status: 'PUBLISHED' });
    const r = await del(live.id);
    expect(r.status).toBe(409);
    expect(r.body.detail).toMatch(/vigente/);
    const sched = await createPublicationRow({ status: 'SCHEDULED', visibleFrom: day(3) });
    expect((await del(sched.id)).status).toBe(409);
    expect(await testPrisma.publication.count()).toBe(2);
  });

  it('404 si no existe', async () => {
    expect((await del('6f1c8a5e-1d3b-4c55-9b1e-2f0c1a7b9d11')).status).toBe(404);
  });

  it('al eliminar una publicación de Instagram, la publicación de redes vuelve a pendiente y se limpia la imagen', async () => {
    const post = await createSocialPostRow({ status: 'LINKED' });
    await t.storage.put({
      key: 'social/img.webp',
      body: Buffer.from('x'),
      contentType: 'image/webp',
    });
    const p = await createPublicationRow({
      status: 'PAUSED',
      origin: 'INSTAGRAM',
      socialPostId: post.id,
      coverUrl: 'social/img.webp',
    });
    expect((await del(p.id)).status).toBe(204);
    expect((await testPrisma.socialPost.findUnique({ where: { id: post.id } }))?.status).toBe(
      'DETECTED',
    );
    expect(await t.storage.exists('social/img.webp')).toBe(false);
  });
});
