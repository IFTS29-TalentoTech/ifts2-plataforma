/**
 * Módulo `public` — API de SOLO LECTURA del sitio público, sin sesión (docs/specs/04-api.md).
 *
 *   GET /public/home                 inicio: frase ancla, accesos, publicaciones y destacados
 *   GET /public/publications         novedades vigentes (o el histórico del año con ?archived=true)
 *   GET /public/publications/:id     detalle
 *   GET /public/students             ciclo público, horarios, llamados, avisos y enlaces
 *   GET /public/content/:page        secciones de institucional | carrera | ingreso
 *   GET /public/gallery?area=        diapositivas del carrusel de Estudiantes o La carrera (RF09)
 *   GET /public/settings             datos institucionales (cabecera y pie, ADR-022)
 *
 * Garantías:
 * - Nada pausado, sin publicar, programado a futuro ni de otro ciclo sale de acá;
 *   lo vencido solo se muestra al solicitar el histórico
 *   (ver public.service.ts: filtro SQL + verificación con las funciones de @ifts2/shared).
 * - Nunca salen claves de almacenamiento ni datos del panel: los archivos van como URL firmada.
 * - Si el almacenamiento falla, las URL quedan en `null` y la página sigue cargando (RNF03).
 * - Caché HTTP corta con stale-while-revalidate (RNF09, 300-400 usuarios concurrentes en picos):
 *   un CDN o la caché de Next absorbe la carga; el cambio llega al visitante en ~60 s como máximo
 *   (aceptación de RF04: "dentro de 60 segundos").
 */
import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CONTENT_PAGES,
  idParam,
  publicGalleryQuery,
  publicPublicationsQuery,
  publicStudentsQuery,
  type ContentPage,
  type PublicContentDto,
  type PublicGalleryDto,
  type PublicHomeDto,
  type PublicPublicationDetailDto,
  type PublicPublicationsDto,
  type PublicStudentsDto,
} from '@ifts2/shared';
import { z } from 'zod';
import { errors } from '../../infra/errors';
import { sanitizeMarkdown } from '../../lib/markdown';
import { readRawSettings, asBool, toPublicSettingsDto } from '../../lib/settings';
import { valid, validate } from '../../middleware/validate';
import { listPublicGallery } from '../gallery/gallery.service';
import {
  currentYearBA,
  examCallInclude,
  expiredPublicationWhere,
  noticeInclude,
  onlyVisibleExamCalls,
  onlyVisibleSchedules,
  publicationInclude,
  publicationYearWhere,
  scheduleInclude,
  stillVisible,
  stillVisibleNotices,
  termLabel,
  toPublicExamCall,
  toPublicNotice,
  toPublicSchedule,
  toPublicationCard,
  toQuickLink,
  visibleNoticeWhere,
  visiblePublicationWhere,
} from './public.service';

export const mountPath = '/public';
export const router = Router();

/** Contenido que cambia seguido (avisos, llamados, novedades): 30 s en CDN + 30 s de gracia. */
const CACHE_DYNAMIC = 'public, max-age=20, s-maxage=30, stale-while-revalidate=30';
/** Ajustes y textos estancos: cambian poco. */
const CACHE_STATIC = 'public, max-age=30, s-maxage=60, stale-while-revalidate=60';
const cache = (res: Response, value: string) => res.set('Cache-Control', value);

const HOME_PUBLICATIONS = 6;
const HOME_HIGHLIGHTS = 5;

// ---------------------------------------------------------------------------
// GET /public/home
// ---------------------------------------------------------------------------
router.get('/home', async (req, res) => {
  const { prisma, storage } = req.ctx;
  const now = new Date();
  const [settings, links, pubs, notices, term] = await Promise.all([
    readRawSettings(prisma),
    prisma.externalLink.findMany({
      where: { visible: true },
      orderBy: [{ group: 'asc' }, { order: 'asc' }, { title: 'asc' }],
    }),
    prisma.publication.findMany({
      where: {
        AND: [visiblePublicationWhere(now), { section: { in: ['HOME', 'BOTH'] } }],
      },
      include: publicationInclude,
      orderBy: [{ visibleFrom: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: HOME_PUBLICATIONS,
    }),
    prisma.notice.findMany({
      where: { ...visibleNoticeWhere(now), highlighted: true },
      include: noticeInclude,
      orderBy: [{ urgent: 'desc' }, { visibleFrom: 'desc' }],
      take: HOME_HIGHLIGHTS,
    }),
    prisma.academicTerm.findFirst({ where: { publicCurrent: true } }),
  ]);

  const calls = term
    ? await prisma.examCall.findMany({
        where: { termId: term.id, published: true, highlighted: true, endsOn: { gt: now } },
        include: examCallInclude,
        orderBy: { startsOn: 'asc' },
        take: HOME_HIGHLIGHTS,
      })
    : [];

  const body: PublicHomeDto = {
    tagline: settings.tagline ?? null,
    examEnrollmentOpen: asBool(settings.exam_enrollment_open),
    quickLinks: links.map(toQuickLink),
    publications: await Promise.all(
      stillVisible(pubs, now).map((p) => toPublicationCard(storage, p)),
    ),
    highlightedNotices: await Promise.all(
      stillVisibleNotices(notices, now).map((n) => toPublicNotice(storage, n)),
    ),
    highlightedExamCalls: term
      ? await Promise.all(
          onlyVisibleExamCalls(calls, term).map((c) =>
            toPublicExamCall(storage, c, now, asBool(settings.exam_enrollment_open)),
          ),
        )
      : [],
  };
  cache(res, CACHE_DYNAMIC).json(body);
});

// ---------------------------------------------------------------------------
// GET /public/publications?year=&category=&archived=&page=&pageSize=
// ---------------------------------------------------------------------------
router.get('/publications', validate({ query: publicPublicationsQuery }), async (req, res) => {
  const q = valid<z.infer<typeof publicPublicationsQuery>>(req, 'query');
  const { prisma, storage } = req.ctx;
  const now = new Date();

  // Histórico: sin `year` se toma el año en curso (Buenos Aires). Vigentes: sin `year` no se filtra.
  const year = q.year ?? (q.archived ? currentYearBA(now) : undefined);
  const and: Prisma.PublicationWhereInput[] = [
    q.archived
      ? expiredPublicationWhere(now, prisma.publication.fields)
      : visiblePublicationWhere(now),
    { section: { in: ['NEWS', 'BOTH'] } },
  ];
  if (q.category) and.push({ categoryId: q.category });
  if (year) and.push(publicationYearWhere(year));
  const where: Prisma.PublicationWhereInput = { AND: and };

  const [total, rows, categories, years] = await Promise.all([
    prisma.publication.count({ where }),
    prisma.publication.findMany({
      where,
      include: publicationInclude,
      orderBy: [
        { visibleFrom: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.category.findMany({
      where: { kind: 'PUBLICATION' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    // Conserva los años publicados e incluye programadas elegibles, vigentes o vencidas.
    prisma.$queryRaw<{ year: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM (COALESCE("visibleFrom", "createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS year
      FROM "Publication"
      WHERE "section" IN ('NEWS', 'BOTH') AND (
        "status" = 'PUBLISHED' OR (
          "status" = 'SCHEDULED' AND "visibleFrom" <= ${now}
          AND ("visibleUntil" IS NULL OR "visibleFrom" < "visibleUntil")
        )
      )
      ORDER BY year DESC`,
  ]);

  const visibleRows = q.archived ? rows : stillVisible(rows, now);
  const body: PublicPublicationsDto = {
    items: await Promise.all(visibleRows.map((p) => toPublicationCard(storage, p))),
    page: q.page,
    pageSize: q.pageSize,
    total,
    archived: q.archived,
    year: year ?? null,
    categories,
    availableYears: years.map((y) => y.year),
  };
  cache(res, CACHE_DYNAMIC).json(body);
});

// ---------------------------------------------------------------------------
// GET /public/publications/:id  (?archived=true permite abrir una ya vencida del histórico)
// ---------------------------------------------------------------------------
const detailQuery = z.object({
  archived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default('false'),
});
router.get(
  '/publications/:id',
  validate({ params: idParam, query: detailQuery }),
  async (req, res) => {
    const { prisma, storage } = req.ctx;
    const now = new Date();
    const archived = valid<z.infer<typeof detailQuery>>(req, 'query').archived;
    const p = await prisma.publication.findFirst({
      where: {
        id: req.valid.params.id,
        section: { in: ['NEWS', 'HOME', 'BOTH'] },
        ...(archived
          ? expiredPublicationWhere(now, prisma.publication.fields)
          : visiblePublicationWhere(now)),
      },
      include: publicationInclude,
    });
    if (!p || (!archived && stillVisible([p], now).length === 0)) {
      throw errors.notFound('No encontramos la publicación.');
    }
    const body: PublicPublicationDetailDto = {
      ...(await toPublicationCard(storage, p)),
      body: p.body,
      permalink: p.socialPost?.permalink ?? null,
    };
    cache(res, CACHE_DYNAMIC).json(body);
  },
);

// ---------------------------------------------------------------------------
// GET /public/students?audience=
// ---------------------------------------------------------------------------
router.get('/students', validate({ query: publicStudentsQuery }), async (req, res) => {
  const { audience } = valid<z.infer<typeof publicStudentsQuery>>(req, 'query');
  const { prisma, storage } = req.ctx;
  const now = new Date();

  const [term, settings, links, notices] = await Promise.all([
    prisma.academicTerm.findFirst({ where: { publicCurrent: true } }),
    readRawSettings(prisma),
    prisma.externalLink.findMany({
      where: { visible: true },
      orderBy: [{ group: 'asc' }, { order: 'asc' }, { title: 'asc' }],
    }),
    prisma.notice.findMany({
      where: {
        ...visibleNoticeWhere(now),
        // Con `audience` se devuelven los avisos para todos y los de ese destinatario.
        ...(audience && audience !== 'ALL' ? { audience: { in: ['ALL', audience] } } : {}),
      },
      include: noticeInclude,
      // Urgentes primero (regla 2), después los más nuevos.
      orderBy: [{ urgent: 'desc' }, { visibleFrom: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  // Sin ciclo público definido no hay horarios ni llamados que mostrar.
  const [schedules, calls] = term
    ? await Promise.all([
        prisma.schedule.findMany({
          where: { termId: term.id, published: true },
          include: scheduleInclude,
          orderBy: [{ commissionName: 'asc' }, { id: 'asc' }],
        }),
        prisma.examCall.findMany({
          where: { termId: term.id, published: true },
          include: examCallInclude,
          orderBy: [{ startsOn: 'asc' }, { id: 'asc' }],
        }),
      ])
    : [[], []];

  const body: PublicStudentsDto = {
    term: term
      ? { id: term.id, year: term.year, kind: term.kind, label: termLabel(term.year, term.kind) }
      : null,
    examEnrollmentOpen: asBool(settings.exam_enrollment_open),
    schedules: term
      ? await Promise.all(
          onlyVisibleSchedules(schedules, term).map((s) => toPublicSchedule(storage, s)),
        )
      : [],
    examCalls: term
      ? await Promise.all(
          onlyVisibleExamCalls(calls, term).map((c) =>
            toPublicExamCall(storage, c, now, asBool(settings.exam_enrollment_open)),
          ),
        )
      : [],
    notices: await Promise.all(
      stillVisibleNotices(notices, now).map((n) => toPublicNotice(storage, n)),
    ),
    links: links.map(toQuickLink),
  };
  cache(res, CACHE_DYNAMIC).json(body);
});

// ---------------------------------------------------------------------------
// GET /public/content/:page
// ---------------------------------------------------------------------------
router.get('/content/:page', async (req, res) => {
  const page = req.params.page as string;
  if (!(CONTENT_PAGES as readonly string[]).includes(page)) {
    throw errors.notFound('La página no existe.');
  }
  const rows = await req.ctx.prisma.contentSection.findMany({
    where: { page, visible: true },
    orderBy: [{ order: 'asc' }, { slug: 'asc' }],
  });
  const body: PublicContentDto = {
    page: page as ContentPage,
    sections: rows.map((s) => ({
      slug: s.slug,
      title: s.title,
      body: sanitizeMarkdown(s.body), // defensa extra: aunque el dato haya entrado por otro camino
      order: s.order,
    })),
  };
  cache(res, CACHE_STATIC).json(body);
});

// ---------------------------------------------------------------------------
// GET /public/gallery?area=STUDENTS|CAREER — diapositivas del carrusel (RF09, ADR-036)
// ---------------------------------------------------------------------------
router.get('/gallery', validate({ query: publicGalleryQuery }), async (req, res) => {
  const { area } = valid<z.infer<typeof publicGalleryQuery>>(req, 'query');
  const body: PublicGalleryDto = { area, items: await listPublicGallery(req.ctx, area) };
  cache(res, CACHE_STATIC).json(body);
});

// ---------------------------------------------------------------------------
// GET /public/settings
// ---------------------------------------------------------------------------
router.get('/settings', async (req, res) => {
  cache(res, CACHE_STATIC).json(toPublicSettingsDto(await readRawSettings(req.ctx.prisma)));
});
