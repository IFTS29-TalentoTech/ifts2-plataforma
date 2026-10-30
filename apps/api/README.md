# apps/api — API REST (Express 5 + TypeScript + Prisma)

Base `/api/v1`. Errores en Problem Details (`application/problem+json`): `{ type, title, status, code, detail, errors? }`. Contrato completo: `docs/specs/04-api.md`.

## Arranque

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed      # base, migraciones, semilla demo
pnpm --filter @ifts2/api dev                        # http://localhost:4000  (GET /health)
pnpm test:api                                       # pruebas Vitest + Supertest (base ifts2_test)
```

Usuarios de la semilla demo (clave `Demo-2026-ifts2`): `bedelia@ifts2.local`, `editor@ifts2.local`; el administrador usa `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (por defecto `admin@ifts2.local` / `Cambiame-123!`).

## Estructura

```
src/
  app.ts            createApp(opts) (async) + buildContext: middlewares globales y montaje de módulos
  server.ts         arranque, validación de configuración, cierre ordenado
  config.ts         variables de entorno validadas con zod (falla con mensaje claro)
  context.ts        AppContext (req.ctx): prisma, storage, integrations, getMailer(), getInstagramClient(), limiters
  routes.ts         AUTODESCUBRIMIENTO de módulos
  middleware/       auth (attachAuth, requireAuth, requireRole, requirePermission), validate, origin (CSRF),
                    rate-limit, error-handler, upload (multer)
  infra/            prisma, logger (pino), crypto (AES-256-GCM), errors (AppError/errors.*),
                    storage/ (local, memory, s3 + upload.ts), mailer/, instagram/, integration-store.ts
  lib/              password (argon2id), pagination
  modules/<nombre>/ health, auth, users, audit, integrations, files, categories, publications, social, dashboard,
                    notices, terms, schedules, exam-calls, documents, settings, content, links, contact, public
                    (+ los que agreguen los demás; cada uno tiene su README)
test/               unit/ y api/ (Supertest), helpers/
```

## Agregar un módulo (sin editar archivos compartidos)

Crear `src/modules/<nombre>/index.ts` que exporte `mountPath` y `router`. Se monta solo bajo `/api/v1<mountPath>`.

```ts
// src/modules/notices/index.ts
import { Router } from 'express';
import { noticeCreateInput, noticeListQuery, idParam, type NoticeCreateInput } from '@ifts2/shared';
import { errors } from '../../infra/errors';
import { requirePermission } from '../../middleware/auth';
import { validate, valid } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { pageArgs, toPage } from '../../lib/pagination';

export const mountPath = '/notices';
export const router = Router();

router.get(
  '/',
  requirePermission('notices:manage'),
  validate({ query: noticeListQuery }),
  async (req, res) => {
    const q = valid<{ page: number; pageSize: number }>(req, 'query');
    const where = {};
    const [total, items] = await Promise.all([
      req.ctx.prisma.notice.count({ where }),
      req.ctx.prisma.notice.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    ]);
    res.json(toPage(items, total, q));
  },
);

router.post(
  '/',
  requirePermission('notices:manage'),
  validate({ body: noticeCreateInput }),
  async (req, res) => {
    const body = valid<NoticeCreateInput>(req, 'body');
    const notice = await req.ctx.prisma.$transaction(async (tx) => {
      const n = await tx.notice.create({ data: { ...body, authorId: req.auth!.user.id } });
      await audit.fromReq(req, { action: 'notice.create', entity: 'Notice', entityId: n.id }, tx); // toda mutación audita
      return n;
    });
    res.status(201).json(notice);
  },
);
```

Reglas del módulo:

- Permisos: `requirePermission('<acción>')` (matriz en `packages/shared/src/permissions.ts`) o `requireRole(...)`. Sin sesión 401; sin permiso 403.
- Entrada: siempre `validate({ body, query, params })` con esquemas de `@ifts2/shared`; leer con `valid<T>(req, 'body')`. Agregá esquemas nuevos a `packages/shared/src/schemas.ts` en un bloque propio (mensajes en español).
- Errores: `throw errors.notFound(...)`, `errors.conflict(msg, { campo: [msg] })`, `errors.unprocessable(...)`, etc. (formato Problem Details y códigos de 04-api.md).
- Servicios externos: usar `req.ctx.storage`, `await req.ctx.getMailer()`, `await req.ctx.getInstagramClient()`; **nunca** importar implementaciones concretas ni singletons.
- Archivos: `uploadSingle()` + `storeUpload(req.ctx.storage, { buffer, originalName })` (tipo por firma, límites, WebP 1600 px, clave aleatoria).
- Auditoría: `audit.fromReq(req, { action, entity, entityId, detail }, tx)`; `detail` sin datos personales.
- Vigencia: usar `isNoticeVisible` & co. de `@ifts2/shared` (se calcula al consultar; nada se borra solo).
- Listados: `?page&pageSize` -> `toPage(items, total, q)`.
- Dentro de un módulo se puede importar `../audit/audit.service`; evitar otras dependencias entre módulos.

## Configuración e integraciones

`.env.example` documenta todo. Cambiar de proveedor = cambiar variables / configuración del panel, nada de código (ADR-020).

| Servicio       | Selección                                                             | Notas                                                                                                                                     |
| -------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Almacenamiento | `STORAGE_PROVIDER=local\|memory\|s3`                                  | `s3` exige `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (y `S3_ENDPOINT` para Supabase/R2/MinIO); si faltan, la API no arranca |
| Correo         | Panel (`/integrations/mail`) -> `MAILER_PROVIDER=console\|smtp`       | consola = modo demostración                                                                                                               |
| Instagram      | Panel (`/integrations/instagram`) -> `INSTAGRAM_PROVIDER=fake\|graph` | `GraphInstagramClient` es un esqueleto (otro agente lo completa)                                                                          |

Tareas de redes: `CRON_SECRET` (cron externo -> `POST /social/cron`) y `SOCIAL_SCHEDULER_ENABLED` / `SOCIAL_SYNC_INTERVAL_HOURS` (planificador interno opcional). Las llamadas HTTP salientes usan `req.ctx.fetch` (inyectable en pruebas: `createTestApp({ fetch })`).

`GET /health` -> `{ status, api, db, integrations: { storage, mailer, instagram }, demoMode }` (sin secretos).

## Escribir pruebas de API

```ts
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb } from '../helpers/db';
import { createNotice } from '../helpers/factories';

let t: TestApp;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
}); // base limpia + app con dobles

it('401 sin sesión, 403 sin permiso, 201 feliz', async () => {
  expect((await request(t.app).get('/api/v1/notices')).status).toBe(401);
  const { cookie } = await loginAs(t.app, 'EDITOR');
  expect((await request(t.app).get('/api/v1/notices').set('Cookie', cookie)).status).toBe(403);
  const bedelia = await loginAs(t.app, 'BEDELIA');
  const res = await request(t.app)
    .post('/api/v1/notices')
    .set('Cookie', bedelia.cookie)
    .send({ title: 'Aviso', body: 'Texto' });
  expect(res.status).toBe(201);
});
```

Helpers (`test/helpers/`): `createTestApp()` (devuelve `{ app, ctx, mailer: FakeMailer, storage: InMemoryStorage, instagram: FakeInstagramClient }`; opción `useRealIntegrationResolution`), `resetDb()`, `testPrisma`, `loginAs(app, role)` -> `{ cookie, user }`, `loginWith`, factories (`createUser`, `createCategory`, `createTerm`, `createNotice`, `createPublication`; más en `social-factories.ts`: `createSocialPostRow`, `createPublicationRow`, `setSetting`...) y `InstagramMock` (`instagram-mock.ts`: servidor HTTP que simula la API de Instagram y la CDN de imágenes). Las pruebas corren en serie sobre `ifts2_test` (las migraciones se aplican solas en `global-setup`).
Helpers (`test/helpers/`): `createTestApp()` (devuelve `{ app, ctx, mailer: FakeMailer, storage: InMemoryStorage, instagram: FakeInstagramClient }`; opción `useRealIntegrationResolution`), `resetDb()`, `testPrisma`, `loginAs(app, role)` -> `{ cookie, user }`, `loginWith`, factories (`createUser`, `createCategory`, `createTerm`, `createNotice`, `createPublication`) y las del bloque académico en `academic-factories.ts` (`createDocumentRow`, `createScheduleRow`, `createExamCallRow`, `createLinkRow`, `createSectionRow`, `createPublicationAt`, `PDF_BYTES`, `ago()`/`fromNow()`). Para probar bordes de vigencia: `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(...)` (iniciá sesión DESPUÉS de fijar el reloj o la sesión vencerá). Las pruebas corren en serie sobre `ifts2_test` (las migraciones se aplican solas en `global-setup`).
