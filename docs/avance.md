# Avance

Registro de tareas completadas y pendientes, dificultades y soluciones. Un agente agrega una entrada por tarea. **Orden cronológico (lo más viejo arriba)**, reconstruido con `git log`; lo vigente y lo pendiente están al final, en "Estado actual" y "Pendiente".

## Completado

### 2026-11-07 · Tarjeta "Ingreso" del Resumen con datos verificables (A14)

**Hecho.** Rama `fix/indicador-ingreso` desde `develop` (`f0c236f`). `GET /dashboard` agrega
`ingresoContent` (secciones visibles de Ingreso y si les quedan datos `[a confirmar ...]`). La
tarjeta muestra "Sin publicar", "A confirmar" o "Publicada" y presenta el año como estimado. Ya no
afirma una "ficha de preinscripción activa". Nuevo `hasPendingConfirmation` en `@ifts2/shared`.

**Pruebas.** 1 caso de integración nuevo y 1 ajustado, unitarias de shared y 4 E2E (390 y 1440 px,
axe). Resultados en `docs/evidencias/2026-11-07-indicador-ingreso-a14.md`; decisión en ADR-034.

**Pendiente.** Q133: definir si el año de ingreso seguirá siendo una estimación.
### 2026-11-07 · Inscripciones: enlace de alumnos y estado efectivo (A07, A08)

**Hecho.** Rama `fix/inscripciones-siu-y-estado` desde `develop` (`f0c236f`). **A07:** los enlaces
tienen la marca `enrollment` ("Enlace de inscripción de alumnos" en el panel; migración
`20261107030216_enlace_inscripcion`). `/inscripciones` muestra solo esos enlaces. Ya no busca "SIU"
en el título ni ofrece todos los enlaces; si no hay ninguno, avisa que está pendiente y muestra el
correo de Bedelía. **A08:** `effectiveExamEnrollmentOpen` (`@ifts2/shared`) combina el interruptor
general, la casilla del llamado y `now < endsOn`. La API lo entrega en `/public/home` y
`/public/students`, así que la insignia general y las tarjetas ya no se contradicen.

**Pruebas.** 2 unitarias de shared, 4 de integración nuevas y 2 ajustadas, y un caso E2E a 390 y
1440 px. Resultados en `docs/evidencias/2026-11-07-inscripciones-a07-a08.md`; decisión en ADR-033.

**Pendiente / dificultades.** Q131 (¿el interruptor general es un bloqueo?) y Q132 (enlace oficial
de alumnos) para confirmar con el instituto. En instalaciones existentes hay que marcar el enlace
de alumnos a mano. `pnpm test` de la API falla por configuración de Vitest (problema anterior;
ver la evidencia).

### 2026-11-06 · Compatibilidad de portadas externas (A06)

**Hecho.** Rama `fix/portadas-externas` creada desde `develop` actualizado, con A05
(`4d2863b3e278014768efc94d6d0d5fcde0f57e38`) verificado. `Cover` optimiza solo rutas
propias y URLs de la API sin parámetros; las externas y firmadas se cargan directamente.
`remotePatterns` permanece limitado a la API y rechaza parámetros. Un componente cliente
localizado muestra un fallback accesible si la imagen falla. No cambian A01, A05, los
contratos públicos, el almacenamiento ni la limpieza de archivos A10.

**Pruebas.** Seis casos nuevos de API, quince de política/atributos de imagen y veinte de
Cypress contra la web compilada, con API e imágenes simuladas a 390 y 1440 px. Se verifican
inicio, novedades, detalle, prioridad, carga diferida, dimensiones, accesibilidad, errores
404/403 y el rechazo del optimizador. La suite se agrega a GitHub Actions. Resultados y
limitaciones en `docs/evidencias/2026-11-06-portadas-externas-a06.md`; decisión en ADR-032.

### 2026-11-06 · Histórico de publicaciones programadas (A05)

**Hecho.** El filtro SQL compartido por el listado histórico, su total y el detalle archivado admite `SCHEDULED` con una ventana no vacía ya terminada. Los años disponibles incorporan las programadas elegibles, sin adelantar las futuras. Se preservan `PUBLISHED`, Instagram, los estados y la portada; no hay migraciones ni cambios visuales o de contratos.

**Pruebas.** Cinco casos de integración nuevos con reloj controlado: matriz de estados y ventanas, ambos límites para publicaciones manuales y programadas, Instagram y filtros/años/paginación en Buenos Aires. Se reprodujo el fallo antes de corregirlo. PostgreSQL 17 aislado, con base descartable marcada y verificada mediante A04; ninguna operación sobre bases de desarrollo o producción. Resultados y comandos en `docs/evidencias/2026-11-06-historico-publicaciones-a05.md`.

**Monorepo y herramientas.** pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`), TypeScript estricto, ESLint + Prettier, scripts raíz (`dev`, `build`, `lint`, `typecheck`, `test`, `test:api`, `test:e2e`, `db:*`, `tokens`, `contrast`). `docker-compose.yml` con `ifts2-db` (postgres:17, puerto 5433, bases `ifts2` e `ifts2_test`). `.env.example` completo y `.env` local. CI en `.github/workflows/ci.yml` (lint, tipos, pruebas con PostgreSQL de servicio, build, Cypress), sin secretos.

**`packages/shared`.** Enums, matriz de permisos y `can()`, esquemas zod de todas las entidades con mensajes en español, reglas de vigencia (`isPublicationVisible`, `isNoticeVisible`, `isNoticeExpiringSoon`, `isScheduleVisible`, `isExamCallVisible`) con 37 pruebas de borde (incluye zona horaria Buenos Aires), guía de Instagram para el cliente.

**Base de datos.** Esquema Prisma corregido (Prisma no admitía los enums en una línea) y ampliado (`User.mustChangePassword`, `IntegrationConfig`, índices); migración inicial + migración de `IntegrationConfig`; índice único parcial para un solo ciclo `publicCurrent`. Semilla idempotente `prod` y `demo` (verificada dos veces seguidas y en base vacía).

**API.** `createApp()`, config validada, pino, Problem Details, helmet/CORS/CSRF por Origin/rate limit, sesiones en base, autodescubrimiento de módulos. Módulos completos con pruebas Supertest (79 pruebas en total entre unitarias y API): `auth`, `users`, `audit`, `health`, `integrations` (Instagram y correo configurables desde el panel, cifrados), `files` (URL firmadas del almacenamiento local). Servicios con interfaz y doble: `StorageProvider` (local, memoria, S3), `Mailer` (consola, SMTP, falso), `InstagramClient` (falso, esqueleto Graph), `crypto` AES-256-GCM.

**Web.** Next.js 15 con tokens como variables CSS y tema Tailwind, kit de UI accesible (Button, Badge, Card, Table, campos, **ConfirmDialog único**, Dialog, Toast, Skeleton, EmptyState, ErrorState, Tabs, Pagination), layouts `PublicLayout` y `PanelShell` (drawer móvil, contadores, filtro por permisos), cliente de API, sesión server-side, protección de `/panel/*`, placeholders de todas las rutas, catálogo `/ui-kit`, Cypress (390/1440 + axe).

**Decisiones.** ADR-020 a ADR-023 en `docs/decisiones/` y reflejadas en `docs/specs/02-decisiones-tecnicas.md`; preguntas Q22 a Q29 en `docs/specs/09-preguntas-abiertas.md`.

**Contraste AA (ajustes anotados, ver ADR-021).** `primary` #8D775F con texto blanco da 4,25:1 y sobre `base` 3,93:1 -> botones con `primary-strong` #806C56 (5,00:1) y texto de acento con `accent` #6F5142 (6,62:1); `font` #6E7271 sobre `accent-2`/`success-back` da 3,64/4,10 -> `font-strong` #5F6261; `warning-text` #B77A3A sobre `warning-back` da 3,00 -> `warning-text-strong` #8D5E2D (4,66:1). Tipografía: Plus Jakarta Sans (las capturas no son Inter).

**Evidencias** en `docs/evidencias/` (lint, tipos, tests, build, verificación de producción con login real, Cypress).

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

### 2026-10-29 · Bloque académico de la API (agente académico, rama `feat/academic`)

**Qué se hizo.** Diez módulos de API bajo `apps/api/src/modules/`, cada uno con su `README.md`: `notices`, `terms`, `schedules`, `exam-calls`, `documents`, `settings`, `content`, `links`, `contact` y `public` (solo lectura, sin sesión). Contrato de respuestas tipado en `packages/shared/src/academic.ts` (una línea nueva en `index.ts`); no se tocó `prisma/schema.prisma`. Utilidades en `src/lib/` (`documents`, `settings`, `markdown`). Documentación al día: `docs/specs/04-api.md` (sección "Bloque académico"), `docs/specs/09-preguntas-abiertas.md` (Q40 a Q47), `docs/ARQUITECTURA.md` y `apps/api/README.md`.

**Verificación.** `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde: 37 pruebas en `shared` y 204 en `api` (125 nuevas: avisos, ciclos, horarios, llamados, documentos con subida real, ajustes, contenido, enlaces, contacto, `/public/*` con reloj fijo en los bordes de vigencia, lógica pura de `public-current` y sanitización de Markdown). Salidas en `docs/evidencias/2026-10-29-academic-*.txt`.

**Decisiones.**

- `EXPIRED` de un aviso nunca se guarda: `viewStatus` se calcula (PAUSED gana sobre EXPIRED). Reactivar un vencido exige una nueva fecha de fin.
- `public` aplica la vigencia en dos capas: filtro SQL y verificación con las funciones de `@ifts2/shared`. Caché HTTP corta con `stale-while-revalidate`; archivos con URL firmada de 30 minutos (más larga que la caché) y `downloadUrl: null` si el almacenamiento falla.
- Un único ciclo público: índice parcial de la migración + transacción (apaga el anterior y enciende el nuevo) + función pura `planPublicTermChange` con pruebas unitarias.
- Borrado de documentos: se bloquea ante cualquier referencia (la clave foránea es `SET NULL`). Archivar con `force` deja el adjunto enlazado.
- Contacto: honeypot + 5 envíos por hora por IP; el mensaje se guarda siempre antes de intentar el correo.
- El módulo `contact` se monta en la raíz de la API (`mountPath: '/'`) porque expone `/public/contact` y `/contact-messages`.

**Dificultades.** `Document` no tiene relación inversa con "visible": se calculó con las funciones de vigencia en `findReferences`. Las sesiones de las pruebas con reloj falso vencen: hay que iniciar sesión después de fijar la hora. La heredoc de Git Bash falló con ciertos caracteres, por eso algunos archivos se escribieron con la herramienta de archivos.

**Pendiente / para el equipo.** Renderizador de Markdown en la web (la API entrega Markdown ya sanitizado). Revisar la matriz `PERMISSIONS` (`contact:delete` para BEDELIA, Q41). Prueba de carga k6 de `/public/*` (RNF09) y, si hace falta, una caché en memoria por proceso. Pantallas web que consuman los DTO.

### 2026-10-30 · Panel parte A: login, Resumen, Publicaciones, Avisos y Mensajes (agente web, rama `feat/web-panel-a`)

**Qué se hizo.** Pantallas del panel en `apps/web/src/features/panel-a/` (README propio con pantallas, endpoints, permisos y cómo probar): login con límite de intentos, "¿Olvidaste tu clave?" y cambio obligatorio de contraseña; Resumen (US-12) con estado de Instagram, modo demostración, tarjetas y bloques por rol; Publicaciones (moderación con consentimiento, descartar/restaurar, carga manual, publicaciones propias con publicar/pausar/programar/reactivar/eliminar); Avisos (filtros con conteos, adjunto, pausar/reanudar/reactivar/eliminar, validación en línea); Mensajes de contacto. Toda confirmación usa `ConfirmDialog`. Ítem "Mensajes" en `PANEL_NAV` y cierre de sesión en el menú móvil.

**Verificación.** `pnpm lint`, `pnpm typecheck`, `pnpm build` y Cypress (`e2e/panel-a/*`, `smoke`, `ui-kit`) en verde en 390 y 1440 px, con axe sin violaciones serias; salidas en `docs/evidencias/2026-10-30-panel-a-*.txt`. Capturas para el Manual de Usuario en `docs/capturas/panel/` (46 imágenes, generadas con `capturas.cy.ts`).

**Decisiones.** Q80 a Q87 en `docs/specs/09-preguntas-abiertas.md` ("Revisar" a 30 días, filtro Origen en el navegador, conteos de Avisos sobre `status=ALL`, Mensajes sin diseño, "Prioridad visual" omitida, reactivar un aviso vencido pide fecha). Los fallos de login y el bloqueo 429 se simulan en Cypress para no bloquear la IP de la suite.

**Dificultades.** (1) `next.config.ts` no aplicaba el `.env` raíz (la segunda llamada a `loadEnvConfig` devolvía lo cacheado): el proxy iba a `localhost:4000`; se arregló con `forceReload`. (2) Cypress 16 eliminó `Cypress.env`: los usuarios de prueba van fijos en `cypress/support/panel-a.ts`. (3) En desarrollo la pantalla se hidrata tarde y el primer clic se perdía: las pruebas esperan a que cargue la lista. (4) La API no permite crear avisos ya vencidos: la prueba los vence en la base con una tarea de Node. (5) Las capturas salían recortadas: se agranda la ventana de Electron en `before:browser:launch`.

**Pendiente.** Pantalla de Configuración y Horarios/Archivo (panel B). Filtro `?source=` en `/social/posts` y conteos por estado en `/notices` si se quiere paginar en el servidor.

### 2026-10-30 · Sitio público (agente web público, rama `feat/web-public`)

**Qué se hizo.** Páginas `/`, `/institucional` (con formulario de contacto), `/la-carrera`, `/estudiantes`, `/ingreso`, `/inscripciones`, `/novedades` y `/novedades/[id]` con datos de `/public/*`, ISR de 60 s y degradación sin romperse si la API falla. Código en `apps/web/src/features/public/` (README con mapa páginas -> endpoints -> componentes). Specs Cypress en `apps/web/cypress/e2e/public/` (recorrido 390/1440 con axe, Estudiantes/Inscripciones/Ingreso, Novedades, Contacto E2E-14, degradación, capturas). Capturas en `docs/capturas/publico/` (15). Lighthouse móvil en `docs/evidencias/2026-10-30-web-public-lighthouse.md` (Inicio: rendimiento 93, accesibilidad 100).

**Decisiones.** Contacto dentro de Institucional; Ingreso (aspirantes: convocatoria y pasos desde la sección `ingreso`) separado de Inscripciones (alumnos: llamados con `enrollmentOpen` y enlace a SIU); renderizador Markdown propio que escapa HTML; hero con `primary-strong` por contraste AA; filtros de Novedades como formulario GET que funciona sin JavaScript. Preguntas Q60 a Q65.

**Dificultades.** (1) `next.config.ts` nunca leía el `.env` de la raíz (Next ya había cacheado el entorno): con puertos propios la web llamaba a la API en 4000; se corrigió con `forceReload`. (2) `text-base` es a la vez tamaño y color en este tema: botones `size="lg"` y textos quedaban casi invisibles; se evitó y se documentó. (3) Next exige `revalidate` como literal. (4) La 404 del detalle devuelve 404 real en producción. (5) Dos servidores no pueden compartir `.next`.

**Pendiente.** Fotos, galería, plan por año y documentos públicos de ingreso (Q61 a Q63); prueba de carga k6 del sitio; barra inferior móvil del Figma (Q65).

### 2026-10-30 · Panel parte B: Horarios, Archivo y Configuración (rama `feat/web-panel-b`)

**Hecho.** `/panel/horarios` (ciclo público, cambio con confirmación, alta de ciclos, grillas por comisión y llamados: crear, editar, publicar, eliminar no publicados), `/panel/archivo` (búsqueda, filtros, tabla y tarjetas móviles, detalle con referencias, restaurar, archivar con `force`, eliminar, subida con metadatos), `/panel/configuracion` (ajustes globales con confirmación, usuarios y roles con clave temporal única, contenido en Markdown con vista previa, enlaces) e Integraciones (Instagram con guía, redirectUri copiable, secreto enmascarado, conectar OAuth, token manual, probar, desconectar; correo con SMTP y prueba). Código y mapa en `apps/web/src/features/panel-b/README.md`.

**Pruebas.** Cypress `apps/web/cypress/e2e/panel-b/` (E2E-08, 09, 10, 11 parcial, 12, 13, 15, integraciones y axe), 390 y 1440 px, todo en verde. Capturas del manual en `docs/capturas/panel/b-*.png`.

**Dificultades.** El lint exige no hacer `setState` en efectos (se usa `useResetOn`); `text-base` de Tailwind choca con el color `base` del tema (usar `text-lg`/`text-[1rem]`); Q105 y Q106 de `09-preguntas-abiertas.md`.

**Pendiente.** Remitente SMTP (Q100); probar OAuth de Instagram contra Meta real.

### 2026-10-30 · Integración y calidad (agente de integración)

**Verificado sobre `main` integrado.** `pnpm lint`, `pnpm typecheck`, `pnpm test` (43 de shared + 350 de API), `pnpm build`, y `pnpm e2e --build` (toda la suite Cypress a 390 y 1440 px, incluida la web degradada). Salidas en `docs/evidencias/2026-10-30-integracion-*.txt`. Flujos H1 a H8 y seguridad de punta a punta con `pnpm verify` (`2026-10-30-flujos-y-seguridad.md`). Carga con `pnpm load` (`2026-10-30-carga-publico.md`) y Lighthouse móvil con `pnpm lighthouse` (`2026-10-30-lighthouse-movil.md`).

**Bugs de integración corregidos.**

- `text-base` es a la vez tamaño y color en el tema: el tamaño pisaba a `text-sm` y `Button size="lg"` quedaba casi blanco. Se quitó el tamaño `base` de Tailwind (queda `text-md`) y `pnpm lint` falla si se usa como tamaño.
- `contact:delete` salía en la matriz de BEDELIA (Q41): ahora es solo de ADMIN; la API usa `requirePermission`.
- Mensajes de validación sin concordancia ("La leyenda es obligatorio."): `text()`, `email()`, `url()`, `uuid()` y `dateTime()` deducen género y número del artículo o aceptan `gender`.
- `/panel/avisos` pedía 100 avisos y contaba en el navegador (Q82): `GET /notices` devuelve `counts` y pagina en el servidor. `GET /social/posts?source=` filtra por origen (Q81).
- Cypress no era determinista: un 400 real de login (validación) y un 401 real contaban para el límite por IP y bloqueaban specs posteriores (429). La validación se simula y `pnpm e2e` levanta la API con `LOGIN_MAX_ATTEMPTS=1000`. La web degradada reutilizaba las páginas prerenderizadas con datos: ahora se compila con la API caída (`.next-degraded`).
- El sitio público tardaba hasta 60 s en reflejar un cambio del panel: revalidación bajo demanda (`REVALIDATE_SECRET`, `POST /api/revalidate`).
- La web no enviaba cabeceras de seguridad (hallado por `pnpm verify`): se agregaron en `next.config.ts`.
- `/novedades` se renderizaba por pedido (~40 pedidos/s): sin filtros es estática con ISR; con filtros se reescribe a `/novedades/lista`.

**Contenido real (Q61).** La semilla (prod y demo) carga el plan de estudios por área con horas y las 13 correlatividades de la Res. MEGC 1202/07 (`prisma/seed-plan.ts`) y el requisito "secundario completo". Pendientes con el cliente: ubicación por año (Q120), nombres de la resolución (Q121), fechas y documentación de ingreso (Q122).

**Pendiente.** Probar Instagram y SMTP reales; el techo de un solo proceso web ronda 300-360 pedidos/s en saturación (se resuelve con CDN o más procesos); `pnpm e2e --reset` borra la base de desarrollo y debe correrlo una persona (Prisma bloquea el reset a agentes).

### 2026-10-30 · Entrega de la cátedra: documentación y empaquetado

**Hecho.** `docs/entrega/`: Manual Técnico (con DER por áreas y tablas/campos derivados de `prisma/schema.prisma` por `pnpm docs:der`), Manual de Usuario (flujos con capturas, guía de Instagram para el cliente, mensajes frecuentes), Evidencias de pruebas y CRUD (3 unitarias + 2 de integración con salida real) y el PDF único `IFTS2-Etapa-3-Documentacion.pdf` (`pnpm docs:pdf`, 85 páginas). `pnpm package` genera el zip desde `HEAD` (sin `node_modules`, `.env` ni secretos). Pruebas nuevas: `apps/api/test/api/integracion-catedra.test.ts` (INT-1 e INT-2) y los specs Cypress `panel-a/capturas-crud.cy.ts` (CRUD de avisos, publicaciones, documentos y usuarios con la interfaz real) y `public/capturas-contacto.cy.ts`.

**Corrida de entrega.** `pnpm test`: 43 + 352 pruebas; Cypress: 190 en 19 archivos; `pnpm verify`: 33/33; lint y tipos sin errores (salidas `docs/evidencias/2026-10-30-entrega-*`). Instalación en limpio desde el zip: `docs/evidencias/2026-10-30-instalacion-en-limpio.md`.

**Dificultades.** Mermaid: dos diagramas compartían id y se pisaban (ahora se dibujan de a uno) y un `;` en un mensaje rompía el diagrama de secuencia; `pdftotext` devuelve Latin-1 por defecto (hace falta `-enc UTF-8` para numerar el índice); Cypress borra `cypress/screenshots` (versionado) al correr: restaurar con `git checkout`; `pnpm db:up` choca si ya existe un contenedor `ifts2-db`.

**Pendiente.** Enlaces del repositorio y de la aplicación desplegada (`[completar]`); Instagram, SMTP y S3 reales; despliegue; k6 (se usó autocannon); datos de ingreso y ubicación de materias por año (cliente).

### 2026-11-04 · Ajuste de la CI

**Hecho.** `ci.yml` actualizado para la versión vigente de Node de las acciones (commit `3caabf7`). Sin cambios de código de la aplicación.

### 2026-11-06 · Especificaciones actualizadas (commit `595efb7`)

**Hecho.** Se incorporaron a `docs/specs/` los cambios acordados con el cliente: roles configurables y Superadministrador (RF11, ADR-18 ampliada, E2E-18 a E2E-20, Q123 a Q125), historias H9 y US-36, y `docs/specs/prisma/schema.prisma`.

### 2026-11-06 · Protección de las bases de pruebas (A04, PR #1)

**Hecho.** Antes de migrar o limpiar, las pruebas de integración validan que el destino sea una base descartable (nombre y marca), de modo que un `DATABASE_URL` mal apuntado no borre datos de desarrollo o producción. Se separaron las pruebas unitarias de las de integración (`apps/api/vitest.config.ts`) y se agregó `docker/init-test-db.sql`. **Pruebas.** `test-database*.test.ts`.

### 2026-11-06 · Roles y permisos configurables (rama `feat/US-36-roles-configurables`, PR #4)

**Hecho (RF11, US-36, ADR-18 ampliada, ADR-031).**

- **Datos.** Tablas `Role` y `RolePermission`, y `User.roleId` en lugar del enum. La migración conserva los datos y promueve al ADMIN activo más antiguo a SUPERADMIN.
- **Catálogo.** Vive en `packages/shared`, agrupado por recurso.
- **API.**
  - Permisos leídos en cada pedido.
  - Módulos nuevos `roles` (`GET/POST /roles`, `GET/PATCH/DELETE /roles/:id`, `PUT /roles/:id/permissions`) y `permissions` (`GET /permissions`).
  - `/users` con `roleId`, anti-escalada y la regla de que siempre quede al menos un SUPERADMIN activo (409).
  - `GET /auth/me` devuelve los permisos efectivos.
- **Web.**
  - Pantalla `/panel/roles`: tabla, diálogo con casillas por recurso, confirmaciones y aviso de rol con usuarios.
  - El selector de roles del diálogo de usuarios ofrece solo los roles asignables.
  - Todos los chequeos de la interfaz usan los permisos de la sesión.
- **Semilla.** Crea los roles del sistema y al Superadministrador inicial, y suma `direccion@ifts2.local` como ADMIN de demostración.

**Pruebas.**

- API: `roles.test.ts`, anti-escalada y último SUPERADMIN en `users.test.ts`, y `route-permissions.test.ts`, que recorre todas las rutas.
- `shared`: catálogo y validación de permisos.
- Cypress: `e2e-18-19-20-roles.cy.ts` a 390 y 1440 px.

**Dificultades.**

- El enum `Role` de PostgreSQL chocaba con la tabla nueva del mismo nombre: la migración lo renombra primero.
- La prueba nueva de rutas encontró `POST /social/cron` sin permiso. Es intencional, porque usa `CRON_SECRET`, y quedó documentado como excepción (Q127).

**Preguntas nuevas.** Q126 (un ADMIN no administra a usuarios con más permisos) y Q127 (excepciones a "toda ruta declara permiso").

**Enmienda del mismo día (decisión del equipo, ver ADR-031).** Los roles de sistema ADMIN, BEDELIA y EDITOR **sí se pueden eliminar** (manual, con confirmación, auditado como `role.delete`, 409 si tienen usuarios); SUPERADMIN no se edita ni se elimina. En modo `prod` la semilla crea esos tres solo en el primer arranque, para no resucitar un rol eliminado (Q128). `/integrations/*` se protege con el permiso `integrations:manage` y no con el rol ADMIN (Q129). La implementación está en `apps/api/src/modules/roles`, `prisma/seed.ts` y la pantalla `/panel/roles`.

### 2026-11-06 · Descargas remotas seguras (A01, PR #2)

**Hecho.** La descarga de imágenes por URL (carga manual y aprobación de Instagram) valida las direcciones DNS **durante la conexión y en cada redirección**, para impedir destinos internos (SSRF), sin cambiar los límites de tamaño ni de tiempo (`apps/api/src/infra/media-download.ts`). **Pruebas.** `media-download.test.ts` y `social.test.ts`. Reemplaza la limitación "no se resuelve DNS" anotada en la entrada de redes del 29/10.

### 2026-11-06 · Administración ante operaciones concurrentes (A02, PR #3)

**Hecho.** `PATCH` y `deactivate` de `/users` corren en una transacción **serializable** (`apps/api/src/modules/users/transaction.ts`): dos pedidos simultáneos no pueden dejar al sistema sin Superadministrador activo (escritura sesgada). **Pruebas.** `users-concurrency.test.ts` y `user-transaction.test.ts`.

### 2026-11-06 · Histórico de publicaciones programadas (A05, PR #5)

**Hecho.** El filtro SQL compartido por el listado histórico, su total y el detalle archivado admite `SCHEDULED` con una ventana no vacía ya terminada. Los años disponibles incorporan las programadas elegibles, sin adelantar las futuras. Se preservan `PUBLISHED`, Instagram, los estados y la portada; no hay migraciones ni cambios visuales o de contratos.

**Pruebas.** Cinco casos de integración nuevos con reloj controlado: matriz de estados y ventanas, ambos límites para publicaciones manuales y programadas, Instagram y filtros/años/paginación en Buenos Aires. Se reprodujo el fallo antes de corregirlo. PostgreSQL 17 aislado, con base descartable marcada y verificada mediante A04; ninguna operación sobre bases de desarrollo o producción. Resultados y comandos en `docs/evidencias/2026-11-06-historico-publicaciones-a05.md`.

### 2026-11-06 · Documentación alineada con las decisiones del equipo (agente de documentación)

**Hecho (solo documentación, sin tocar código).**

- **Backlog.** US-36 queda para roles y permisos configurables; "destacar" pasó a **US-37** (`07-backlog-y-plan.md`, `historias-de-usuario.md`, Q130).
- **Roles.** Son **cuatro** roles de sistema (SUPERADMIN, ADMIN, BEDELIA, EDITOR): corregidos ADR-18, Q3, Q27, la discrepancia 4 de `09`, RF11 y los manuales. **Regla nueva:** ADMIN, BEDELIA y EDITOR se pueden eliminar (manual, confirmado, auditado, 409 si tienen usuarios); SUPERADMIN no se edita ni se elimina (409). El último SUPERADMIN activo no se desactiva ni cambia de rol: **409** (la sección Usuarios de `04-api.md` decía 422 y "último administrador"). Enmienda en ADR-031; Q128 (la semilla `prod` no resucita roles eliminados).
- **Integraciones por permiso.** `/integrations/*` exige `integrations:manage` (ya estaba en el catálogo y en la matriz inicial de ADMIN); `04-api.md`, la matriz, ADR-18, ADR-020, el README y los manuales hablan de permiso y no del rol ADMIN (Q129).
- **API.** `04-api.md` contrastada con los routers reales de `apps/api/src/modules`: Ingreso e Inscripciones **no tienen endpoints propios** (usan `/public/content/ingreso` y `/public/students`, este con `?audience=`); contacto real (campo señuelo y 5 envíos por hora, sin captcha); `GET /public/publications/:id?archived=`; lecturas por id y `PATCH /documents/:id` que faltaban; `DELETE /categories/:id` y `/roles/:id` en el listado de eliminaciones.
- **Decisiones menores.** Hashtag `#ifts2web` provisorio y unificado (00, ADR-09, 08, Q1, Q25); tipografía Plus Jakarta Sans (ADR-11, Q23); carga con autocannon y no k6, con el porqué (RNF09, 06, 03); Q15 resuelta (el Figma incluye el panel móvil, 05).
- **Orden y referencias.** IDs ordenados (RNF08/RNF09, E2E-19/E2E-20, Q13/Q20/Q21 y secciones de `09`); README con la sección 14 correcta, BUILD-NOTES en el mapa y la frase de "placeholders" actualizada; rutas `especificaciones/` cambiadas a `docs/specs/`; se aclaró que `consigna/`, `cliente/ifts2/` y `proyecto/decisiones.md` viven en el repositorio del equipo.
- **Esta bitácora** se reordenó cronológicamente y se reescribió el pendiente.

**Pendiente de documentación.** Regenerar las tablas de campos y el DER del Manual Técnico (`pnpm docs:der`) y el PDF (`pnpm docs:pdf`): reflejan el esquema del 30/10 (enum `Role`) y todavía no la tabla `Role`. Sumar capturas de la pantalla **Roles y permisos** al Manual de Usuario.

### 2026-11-07 · Ventana "Usuarios y roles" más clara (rama `usuarios-y-roles`)

**Problema.** En la ventana de usuarios el nombre y el correo quedaban en una columna angosta (el correo se cortaba en dos), cada fila repetía el nombre en el rótulo del desplegable, el rol se guardaba apenas se tocaba el desplegable (sin confirmación) y se ofrecía "Desactivar" sobre el propio usuario.

**Hecho.**

- Cada fila muestra a la persona a lo ancho (nombre, correo completo y último ingreso) y el rol como etiqueta.
- El rol se cambia con un botón **Cambiar rol**: abre un formulario que muestra qué permite cada rol y, al guardar, pide confirmación con el `ConfirmDialog` único. Avisa que se cierran las sesiones abiertas de esa persona.
- El usuario propio aparece como "(vos)" y sin acciones; los usuarios con más permisos dicen que solo los administra un Superadministrador.
- El formulario de alta muestra la descripción del rol elegido y, para el Superadministrador, el enlace "Ver qué puede hacer cada rol".
- Los usuarios de demostración tienen nombres de persona ("Directora de prueba", "Bedel de prueba", "Editora de prueba"), para no confundirlos con los roles.

**Pruebas.** Cypress `panel-b/usuarios-y-roles.cy.ts` (cambio de rol con confirmación, propio usuario sin acciones, 390 y 1440 px) y `panel-a/capturas-crud.cy.ts` adaptado al flujo nuevo.

## Estado actual (06/11/2026)

- **Hecho:** API completa (auth, usuarios, roles y permisos configurables, auditoría, integraciones, redes, publicaciones, avisos, horarios, llamados, ciclos, documentos, ajustes, contenido, enlaces, contacto, resumen y `/public/*`), sitio público (Inicio, Institucional con contacto, La carrera, Estudiantes, Ingreso, Inscripciones y Novedades), panel completo y responsive (login, Resumen, Publicaciones, Avisos, Mensajes, Horarios, Archivo, Configuración, Integraciones, Roles y permisos), semilla demo/prod, CI, evidencias, Manual Técnico, Manual de Usuario y PDF de entrega (del 30/10).
- **Últimas verificaciones registradas:** 30/10: 43 + 352 pruebas, Cypress 190 en 19 archivos, `pnpm verify` 33/33 (`docs/evidencias/2026-10-30-entrega-*`). 06/11: pruebas de roles, concurrencia, descargas remotas y A05 (`docs/evidencias/2026-11-06-*`).

## Pendiente

- **Con servicios reales (faltan cuentas o credenciales):** probar Instagram contra una cuenta profesional y una app de Meta del cliente (`GraphInstagramClient` solo se probó contra un servidor simulado); SMTP real (remitente, Q100) y `S3Storage` contra un servicio real.
- **Despliegue:** hosting, base y dominio sin definir (ADR-15, Q13, Q14); `deploy.yml` y `lighthouse.yml` de la CI; enlaces del repositorio y de la aplicación en `docs/entrega/Enlaces.md` (`[completar]`).
- **Con el cliente:** datos de ingreso (Q122), ubicación de materias por año (Q120), nombres de la resolución (Q121), URL de SIU Guaraní, Mi Argentina y Tutoría (Q6), nombres finales Ingreso/Inscripciones (Q20, Q22), hashtag definitivo (Q1), a quién se entregan las credenciales del Superadministrador en producción (Q123), fotos y galería (Q63).
- **Producto:** galería y plantel (RF09, RF10), plan por año navegable (Q17), "Prioridad visual" en la moderación (Q84), barra inferior móvil del Figma (Q65), documentos públicos de Ingreso (Q62), remitente SMTP (Q100).
- **Escala:** un proceso web se satura cerca de 300-360 pedidos/s (se resuelve con CDN o más procesos); el límite de frecuencia es en memoria (Q29).
- **Documentación:** regenerar DER, tablas y PDF; capturas de Roles y permisos (ver arriba).
- **Cuidado:** `pnpm e2e --reset` y `pnpm db:reset` borran la base de desarrollo y los corre una persona, no un agente.

## Dificultades y soluciones (de la fundación)

- **Prisma rechazó el schema de la spec**: enums en una sola línea. Se pasaron a varias líneas.
- **pnpm 11 bloquea scripts de instalación**: se aprobaron en `pnpm-workspace.yaml` (`allowBuilds`).
- **Cypress no arrancaba** (`bad option: --smoke-test`): el entorno define `ELECTRON_RUN_AS_NODE=1`; se ejecuta con la variable sin definir.
- **Puerto 3000 ocupado por otro programa del equipo**: no se tocó; la web de verificación corrió en 3100 (`PORT`) y se documentó.
- **El foco no volvía al botón que abrió un diálogo controlado**: Radix solo lo hace con `Trigger`; se agregó `useRestoreFocus` (verificado con Cypress).
- **Variables CSS no admiten opacidad de Tailwind** (`bg-x/50`): se evita y se documentó.
- **El menú móvil cerraba con un `setState` en un efecto** (regla de lint de React): se resolvió guardando la ruta en la que se abrió.
- **`/ui-kit` quedaba prerenderizado y siempre devolvía 404 en producción**: se hizo dinámico (`ENABLE_UI_KIT`).
