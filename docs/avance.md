# Avance

Registro de tareas completadas y pendientes, dificultades y soluciones. Un agente agrega una entrada por tarea.

## Completado

### 2026-10-29 · Fundación técnica (agente de fundación)

**Monorepo y herramientas.** pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`), TypeScript estricto, ESLint + Prettier, scripts raíz (`dev`, `build`, `lint`, `typecheck`, `test`, `test:api`, `test:e2e`, `db:*`, `tokens`, `contrast`). `docker-compose.yml` con `ifts2-db` (postgres:17, puerto 5433, bases `ifts2` e `ifts2_test`). `.env.example` completo y `.env` local. CI en `.github/workflows/ci.yml` (lint, tipos, pruebas con PostgreSQL de servicio, build, Cypress), sin secretos.

**`packages/shared`.** Enums, matriz de permisos y `can()`, esquemas zod de todas las entidades con mensajes en español, reglas de vigencia (`isPublicationVisible`, `isNoticeVisible`, `isNoticeExpiringSoon`, `isScheduleVisible`, `isExamCallVisible`) con 37 pruebas de borde (incluye zona horaria Buenos Aires), guía de Instagram para el cliente.

**Base de datos.** Esquema Prisma corregido (Prisma no admitía los enums en una línea) y ampliado (`User.mustChangePassword`, `IntegrationConfig`, índices); migración inicial + migración de `IntegrationConfig`; índice único parcial para un solo ciclo `publicCurrent`. Semilla idempotente `prod` y `demo` (verificada dos veces seguidas y en base vacía).

**API.** `createApp()`, config validada, pino, Problem Details, helmet/CORS/CSRF por Origin/rate limit, sesiones en base, autodescubrimiento de módulos. Módulos completos con pruebas Supertest (79 pruebas en total entre unitarias y API): `auth`, `users`, `audit`, `health`, `integrations` (Instagram y correo configurables desde el panel, cifrados), `files` (URL firmadas del almacenamiento local). Servicios con interfaz y doble: `StorageProvider` (local, memoria, S3), `Mailer` (consola, SMTP, falso), `InstagramClient` (falso, esqueleto Graph), `crypto` AES-256-GCM.

**Web.** Next.js 15 con tokens como variables CSS y tema Tailwind, kit de UI accesible (Button, Badge, Card, Table, campos, **ConfirmDialog único**, Dialog, Toast, Skeleton, EmptyState, ErrorState, Tabs, Pagination), layouts `PublicLayout` y `PanelShell` (drawer móvil, contadores, filtro por permisos), cliente de API, sesión server-side, protección de `/panel/*`, placeholders de todas las rutas, catálogo `/ui-kit`, Cypress (390/1440 + axe).

**Decisiones.** ADR-020 a ADR-023 en `docs/decisiones/` y reflejadas en `docs/specs/02-decisiones-tecnicas.md`; preguntas Q22 a Q29 en `docs/specs/09-preguntas-abiertas.md`.

**Contraste AA (ajustes anotados, ver ADR-021).** `primary` #8D775F con texto blanco da 4,25:1 y sobre `base` 3,93:1 -> botones con `primary-strong` #806C56 (5,00:1) y texto de acento con `accent` #6F5142 (6,62:1); `font` #6E7271 sobre `accent-2`/`success-back` da 3,64/4,10 -> `font-strong` #5F6261; `warning-text` #B77A3A sobre `warning-back` da 3,00 -> `warning-text-strong` #8D5E2D (4,66:1). Tipografía: Plus Jakarta Sans (las capturas no son Inter).

**Evidencias** en `docs/evidencias/` (lint, tipos, tests, build, verificación de producción con login real, Cypress).

## Pendiente (para los siguientes agentes)

- Todas las pantallas del sitio y del panel (hoy placeholders) y los módulos de API restantes: `public` (incluye `GET /public/settings` que consumen la cabecera y el pie), `publications`, `social` (sincronización), `notices`, `schedules`, `exam-calls`, `documents`, `settings`, `content`, `links`, `contact`, `dashboard`.
- `GraphInstagramClient`: **solo esqueleto**. Falta verificarlo contra la API real, la renovación del token (~50 días) y la sincronización idempotente por `externalId` (ADR-09, prueba de concepto).
- `S3Storage` implementado pero **no probado contra un servicio real** (sin credenciales).
- Pantalla de Configuración que consuma `/integrations/*` (estados, guía, conectar, probar, desconectar) y muestre el aviso de modo demostración.
- Login real del panel (hoy placeholder; la API ya funciona).
- Lighthouse CI, k6 y despliegue (`deploy.yml`, `lighthouse.yml`) quedan para las fases de endurecimiento.
- Validar con el cliente: nombres Ingreso/Inscripciones, tipografía, contrastes, hashtag.

## Dificultades y soluciones

- **Prisma rechazó el schema de la spec**: enums en una sola línea. Se pasaron a varias líneas.
- **pnpm 11 bloquea scripts de instalación**: se aprobaron en `pnpm-workspace.yaml` (`allowBuilds`).
- **Cypress no arrancaba** (`bad option: --smoke-test`): el entorno define `ELECTRON_RUN_AS_NODE=1`; se ejecuta con la variable sin definir.
- **Puerto 3000 ocupado por otro programa del equipo**: no se tocó; la web de verificación corrió en 3100 (`PORT`) y se documentó.
- **El foco no volvía al botón que abrió un diálogo controlado**: Radix solo lo hace con `Trigger`; se agregó `useRestoreFocus` (verificado con Cypress).
- **Variables CSS no admiten opacidad de Tailwind** (`bg-x/50`): se evita y se documentó.
- **El menú móvil cerraba con un `setState` en un efecto** (regla de lint de React): se resolvió guardando la ruta en la que se abrió.
- **`/ui-kit` quedaba prerenderizado y siempre devolvía 404 en producción**: se hizo dinámico (`ENABLE_UI_KIT`).

### 2026-10-29 · API de redes y publicaciones (agente `feat/social`)

**Qué se hizo.** Módulos `categories`, `publications`, `social` y `dashboard` en `apps/api/src/modules/` (cada uno con su `README.md`) y el `GraphInstagramClient` completo: `/me/media` con paginación y filtro por hashtag, `testConnection`, canje de código OAuth (token corto -> larga duración), **renovación del token a los ~50 días** (`refreshLongLivedToken`, `modules/social/token.service.ts`). Sincronización idempotente por `externalId`, moderación (aprobar con copia de la imagen al almacenamiento propio, descartar, restaurar, eliminar descartadas), carga manual, `POST /social/cron` con `CRON_SECRET` y planificador interno opcional (`SOCIAL_SCHEDULER_ENABLED`). Publicaciones con estados, vigencia calculada al consultar, portada subida por archivo y eliminación manual con reglas. Resumen (`GET /dashboard`). Contrato en `docs/specs/04-api.md`; decisiones en `docs/decisiones/ADR-030-social-sincronizacion.md`.

**Verificación.** `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde (215 pruebas de API + 37 de shared; salida en `docs/evidencias/2026-10-29-social-*.txt`). No hay credenciales de Meta: el cliente se probó contra un **servidor HTTP simulado** (`test/helpers/instagram-mock.ts`) con paginación, errores 190/429/500, fallas de red, canje y renovación.

**Decisiones.**

- `AppContext.fetch` (inyectable) para toda llamada saliente; `createInstagramClient` y el callback OAuth lo usan. Cambio aditivo en `context.ts`/`app.ts`.
- `Publication.coverUrl` guarda una dirección `http(s)` o una **clave del almacenamiento** (no URL firmada, que vence). Quien sirva contenido público debe resolverla con `lib/cover.ts` (`resolveCoverSrc`).
- Eliminar una publicación de Instagram devuelve la publicación de redes a _pendiente_ (en lugar de dejar el vínculo roto) y borra la imagen copiada.
- `reactivate` exige nueva fecha de fin solo cuando la publicación está vencida; una pausada con vigencia abierta se reactiva sin fechas.
- La descarga de imágenes rechaza direcciones internas (SSRF) porque la carga manual acepta una URL escrita por un usuario; no se resuelve DNS (limitación documentada en `infra/media-download.ts`).
- Para videos se importa la miniatura (`thumbnail_url`) como imagen.
- `InstagramToken` (fila única) guarda solo vencimiento y estado de sincronización; el token en claro vive cifrado en `IntegrationConfig` (ADR-020) y `tokenEnc` queda vacío a propósito.

**Dificultades.** Los hosts de las imágenes de demostración (`example.invalid`) no se pueden descargar: el flujo de aprobación usa una imagen neutra generada para esas direcciones. Un `paging.next` de otro dominio podría filtrar el token: solo se siguen URLs de `graph.instagram.com`.

**Pendiente / preguntas abiertas.**

- **Prueba de concepto con la API real** de Instagram (cuenta profesional + app de Meta del cliente): los formatos siguen la documentación pero no se verificaron en vivo.
- `ingresoCycle` del Resumen es **derivado** (año del ciclo vigente + 1): falta definir con el cliente de dónde sale el dato de inscripción al ingreso.
- `examCallNext` considera cualquier ciclo y llamados no publicados (el panel es interno); confirmar si debe limitarse al ciclo público.
- Mensajes de `text()` en shared salen con género masculino ("La leyenda es obligatorio."): conviene un parámetro de género en el helper (cambio en `schemas.ts`, no tocado para no pisar a otros agentes).
- Planificador interno sin prueba automatizada (se probó la tarea que ejecuta, `runSocialJob`, vía `POST /social/cron`).
