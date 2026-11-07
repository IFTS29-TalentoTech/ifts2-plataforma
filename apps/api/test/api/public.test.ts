/**
 * /public/*: lo que ve un visitante sin sesión. Lo más importante acá es lo que NO debe aparecer:
 * contenido vencido, pausado, sin publicar, programado a futuro o de un ciclo que no es el público.
 */
import request from 'supertest';
import { isPublicationVisible } from '@ifts2/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { createCategory, createNotice, createTerm } from '../helpers/factories';
import {
  ago,
  createDocumentRow,
  createExamCallRow,
  createLinkRow,
  createPublicationAt,
  createScheduleRow,
  createSectionRow,
  DAY,
  fromNow,
  someUserId,
} from '../helpers/academic-factories';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
});
afterEach(() => {
  vi.useRealTimers();
});

const get = (url: string) => request(t.app).get(`/api/v1/public${url}`);
const titles = (items: { title: string }[]) => items.map((i) => i.title);

describe('portadas públicas (A06)', () => {
  it.each([
    ['https://api.example.test/cover.webp', 'https://api.example.test/cover.webp'],
    ['https://externa.example.test/cover.webp', 'https://externa.example.test/cover.webp'],
    ['/portada.webp', '/portada.webp'],
    ['social/copiada.webp', 'https://bucket.example.test/social/copiada.webp?X-Amz-Signature=demo'],
    [null, null],
  ])('resuelve %s en inicio, novedades y detalle', async (coverUrl, expected) => {
    const p = await createPublicationAt();
    await testPrisma.publication.update({ where: { id: p.id }, data: { coverUrl } });
    const sign = vi.spyOn(t.storage, 'getSignedUrl').mockResolvedValue(expected ?? '');
    const home = await get('/home');
    const news = await get('/publications');
    const detail = await get(`/publications/${p.id}`);
    for (const res of [home, news, detail]) expect(res.status).toBe(200);
    expect(home.body.publications[0].coverUrl).toBe(expected);
    expect(news.body.items[0].coverUrl).toBe(expected);
    expect(detail.body.coverUrl).toBe(expected);
    if (coverUrl === 'social/copiada.webp')
      expect(sign).toHaveBeenCalledWith(coverUrl, expect.any(Number));
    else expect(sign).not.toHaveBeenCalled();
  });

  it('devuelve null si no puede firmar, conservando las páginas públicas', async () => {
    const p = await createPublicationAt();
    await testPrisma.publication.update({
      where: { id: p.id },
      data: { coverUrl: 'social/copiada.webp' },
    });
    vi.spyOn(t.storage, 'getSignedUrl').mockRejectedValue(new Error('Almacenamiento caído'));
    const home = await get('/home');
    const news = await get('/publications');
    const detail = await get(`/publications/${p.id}`);
    for (const res of [home, news, detail]) expect(res.status).toBe(200);
    expect(home.body.publications[0].coverUrl).toBeNull();
    expect(news.body.items[0].coverUrl).toBeNull();
    expect(detail.body.coverUrl).toBeNull();
  });
});

describe('sin sesión y con caché HTTP', () => {
  it('todos los endpoints responden 200 sin cookie y con Cache-Control corto + stale-while-revalidate', async () => {
    const m = await createPublicationAt();
    for (const path of [
      '/home',
      '/publications',
      `/publications/${m.id}`,
      '/students',
      '/content/carrera',
      '/settings',
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers['cache-control'], path).toMatch(
        /^public, max-age=\d+, s-maxage=\d+, stale-while-revalidate=\d+$/,
      );
      expect(res.headers.etag, path).toBeTruthy();
    }
  });

  it('un If-None-Match igual recibe 304 (ahorra ancho de banda en los picos)', async () => {
    await createLinkRow({ title: 'SIU' });
    const first = await get('/settings');
    const again = await get('/settings').set('If-None-Match', first.headers.etag!);
    expect(again.status).toBe(304);
  });

  it('los errores no se cachean ni filtran detalles', async () => {
    const res = await get('/publications/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBeUndefined();
  });

  it('solo lectura: POST/PUT/DELETE sobre /public no existen', async () => {
    expect((await request(t.app).post('/api/v1/public/home')).status).toBe(404);
    expect((await request(t.app).delete('/api/v1/public/students')).status).toBe(404);
  });
});

describe('GET /public/settings', () => {
  it('objeto plano con las claves cargadas; sin hashtag; sin claves vacías', async () => {
    await testPrisma.siteSetting.createMany({
      data: [
        { key: 'institution_name', value: 'Instituto de Prueba' },
        { key: 'institution_short', value: 'IDP' },
        { key: 'footer_text', value: 'Pie de prueba' },
        { key: 'address', value: 'Calle 123' },
        { key: 'email_institutional', value: 'info@prueba.test' },
        { key: 'instagram_hashtag', value: '#secreto' },
        { key: 'exam_enrollment_open', value: 'true' },
        { key: 'phone', value: '' },
      ],
    });
    const res = await get('/settings');
    expect(res.body).toEqual({
      institution_name: 'Instituto de Prueba',
      institution_short: 'IDP',
      footer_text: 'Pie de prueba',
      address: 'Calle 123',
      email_institutional: 'info@prueba.test',
      exam_enrollment_open: true,
    });
  });

  it('sin ajustes cargados devuelve solo exam_enrollment_open=false (la web usa valores genéricos)', async () => {
    expect((await get('/settings')).body).toEqual({ exam_enrollment_open: false });
  });
});

describe('GET /public/content/:page', () => {
  it('devuelve solo secciones visibles, ordenadas, con Markdown saneado; 404 si la página no existe', async () => {
    await createSectionRow({ page: 'carrera', slug: 'b', title: 'B', order: 2, body: 'Dos' });
    await createSectionRow({
      page: 'carrera',
      slug: 'a',
      title: 'A',
      order: 1,
      body: 'Uno <script>alert(1)</script>[x](javascript:alert(1))',
    });
    await createSectionRow({ page: 'carrera', slug: 'oculta', visible: false });
    await createSectionRow({ page: 'ingreso', slug: 'otra' });
    const res = await get('/content/carrera');
    expect(res.body).toEqual({
      page: 'carrera',
      sections: [
        { slug: 'a', title: 'A', body: 'Uno x', order: 1 },
        { slug: 'b', title: 'B', body: 'Dos', order: 2 },
      ],
    });
    expect((await get('/content/inventada')).status).toBe(404);
    expect((await get('/content/institucional')).body.sections).toEqual([]);
  });
});

describe('GET /public/home', () => {
  it('frase ancla, accesos (solo enlaces visibles) y marca de inscripción abierta', async () => {
    await testPrisma.siteSetting.createMany({
      data: [
        { key: 'tagline', value: 'Frase de prueba' },
        { key: 'exam_enrollment_open', value: 'true' },
      ],
    });
    await createLinkRow({ title: 'Segundo', order: 2 });
    await createLinkRow({ title: 'Primero', order: 1, url: 'https://uno.test/' });
    await createLinkRow({ title: 'Oculto', visible: false });
    const res = await get('/home');
    expect(res.body.tagline).toBe('Frase de prueba');
    expect(res.body.examEnrollmentOpen).toBe(true);
    expect(titles(res.body.quickLinks)).toEqual(['Primero', 'Segundo']);
    expect(res.body.quickLinks[0]).toEqual({
      id: expect.any(String),
      title: 'Primero',
      url: 'https://uno.test/',
      description: null,
      group: 'academico',
      enrollment: false,
    });
    expect(res.body).toMatchObject({
      publications: [],
      highlightedNotices: [],
      highlightedExamCalls: [],
    });
  });

  it('sin ajustes: tagline null y inscripción cerrada', async () => {
    const res = await get('/home');
    expect(res.body).toMatchObject({ tagline: null, examEnrollmentOpen: false });
  });

  it('publicaciones: solo HOME/BOTH vigentes (nada borrador, pausado, vencido, futuro ni solo NEWS)', async () => {
    await createPublicationAt({ title: 'Home vigente', section: 'HOME', visibleFrom: ago(DAY) });
    await createPublicationAt({ title: 'Both sin fechas', section: 'BOTH' });
    await createPublicationAt({
      title: 'Programada ya llegó',
      status: 'SCHEDULED',
      section: 'BOTH',
      visibleFrom: ago(DAY),
    });
    await createPublicationAt({ title: 'Solo novedades', section: 'NEWS' });
    await createPublicationAt({ title: 'Borrador', status: 'DRAFT', section: 'HOME' });
    await createPublicationAt({ title: 'Pausada', status: 'PAUSED', section: 'HOME' });
    await createPublicationAt({
      title: 'Vencida',
      section: 'HOME',
      visibleFrom: ago(5 * DAY),
      visibleUntil: ago(DAY),
    });
    await createPublicationAt({
      title: 'Publicada a futuro',
      section: 'HOME',
      visibleFrom: fromNow(DAY),
    });
    await createPublicationAt({
      title: 'Programada futura',
      status: 'SCHEDULED',
      section: 'HOME',
      visibleFrom: fromNow(DAY),
    });
    await createPublicationAt({
      title: 'Programada sin fecha',
      status: 'SCHEDULED',
      section: 'HOME',
    });
    const res = await get('/home');
    expect(titles(res.body.publications).sort()).toEqual(
      ['Both sin fechas', 'Home vigente', 'Programada ya llegó'].sort(),
    );
  });

  it('limita a 6 publicaciones, la más reciente primero, con la forma documentada', async () => {
    const cat = await createCategory({ kind: 'PUBLICATION', name: 'Eventos' });
    for (let i = 1; i <= 8; i++) {
      await createPublicationAt({
        title: `N${i}`,
        section: 'HOME',
        visibleFrom: ago(i * DAY),
        categoryId: i === 1 ? cat.id : null,
      });
    }
    const res = await get('/home');
    expect(titles(res.body.publications)).toEqual(['N1', 'N2', 'N3', 'N4', 'N5', 'N6']);
    expect(res.body.publications[0]).toEqual({
      id: expect.any(String),
      kind: 'NEWS',
      title: 'N1',
      summary: 'Resumen de la novedad',
      coverUrl: null,
      category: { id: cat.id, name: 'Eventos' },
      section: 'HOME',
      origin: 'MANUAL',
      date: expect.any(String),
      visibleUntil: null,
      eventStart: null,
      eventEnd: null,
      location: null,
    });
  });

  it('destacados: avisos vigentes con la casilla y llamados publicados del ciclo público que no terminaron', async () => {
    const pub = await createTerm({ year: 2026, kind: 'SECOND', publicCurrent: true });
    const other = await createTerm({ year: 2025, kind: 'SECOND' });
    const author = await someUserId();
    const mk = (over: object) =>
      testPrisma.notice.create({ data: { title: 'x', body: 'b', authorId: author, ...over } });
    await mk({ title: 'Destacado vigente', highlighted: true });
    await mk({ title: 'Destacado urgente', highlighted: true, urgent: true });
    await mk({ title: 'Sin destacar' });
    await mk({
      title: 'Destacado vencido',
      highlighted: true,
      visibleFrom: ago(5 * DAY),
      visibleUntil: ago(DAY),
    });
    await mk({ title: 'Destacado pausado', highlighted: true, status: 'PAUSED' });
    await mk({ title: 'Destacado futuro', highlighted: true, visibleFrom: fromNow(DAY) });

    await createExamCallRow({
      termId: pub.id,
      name: 'Mesa destacada',
      highlighted: true,
      published: true,
    });
    await createExamCallRow({ termId: pub.id, name: 'Mesa sin destacar', published: true });
    await createExamCallRow({
      termId: pub.id,
      name: 'Mesa borrador',
      highlighted: true,
      published: false,
    });
    await createExamCallRow({
      termId: pub.id,
      name: 'Mesa ya terminó',
      highlighted: true,
      published: true,
      startsOn: ago(10 * DAY),
      endsOn: ago(DAY),
    });
    await createExamCallRow({
      termId: other.id,
      name: 'Mesa de otro ciclo',
      highlighted: true,
      published: true,
    });

    const res = await get('/home');
    expect(titles(res.body.highlightedNotices)).toEqual(['Destacado urgente', 'Destacado vigente']);
    expect(res.body.highlightedExamCalls.map((c: { name: string }) => c.name)).toEqual([
      'Mesa destacada',
    ]);
  });
});

describe('GET /public/publications', () => {
  it('lista solo NEWS/BOTH vigentes, pagina, y trae categorías y años para los filtros', async () => {
    const cat = await createCategory({ kind: 'PUBLICATION', name: 'Institucional' });
    await createCategory({ kind: 'NOTICE', name: 'No es de novedades' });
    for (let i = 1; i <= 5; i++)
      await createPublicationAt({
        title: `V${i}`,
        section: i % 2 ? 'NEWS' : 'BOTH',
        visibleFrom: ago(i * DAY),
        categoryId: i === 1 ? cat.id : null,
      });
    await createPublicationAt({ title: 'Solo inicio', section: 'HOME' });
    await createPublicationAt({ title: 'Borrador', status: 'DRAFT' });
    await createPublicationAt({ title: 'Pausada', status: 'PAUSED' });
    await createPublicationAt({
      title: 'Vencida',
      visibleFrom: ago(9 * DAY),
      visibleUntil: ago(DAY),
    });

    const page1 = await get('/publications?pageSize=2');
    expect(page1.body).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 5,
      archived: false,
      year: null,
    });
    expect(titles(page1.body.items)).toEqual(['V1', 'V2']);
    expect(page1.body.categories).toEqual([{ id: cat.id, name: 'Institucional' }]);
    expect(page1.body.availableYears).toContain(new Date().getFullYear());
    const page3 = await get('/publications?pageSize=2&page=3');
    expect(titles(page3.body.items)).toEqual(['V5']);
    expect(titles((await get('/publications?category=' + cat.id)).body.items)).toEqual(['V1']);
  });

  it('?archived=true devuelve las vencidas del año (y solo esas)', async () => {
    const lastYear = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 5, 15));
    await createPublicationAt({ title: 'Vigente' });
    await createPublicationAt({
      title: 'Vencida este año',
      visibleFrom: ago(20 * DAY),
      visibleUntil: ago(DAY),
    });
    await createPublicationAt({
      title: 'Vencida de otro año',
      visibleFrom: lastYear,
      visibleUntil: new Date(lastYear.getTime() + DAY),
    });
    await createPublicationAt({
      title: 'Pausada vieja',
      status: 'PAUSED',
      visibleFrom: ago(20 * DAY),
      visibleUntil: ago(DAY),
    });
    await createPublicationAt({ title: 'Borrador viejo', status: 'DRAFT', visibleUntil: ago(DAY) });

    const now = await get('/publications?archived=true');
    expect(titles(now.body.items)).toEqual(['Vencida este año']);
    expect(now.body).toMatchObject({ archived: true, year: new Date().getFullYear() });
    const prev = await get(`/publications?archived=true&year=${lastYear.getUTCFullYear()}`);
    expect(titles(prev.body.items)).toEqual(['Vencida de otro año']);
    expect(prev.body.availableYears).toEqual(
      expect.arrayContaining([lastYear.getUTCFullYear(), new Date().getFullYear()]),
    );
    // y lo vencido nunca aparece en la lista normal
    expect(titles((await get('/publications')).body.items)).toEqual(['Vigente']);
  });

  it('filtra por año usando el huso de Buenos Aires', async () => {
    // 2026-01-01 00:30 en Buenos Aires = 2026-01-01 03:30 UTC (ya es 2026); 2025-12-31 23:30 BA = 2026-01-01 02:30 UTC (todavía 2025).
    await createPublicationAt({
      title: 'Año nuevo',
      visibleFrom: new Date('2026-01-01T03:30:00Z'),
    });
    await createPublicationAt({
      title: 'Fin de año',
      visibleFrom: new Date('2026-01-01T02:30:00Z'),
    });
    expect(titles((await get('/publications?year=2026')).body.items)).toEqual(['Año nuevo']);
    expect(titles((await get('/publications?year=2025')).body.items)).toEqual(['Fin de año']);
  });

  it('valida los parámetros', async () => {
    expect((await get('/publications?page=0')).status).toBe(400);
    expect((await get('/publications?pageSize=500')).status).toBe(400);
    expect((await get('/publications?category=no-es-uuid')).status).toBe(400);
    expect((await get('/publications?year=abc')).status).toBe(400);
    expect((await get('/publications?archived=quizas')).status).toBe(400);
  });
});

describe('histórico de publicaciones programadas (A05)', () => {
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };

  beforeEach(() => at('2026-06-15T12:00:00.000Z'));

  it('separa vigentes e históricas y excluye estados y ventanas nunca elegibles', async () => {
    const past = new Date('2026-06-01T12:00:00.000Z');
    const end = new Date('2026-06-10T12:00:00.000Z');
    const future = new Date('2026-07-01T12:00:00.000Z');
    const live = [];
    const archived = [];
    const hidden = [];
    for (const status of ['PUBLISHED', 'SCHEDULED'] as const) {
      live.push(await createPublicationAt({ status, visibleFrom: past, visibleUntil: future }));
      archived.push(await createPublicationAt({ status, visibleFrom: past, visibleUntil: end }));
      hidden.push(await createPublicationAt({ status, visibleFrom: future }));
    }
    archived.push(await createPublicationAt({ visibleUntil: end }));
    for (const status of ['DRAFT', 'PAUSED'] as const) {
      hidden.push(await createPublicationAt({ status, visibleFrom: past, visibleUntil: end }));
    }
    for (const visibleFrom of [null, future, end]) {
      hidden.push(
        await createPublicationAt({ status: 'SCHEDULED', visibleFrom, visibleUntil: end }),
      );
    }
    hidden.push(await createPublicationAt({ status: 'SCHEDULED' }));
    hidden.push(
      await createPublicationAt({ status: 'SCHEDULED', visibleFrom: end, visibleUntil: past }),
    );

    const current = await get('/publications');
    const history = await get('/publications?archived=true');
    expect(current.status).toBe(200);
    expect(history.status).toBe(200);
    const ids = (items: { id: string }[]) => items.map((p) => p.id).sort();
    expect(ids(current.body.items)).toEqual(ids(live));
    expect(current.body.total).toBe(live.length);
    expect(ids(history.body.items)).toEqual(ids(archived));
    expect(history.body.total).toBe(archived.length);
    expect(ids((await get('/home')).body.publications)).toEqual(ids(live));
    expect(new Set([...ids(current.body.items), ...ids(history.body.items)]).size).toBe(
      live.length + archived.length,
    );
    for (const p of live) {
      expect(isPublicationVisible(p, new Date())).toBe(true);
      expect((await get(`/publications/${p.id}`)).status).toBe(200);
      expect((await get(`/publications/${p.id}?archived=true`)).status).toBe(404);
    }
    for (const p of archived) {
      expect(isPublicationVisible(p, new Date(p.visibleUntil!.getTime() - 1))).toBe(true);
      expect((await get(`/publications/${p.id}`)).status).toBe(404);
      const detail = await get(`/publications/${p.id}?archived=true`);
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({ id: p.id, body: p.body, origin: 'MANUAL' });
    }
    for (const p of hidden) {
      expect(isPublicationVisible(p, new Date())).toBe(false);
      expect((await get(`/publications/${p.id}`)).status).toBe(404);
      expect((await get(`/publications/${p.id}?archived=true`)).status).toBe(404);
    }
    expect(await testPrisma.publication.count({ where: { status: 'SCHEDULED' } })).toBe(
      [...live, ...archived, ...hidden].filter((p) => p.status === 'SCHEDULED').length,
    );
  });

  it.each(['PUBLISHED', 'SCHEDULED'] as const)(
    '%s: pasa de futura a vigente y al histórico en los límites exactos, sin duplicados',
    async (status) => {
      const from = new Date('2026-06-15T12:00:00.000Z');
      const until = new Date('2026-06-16T12:00:00.000Z');
      const p = await createPublicationAt({ status, visibleFrom: from, visibleUntil: until });
      for (const [time, visible, expired] of [
        [from.getTime() - 1, false, false],
        [from.getTime(), true, false],
        [until.getTime() - 1, true, false],
        [until.getTime(), false, true],
      ] as const) {
        at(new Date(time).toISOString());
        const current = await get('/publications');
        const history = await get('/publications?archived=true');
        expect(current.body.total).toBe(Number(visible));
        expect(current.body.items.map((p: { id: string }) => p.id)).toEqual(visible ? [p.id] : []);
        expect(history.body.total).toBe(Number(expired));
        expect(history.body.items.map((p: { id: string }) => p.id)).toEqual(expired ? [p.id] : []);
        expect(history.body.availableYears).toEqual(
          status === 'SCHEDULED' && time < from.getTime() ? [] : [2026],
        );
        expect((await get(`/publications/${p.id}`)).status).toBe(visible ? 200 : 404);
        expect((await get(`/publications/${p.id}?archived=true`)).status).toBe(expired ? 200 : 404);
        expect(isPublicationVisible(p, new Date())).toBe(visible);
      }
      expect((await testPrisma.publication.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
        status,
      );
    },
  );

  it('conserva el detalle archivado de Instagram sin modificar su origen ni enlace', async () => {
    const post = await testPrisma.socialPost.create({
      data: {
        externalId: 'ig-a05',
        permalink: 'https://instagram.test/p/a05',
        caption: 'Publicación aprobada',
        mediaUrl: 'https://instagram.test/a05.jpg',
        postedAt: new Date('2026-06-01T12:00:00Z'),
      },
    });
    const p = await createPublicationAt({
      visibleFrom: new Date('2026-06-01T12:00:00Z'),
      visibleUntil: new Date('2026-06-10T12:00:00Z'),
    });
    await testPrisma.publication.update({
      where: { id: p.id },
      data: { origin: 'INSTAGRAM', socialPostId: post.id },
    });
    const history = await get('/publications?archived=true');
    expect(history.body).toMatchObject({ total: 1, items: [{ id: p.id, origin: 'INSTAGRAM' }] });
    expect((await get(`/publications/${p.id}?archived=true`)).body).toMatchObject({
      id: p.id,
      origin: 'INSTAGRAM',
      permalink: post.permalink,
    });
    expect((await get(`/publications/${p.id}`)).status).toBe(404);
  });

  it('incluye años programados elegibles y filtra y pagina el histórico en hora de Buenos Aires', async () => {
    const cat = await createCategory({ kind: 'PUBLICATION', name: 'Institucional' });
    const other = await createCategory({ kind: 'PUBLICATION', name: 'Eventos' });
    const beforeBA = new Date('2026-01-01T02:59:59.999Z');
    const newYearBA = new Date('2026-01-01T03:00:00.000Z');
    const expired = new Date('2026-02-01T12:00:00.000Z');
    const selected = [];
    for (let i = 0; i < 3; i++) {
      selected.push(
        await createPublicationAt({
          status: 'SCHEDULED',
          visibleFrom: beforeBA,
          visibleUntil: expired,
          categoryId: cat.id,
          createdAt: newYearBA,
        }),
      );
    }
    const nextYear = await createPublicationAt({
      status: 'SCHEDULED',
      visibleFrom: newYearBA,
      visibleUntil: expired,
      categoryId: cat.id,
    });
    await createPublicationAt({
      status: 'SCHEDULED',
      visibleFrom: beforeBA,
      visibleUntil: expired,
      categoryId: other.id,
    });
    const fallback = await createPublicationAt({
      visibleUntil: expired,
      createdAt: new Date('2024-01-01T02:59:59.999Z'),
      categoryId: other.id,
    });
    await createPublicationAt({
      status: 'SCHEDULED',
      visibleFrom: new Date('2024-06-01T12:00:00Z'),
    });
    await createPublicationAt({
      status: 'SCHEDULED',
      visibleFrom: new Date('2027-01-01T12:00:00Z'),
    });
    await createPublicationAt({
      status: 'PAUSED',
      visibleFrom: new Date('2022-01-01T12:00:00Z'),
      visibleUntil: expired,
    });
    await createPublicationAt({
      status: 'DRAFT',
      visibleFrom: new Date('2021-01-01T12:00:00Z'),
      visibleUntil: expired,
    });
    await createPublicationAt({
      status: 'SCHEDULED',
      visibleFrom: new Date('2020-01-01T12:00:00Z'),
      visibleUntil: expired,
      section: 'HOME',
    });
    await createPublicationAt({
      status: 'SCHEDULED',
      createdAt: new Date('2019-01-01T12:00:00Z'),
      visibleUntil: expired,
    });
    await createPublicationAt({
      status: 'SCHEDULED',
      visibleFrom: new Date('2018-01-01T12:00:00Z'),
      visibleUntil: new Date('2018-01-01T12:00:00Z'),
    });

    const url = `/publications?archived=true&year=2025&category=${cat.id}&pageSize=2`;
    const pages = [await get(url), await get(`${url}&page=2`), await get(`${url}&page=3`)];
    for (const [i, page] of pages.entries()) {
      expect(page.status).toBe(200);
      expect(page.body).toMatchObject({
        total: 3,
        page: i + 1,
        pageSize: 2,
        year: 2025,
        archived: true,
      });
      expect(page.body.availableYears).toEqual([2026, 2025, 2024, 2023]);
    }
    const ids = pages.flatMap((r) => r.body.items.map((p: { id: string }) => p.id));
    expect(ids).toEqual(selected.map((p) => p.id).sort());
    expect(new Set(ids).size).toBe(3);
    expect(pages.map((r) => r.body.items.length)).toEqual([2, 1, 0]);
    const current = await get('/publications');
    expect(current.body.availableYears).toEqual(pages[0]!.body.availableYears);
    expect(
      (await get('/publications?archived=true')).body.items.map((p: { id: string }) => p.id),
    ).toEqual([nextYear.id]);
    expect(
      (await get(`/publications?archived=true&year=2023&category=${other.id}`)).body.items.map(
        (p: { id: string }) => p.id,
      ),
    ).toEqual([fallback.id]);
    expect((await get('/publications?archived=true&year=2024')).body.total).toBe(0);
    expect((await get(`/publications?year=2024&category=${cat.id}`)).body.total).toBe(0);
  });
});

describe('GET /public/publications/:id', () => {
  it('detalle de una vigente con cuerpo y enlace de Instagram; 404 si no es visible', async () => {
    const visible = await createPublicationAt({ title: 'Visible' });
    const post = await testPrisma.socialPost.create({
      data: {
        externalId: 'ig-1',
        permalink: 'https://instagram.test/p/1',
        caption: 'c',
        mediaUrl: 'https://x/y.jpg',
        postedAt: new Date(),
      },
    });
    const fromIg = await createPublicationAt({ title: 'Desde Instagram' });
    await testPrisma.publication.update({
      where: { id: fromIg.id },
      data: { socialPostId: post.id, origin: 'INSTAGRAM' },
    });

    const res = await get(`/publications/${visible.id}`);
    expect(res.body).toMatchObject({
      id: visible.id,
      title: 'Visible',
      body: 'Cuerpo de la novedad',
      permalink: null,
    });
    expect((await get(`/publications/${fromIg.id}`)).body).toMatchObject({
      origin: 'INSTAGRAM',
      permalink: 'https://instagram.test/p/1',
    });

    for (const p of [
      await createPublicationAt({ status: 'DRAFT' }),
      await createPublicationAt({ status: 'PAUSED' }),
      await createPublicationAt({ visibleUntil: ago(DAY), visibleFrom: ago(3 * DAY) }),
      await createPublicationAt({ visibleFrom: fromNow(DAY) }),
      await createPublicationAt({ status: 'SCHEDULED', visibleFrom: fromNow(DAY) }),
    ]) {
      expect((await get(`/publications/${p.id}`)).status).toBe(404);
    }
    expect((await get('/publications/no-es-uuid')).status).toBe(400);
  });

  it('?archived=true abre una vencida del histórico, pero no una vigente ni una pausada', async () => {
    const expired = await createPublicationAt({
      visibleFrom: ago(3 * DAY),
      visibleUntil: ago(DAY),
    });
    const live = await createPublicationAt({});
    const paused = await createPublicationAt({ status: 'PAUSED', visibleUntil: ago(DAY) });
    expect((await get(`/publications/${expired.id}?archived=true`)).status).toBe(200);
    expect((await get(`/publications/${live.id}?archived=true`)).status).toBe(404);
    expect((await get(`/publications/${paused.id}?archived=true`)).status).toBe(404);
  });
});

describe('GET /public/students', () => {
  it('sin ciclo público: term=null, sin horarios ni llamados, pero con avisos y enlaces', async () => {
    const other = await createTerm({ publicCurrent: false });
    await createScheduleRow({ termId: other.id, published: true });
    await createNotice({ title: 'Aviso general' });
    await createLinkRow({ title: 'SIU' });
    const res = await get('/students');
    expect(res.body.term).toBeNull();
    expect(res.body.schedules).toEqual([]);
    expect(res.body.examCalls).toEqual([]);
    expect(titles(res.body.notices)).toEqual(['Aviso general']);
    expect(titles(res.body.links)).toEqual(['SIU']);
  });

  it('horarios y llamados: solo publicados del ciclo público, con enlace de descarga firmado y sin clave de almacenamiento', async () => {
    const pub = await createTerm({ year: 2026, kind: 'SECOND', publicCurrent: true });
    const old = await createTerm({ year: 2026, kind: 'FIRST' });
    // A08: el interruptor general encendido para que la casilla del llamado cuente.
    await testPrisma.siteSetting.create({ data: { key: 'exam_enrollment_open', value: 'true' } });
    const doc = await createDocumentRow({
      title: 'Grilla A',
      storageKey: 'documents/secreta-123.pdf',
    });
    await createScheduleRow({
      termId: pub.id,
      commissionName: 'Comisión B',
      published: true,
      documentId: doc.id,
    });
    await createScheduleRow({ termId: pub.id, commissionName: 'Comisión A', published: true });
    await createScheduleRow({
      termId: pub.id,
      commissionName: 'Sin publicar',
      published: false,
      documentId: doc.id,
    });
    await createScheduleRow({ termId: old.id, commissionName: 'De otro ciclo', published: true });
    await createExamCallRow({
      termId: pub.id,
      name: 'Mesa tarde',
      published: true,
      startsOn: fromNow(20 * DAY),
      endsOn: fromNow(22 * DAY),
    });
    await createExamCallRow({
      termId: pub.id,
      name: 'Mesa temprano',
      published: true,
      enrollmentOpen: true,
      documentId: doc.id,
      startsOn: fromNow(3 * DAY),
      endsOn: fromNow(5 * DAY),
    });
    await createExamCallRow({ termId: pub.id, name: 'Mesa sin publicar', published: false });
    await createExamCallRow({ termId: old.id, name: 'Mesa de otro ciclo', published: true });

    const res = await get('/students');
    expect(res.body.term).toEqual({
      id: pub.id,
      year: 2026,
      kind: 'SECOND',
      label: '2026 · 2.º cuatrimestre',
    });
    expect(res.body.schedules.map((s: { commissionName: string }) => s.commissionName)).toEqual([
      'Comisión A',
      'Comisión B',
    ]);
    expect(res.body.schedules[0].file).toBeNull();
    expect(res.body.schedules[1]).toEqual({
      id: expect.any(String),
      commissionName: 'Comisión B',
      notes: null,
      updatedAt: expect.any(String),
      file: {
        title: 'Grilla A',
        filename: doc.filename,
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        downloadUrl: expect.stringContaining('memory://'),
      },
    });
    expect(res.body.examCalls.map((c: { name: string }) => c.name)).toEqual([
      'Mesa temprano',
      'Mesa tarde',
    ]);
    expect(res.body.examCalls[0]).toMatchObject({
      enrollmentOpen: true,
      highlighted: false,
      file: { title: 'Grilla A' },
    });
    // la clave interna jamás sale
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
    expect(res.body.schedules[1].file.downloadUrl).toContain(
      encodeURIComponent('documents/secreta-123.pdf'),
    );
  });

  it('cambiar el ciclo público cambia lo que se ve (RF06)', async () => {
    const a = await createTerm({ year: 2026, kind: 'FIRST', publicCurrent: true });
    const b = await createTerm({ year: 2026, kind: 'SECOND' });
    await createScheduleRow({ termId: a.id, commissionName: 'Del primero', published: true });
    await createScheduleRow({ termId: b.id, commissionName: 'Del segundo', published: true });
    expect(
      (await get('/students')).body.schedules.map(
        (s: { commissionName: string }) => s.commissionName,
      ),
    ).toEqual(['Del primero']);
    const admin = await loginAs(t.app, 'ADMIN');
    await request(t.app)
      .put(`/api/v1/terms/${b.id}/public-current`)
      .set('Cookie', admin.cookie)
      .expect(200);
    const after = await get('/students');
    expect(after.body.term.id).toBe(b.id);
    expect(after.body.schedules.map((s: { commissionName: string }) => s.commissionName)).toEqual([
      'Del segundo',
    ]);
  });

  it('avisos: urgentes primero; sin vencidos, pausados ni futuros; filtro por destinatario', async () => {
    const author = await someUserId();
    const mk = (over: object) =>
      testPrisma.notice.create({ data: { title: 'x', body: 'b', authorId: author, ...over } });
    await mk({ title: 'Normal', visibleFrom: ago(DAY) });
    await mk({ title: 'Urgente viejo', urgent: true, visibleFrom: ago(10 * DAY) });
    await mk({ title: 'Más nuevo', visibleFrom: ago(1000) });
    await mk({ title: 'Para aspirantes', audience: 'ASPIRANTS' });
    await mk({ title: 'Para graduados', audience: 'GRADUATES' });
    await mk({ title: 'Vencido', visibleFrom: ago(9 * DAY), visibleUntil: ago(DAY) });
    await mk({ title: 'Pausado', status: 'PAUSED' });
    await mk({ title: 'Futuro', visibleFrom: fromNow(DAY) });

    const all = titles((await get('/students')).body.notices);
    expect(all[0]).toBe('Urgente viejo');
    expect(all.sort()).toEqual(
      ['Urgente viejo', 'Normal', 'Más nuevo', 'Para aspirantes', 'Para graduados'].sort(),
    );
    expect(titles((await get('/students?audience=ASPIRANTS')).body.notices).sort()).toEqual(
      ['Urgente viejo', 'Normal', 'Más nuevo', 'Para aspirantes'].sort(),
    );
    expect(titles((await get('/students?audience=ALL')).body.notices)).toContain('Para graduados');
    expect((await get('/students?audience=NADIE')).status).toBe(400);
  });

  it('aviso con adjunto: incluye el archivo con descarga; categoría con nombre', async () => {
    const cat = await createCategory({ kind: 'NOTICE', name: 'Inscripciones' });
    const doc = await createDocumentRow({ title: 'Instructivo' });
    const n = await createNotice({ title: 'Con adjunto' });
    await testPrisma.notice.update({
      where: { id: n.id },
      data: { attachmentId: doc.id, categoryId: cat.id, highlighted: true },
    });
    const res = await get('/students');
    expect(res.body.notices[0]).toEqual({
      id: n.id,
      title: 'Con adjunto',
      body: 'Texto del aviso',
      urgent: false,
      highlighted: true,
      audience: 'ALL',
      category: { id: cat.id, name: 'Inscripciones' },
      visibleFrom: expect.any(String),
      visibleUntil: null,
      attachment: {
        title: 'Instructivo',
        filename: doc.filename,
        mimeType: 'application/pdf',
        sizeBytes: 1234,
        downloadUrl: expect.any(String),
      },
    });
  });

  it('inscripción a mesas habilitada sale de los ajustes', async () => {
    expect((await get('/students')).body.examEnrollmentOpen).toBe(false);
    await testPrisma.siteSetting.create({ data: { key: 'exam_enrollment_open', value: 'true' } });
    expect((await get('/students')).body.examEnrollmentOpen).toBe(true);
  });

  it('A08: cada llamado informa el estado EFECTIVO (interruptor general + casilla + no terminado)', async () => {
    const term = await createTerm({ publicCurrent: true });
    const call = (name: string, enrollmentOpen: boolean, endsOn = fromNow(5 * DAY)) =>
      createExamCallRow({
        termId: term.id,
        name,
        published: true,
        enrollmentOpen,
        startsOn: ago(DAY),
        endsOn,
      });
    await call('Marcado', true);
    await call('Sin marcar', false);
    await call('Marcado pero terminado', true, ago(1000));
    const states = async () =>
      Object.fromEntries(
        (await get('/students')).body.examCalls.map(
          (c: { name: string; enrollmentOpen: boolean }) => [c.name, c.enrollmentOpen],
        ),
      );

    // Interruptor general apagado: ningún llamado figura abierto (no contradice "cerrada por ahora").
    expect(await states()).toEqual({
      Marcado: false,
      'Sin marcar': false,
      'Marcado pero terminado': false,
    });
    // Encendido: solo el marcado y vigente.
    await testPrisma.siteSetting.create({ data: { key: 'exam_enrollment_open', value: 'true' } });
    expect(await states()).toEqual({
      Marcado: true,
      'Sin marcar': false,
      'Marcado pero terminado': false,
    });
    // La casilla guardada no se toca: el cálculo es al consultar (sin tareas programadas).
    expect(
      (await testPrisma.examCall.findFirstOrThrow({ where: { name: 'Marcado pero terminado' } }))
        .enrollmentOpen,
    ).toBe(true);
  });

  it('A08: el inicio aplica la misma regla a los llamados destacados', async () => {
    const term = await createTerm({ publicCurrent: true });
    await createExamCallRow({
      termId: term.id,
      name: 'Destacado',
      published: true,
      highlighted: true,
      enrollmentOpen: true,
    });
    expect((await get('/home')).body.highlightedExamCalls[0].enrollmentOpen).toBe(false);
    await testPrisma.siteSetting.create({ data: { key: 'exam_enrollment_open', value: 'true' } });
    expect((await get('/home')).body.highlightedExamCalls[0].enrollmentOpen).toBe(true);
  });

  it('A07: cada enlace informa si es el de inscripción de alumnos', async () => {
    await createLinkRow({ title: 'SIU Guaraní — Gestión académica' });
    await createLinkRow({ title: 'Sistema de alumnos', enrollment: true });
    await createLinkRow({ title: 'Inscripción oculta', enrollment: true, visible: false });
    const links = (await get('/students')).body.links as { title: string; enrollment: boolean }[];
    expect(Object.fromEntries(links.map((l) => [l.title, l.enrollment]))).toEqual({
      'SIU Guaraní — Gestión académica': false,
      'Sistema de alumnos': true,
    });
  });

  it('si el almacenamiento falla la página carga igual (downloadUrl=null) — RNF03', async () => {
    const pub = await createTerm({ publicCurrent: true });
    const doc = await createDocumentRow();
    await createScheduleRow({
      termId: pub.id,
      commissionName: 'Com',
      published: true,
      documentId: doc.id,
    });
    t.storage.getSignedUrl = async () => {
      throw new Error('almacenamiento caído');
    };
    const res = await get('/students');
    expect(res.status).toBe(200);
    expect(res.body.schedules[0].file).toMatchObject({ title: doc.title, downloadUrl: null });
  });

  it('un documento archivado con "force" sigue enlazado en lo visible (no se rompe el sitio)', async () => {
    const pub = await createTerm({ publicCurrent: true });
    const doc = await createDocumentRow({ status: 'ARCHIVED' });
    await createScheduleRow({
      termId: pub.id,
      commissionName: 'Com',
      published: true,
      documentId: doc.id,
    });
    expect((await get('/students')).body.schedules[0].file.downloadUrl).toBeTruthy();
  });
});

describe('integración: crear por la API del panel y verlo en /public/students (06-testing)', () => {
  it('un aviso creado por Bedelía aparece al público; al pausarlo desaparece; al eliminarlo no queda', async () => {
    const bedelia = await loginAs(t.app, 'BEDELIA');
    const create = await request(t.app)
      .post('/api/v1/notices')
      .set('Cookie', bedelia.cookie)
      .send({ title: 'Aviso de integración', body: 'Texto', urgent: true });
    expect(create.status).toBe(201);
    expect(await testPrisma.notice.count({ where: { id: create.body.id } })).toBe(1);
    expect(titles((await get('/students')).body.notices)).toEqual(['Aviso de integración']);

    await request(t.app)
      .post(`/api/v1/notices/${create.body.id}/pause`)
      .set('Cookie', bedelia.cookie)
      .expect(200);
    expect((await get('/students')).body.notices).toEqual([]);

    await request(t.app)
      .delete(`/api/v1/notices/${create.body.id}`)
      .set('Cookie', bedelia.cookie)
      .expect(204);
    expect(await testPrisma.notice.count()).toBe(0);
  });
});

describe('bordes de vigencia (reloj fijo)', () => {
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };
  const T = '2026-11-25T12:00:00.000Z';
  const ms = (n: number) => new Date(new Date(T).getTime() + n);

  it('aviso: visibleUntil EXCLUSIVO (a las T ya no se ve, un ms antes sí)', async () => {
    await createNotice({ title: 'Vence en T', visibleFrom: ms(-DAY), visibleUntil: new Date(T) });
    at(ms(-1).toISOString());
    expect(titles((await get('/students')).body.notices)).toEqual(['Vence en T']);
    at(T);
    expect((await get('/students')).body.notices).toEqual([]);
  });

  it('aviso: visibleFrom INCLUSIVO (a las T ya se ve, un ms antes no)', async () => {
    await createNotice({ title: 'Empieza en T', visibleFrom: new Date(T) });
    at(ms(-1).toISOString());
    expect((await get('/students')).body.notices).toEqual([]);
    at(T);
    expect(titles((await get('/students')).body.notices)).toEqual(['Empieza en T']);
  });

  it('publicación: mismos bordes, tanto publicada como programada', async () => {
    await createPublicationAt({
      title: 'Pub hasta T',
      section: 'BOTH',
      visibleFrom: ms(-DAY),
      visibleUntil: new Date(T),
    });
    await createPublicationAt({
      title: 'Prog desde T',
      section: 'BOTH',
      status: 'SCHEDULED',
      visibleFrom: new Date(T),
    });
    at(ms(-1).toISOString());
    expect(titles((await get('/home')).body.publications)).toEqual(['Pub hasta T']);
    at(T);
    expect(titles((await get('/home')).body.publications)).toEqual(['Prog desde T']);
    expect(titles((await get('/publications')).body.items)).toEqual(['Prog desde T']);
    // a las T la primera pasa al histórico
    expect(titles((await get('/publications?archived=true&year=2026')).body.items)).toEqual([
      'Pub hasta T',
    ]);
  });

  it('llamado destacado: deja de resaltarse cuando llega su fecha de fin', async () => {
    const pub = await createTerm({ publicCurrent: true });
    await createExamCallRow({
      termId: pub.id,
      name: 'Mesa',
      published: true,
      highlighted: true,
      startsOn: ms(-DAY),
      endsOn: new Date(T),
    });
    at(ms(-1).toISOString());
    expect((await get('/students')).body.examCalls[0].highlighted).toBe(true);
    expect((await get('/home')).body.highlightedExamCalls).toHaveLength(1);
    at(T);
    const res = await get('/students');
    expect(res.body.examCalls).toHaveLength(1); // sigue publicado en su ciclo
    expect(res.body.examCalls[0].highlighted).toBe(false);
    expect((await get('/home')).body.highlightedExamCalls).toEqual([]);
  });

  it('medianoche de Buenos Aires: un fin cargado como día incluye todo ese día', async () => {
    at('2026-11-10T12:00:00.000Z'); // reloj fijo ANTES de iniciar sesión: la sesión vence 8 h después de esta hora
    const admin = await loginAs(t.app, 'ADMIN');
    const res = await request(t.app).post('/api/v1/notices').set('Cookie', admin.cookie).send({
      title: 'Hasta el 25/11',
      body: 'x',
      visibleFrom: '2026-11-01',
      visibleUntil: '2026-11-25',
    });
    expect(res.status).toBe(201);
    at('2026-11-26T02:59:59.998Z'); // 23:59:59.998 del 25/11 en Buenos Aires
    expect(titles((await get('/students')).body.notices)).toEqual(['Hasta el 25/11']);
    at('2026-11-26T03:00:00.000Z'); // 00:00 del 26/11
    expect((await get('/students')).body.notices).toEqual([]);
  });
});
