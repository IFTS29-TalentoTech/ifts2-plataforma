# Avance

Registro de tareas completadas y pendientes, dificultades y soluciones. Un agente agrega una entrada por tarea. **Orden cronológico (lo más viejo arriba)**, reconstruido con `git log`; lo vigente y lo pendiente están al final, en "Estado actual" y "Pendiente".

## Completado

### 2026-11-08 · Enlaces de interés claros (ADR-039, rama `feat/publico-fiel-al-figma`)

- Cada enlace elige **dónde se muestra** con casillas (Inicio, Estudiantes, Inscripciones) en lugar del campo «Grupo»; «Visible» es un selector «Sí, se muestra / No, queda oculto»; el orden se cambia con Subir/Bajar (`PUT /links/order`).
- La lista dice con palabras dónde se ve cada enlace y si está oculto. API pública: `/public/students.enrollmentLinks` nuevo; `quickLinks` y `links` filtran por lugar.
- Migración `20261108120000_enlaces_lugares` (dos columnas con valor por defecto, no cambia lo publicado). Pruebas: `packages/shared/test/links.test.ts` y casos nuevos en `public.test.ts` y `settings-content-links.test.ts`.

### 2026-11-07 · Categorías de galería y plantel docente (RF09 completo, RF10, ADR-036 y ADR-037, rama `feat/publico-fiel-al-figma`)

**Hecho.** (1) **RF09/US-30:** `GalleryItem.category` (migración aditiva `20261107120000_galeria_categoria`), esquema zod, API, campo con sugerencias en el panel y **filtro por categoría accesible en Estudiantes** (botones con `aria-pressed`, se muestra solo si hay categorías). (2) **RF10/US-29:** modelo `Teacher` y migración `20261107130000_plantel` (también concede `teachers:manage` a los ADMIN y EDITOR existentes), módulo de API `teachers` (alta, edición, foto, orden, baja lógica y eliminación manual solo de personas ocultas, 409 si siguen visibles, todo auditado), lectura pública `/public/teachers`, página `/panel/plantel` (y pestaña de Configuración) y sección **Plantel docente** en Institucional (no se dibuja si no hay personas visibles). (3) **Semilla demo:** 6 docentes **ficticios** (nombres inventados, ilustraciones en lugar de fotos, uno oculto) y categorías provisorias en la galería (Prácticas, Ingredientes, Platos, Perfil); producción deja el plantel vacío. Las bases que ya tenían las diapositivas provisorias reciben su categoría al volver a correr `pnpm db:seed` (solo si siguen sin categoría).

**Pruebas.** `shared` (teachers y categorías), API (`teachers.test.ts`, 16 casos; categorías en `gallery.test.ts`) y Cypress: `public/plantel.cy.ts`, `panel-b/plantel.cy.ts`, filtro de `public/carrusel.cy.ts` y categoría en `panel-b/galerias.cy.ts` (390 y 1440 px, con axe).

**Decisiones y preguntas.** ADR-037 y Q138 (datos reales del plantel) y Q139 (consentimiento de fotos).

**Dificultad.** `prisma generate` falla con EPERM mientras un `pnpm dev` tiene abierto el motor de Prisma en Windows. Se regeneró el cliente en una carpeta temporal y se copiaron todos los archivos menos el `.dll` (el motor es el mismo; el esquema viaja en el cliente). Para uso normal: detener `pnpm dev`, `pnpm db:migrate`, volver a levantar.

### 2026-11-07 · Carrusel editable y galerías (RF09, ADR-036, rama `feat/publico-fiel-al-figma`)

**Hecho.** Modelo `GalleryItem` y migración `20261107075740_galeria` (aditiva; también concede `gallery:manage` a los ADMIN y EDITOR existentes). Módulo de API `gallery` (alta con imagen a WebP de 1600 px, textos, reemplazo de foto, orden, eliminación manual auditada, hasta 10 por área) y lectura pública `/public/gallery`. Componente `Carousel` accesible (scroll-snap, botones, puntos, teclado, sin reproducción automática). Sección **Galerías** del panel (`/panel/galerias` y pestaña de Configuración) con subir, editar, Subir/Bajar y eliminar con confirmación. Estudiantes y La carrera usan el carrusel; sin diapositivas se usa el respaldo (`student_gallery`, `career_image`). La semilla crea las diapositivas provisorias solo si el área está vacía.

**Pruebas.** API (`gallery.test.ts`, 18 casos), `shared` (7 casos nuevos) y Cypress: `public/carrusel.cy.ts` (semántica, botones, puntos, teclado, axe, 390 y 1440 px) y `panel-b/galerias.cy.ts` (flujo completo del EDITOR, 403 de BEDELIA).

**Para correr.** `pnpm db:migrate` (con el servidor de desarrollo apagado si falla el cliente de Prisma en Windows: EPERM) y `pnpm db:seed`.

**Pendiente.** Categorías de la galería (RF09 completo); reemplazar las fotos provisorias por las del instituto con consentimiento (Q63).

### 2026-11-07 · Instagram: conexión con token pegado (sin App ID ni Secret)

**Hecho.** La configuración de Instagram tiene `connectionMethod` (`oauth` o `token`). Con `token`, pegar el token alcanza: pasa a modo real, el cliente Graph funciona solo con el token y se puede probar la conexión. La tarjeta de Configuración tiene un selector de método y muestra solo el formulario correspondiente. Cambiar de método descarta lo conectado con el otro. Pruebas: 5 casos nuevos de API (`integrations.test.ts`) y un spec Cypress (`integraciones-a11y`). ADR-020 enmendado.

**Pendiente.** Probar contra Meta real (cuenta profesional y token generado en el panel de Meta); la renovación automática del token no se verificó con tokens pegados.

### 2026-11-07 · Pantallas públicas fieles al Figma (rama `feat/publico-fiel-al-figma`)

**Hecho.** Fotos del Figma como **provisorias** (ADR-035, Q63): 13 imágenes webp (472 KB) en `apps/web/public/img/provisorio/`. Inicio: titular corto + frase ancla como subtítulo (resuelve Q64) y las dos fotos del encabezado; La carrera: foto junto al perfil; Estudiantes: galería "Vida en la cocina" (grilla estática); Ingreso: foto en el encabezado; Novedades: portadas de demostración y bloque neutro sin portada; logo configurable en el encabezado. Todo sale de ajustes nuevos de `SiteSetting` (`hero_title`, `hero_eyebrow`, `logo_url`, `hero_image_1/2`, `career_image`, `ingreso_image`, `student_gallery`) editables en Configuración; los valores del IFTS están solo en la semilla (hay que correr `pnpm db:seed`, idempotente).

**Pruebas.** `shared` (esquema y `parseGallery`), API (guardar, rechazar y publicar los ajustes; portadas con ruta propia), unitaria de `toSiteInfo` y el spec Cypress `public/imagenes-figma.cy.ts` (390 y 1440 px: ninguna imagen rota).

**Pendiente / decisiones.** Q134 (plan por año del Figma sin datos), Q135 (carrusel vs. grilla), Q136 (descripciones de los pasos de Ingreso) y Q137 (logo). Las fotos tienen personas sin consentimiento documentado: reemplazarlas antes de producción.

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

### 2026-11-07 · Aprobación de redes ante fallas parciales (A10, rama `fix/A10-portada-aprobacion`)

**Problema.** En `approvePost` (`apps/api/src/modules/social/social.service.ts`) un mismo `try` envolvía la transacción y el armado de la respuesta. Si fallaba algo **después** de confirmar (por ejemplo, la relectura de la base), el `catch` borraba la portada de una publicación ya guardada y publicada, y el moderador veía un error aunque la aprobación había ocurrido.

**Hecho.**

- La limpieza de la imagen copiada se limita a la falla de la transacción. Lo posterior a la confirmación ya no borra nada.
- Ante una confirmación ambigua (la base guardó pero se informó un error), se consulta si existe una publicación con esa portada antes de borrar. Si no se puede verificar, se deja el archivo: mejor un huérfano que una portada rota.

**Pruebas.** En `apps/api/test/api/social.test.ts`, "aprobación ante fallas parciales (A10)": falla al copiar la imagen, falla dentro de la transacción, confirmación ambigua y falla al releer la base después de confirmar, verificando registro y archivo en cada caso. La doble aprobación simultánea ya estaba cubierta (una 201, otra 409, un solo archivo).

**Relacionado, sin cambios.** `documents` tiene el mismo patrón, pero lo posterior a la transacción (`toDocumentDto`) no puede fallar. En `publications/:id/cover` el riesgo es el inverso (si falla la transacción, el archivo queda huérfano), de menor gravedad.

### 2026-11-07 · Ventana "Usuarios y roles" más clara (rama `usuarios-y-roles`)

**Problema.** En la ventana de usuarios el nombre y el correo quedaban en una columna angosta (el correo se cortaba en dos), cada fila repetía el nombre en el rótulo del desplegable, el rol se guardaba apenas se tocaba el desplegable (sin confirmación) y se ofrecía "Desactivar" sobre el propio usuario.

**Hecho.**

- Cada fila muestra a la persona a lo ancho (nombre, correo completo y último ingreso) y el rol como etiqueta.
- El rol se cambia con un botón **Cambiar rol**: abre un formulario que muestra qué permite cada rol y, al guardar, pide confirmación con el `ConfirmDialog` único. Avisa que se cierran las sesiones abiertas de esa persona.
- El usuario propio aparece como "(vos)" y sin acciones; los usuarios con más permisos dicen que solo los administra un Superadministrador.
- El formulario de alta muestra la descripción del rol elegido y, para el Superadministrador, el enlace "Ver qué puede hacer cada rol".
- Los usuarios de demostración tienen nombres de persona ("Directora de prueba", "Bedel de prueba", "Editora de prueba"), para no confundirlos con los roles.

**Pruebas.** Cypress `panel-b/usuarios-y-roles.cy.ts` (cambio de rol con confirmación, propio usuario sin acciones, 390 y 1440 px) y `panel-a/capturas-crud.cy.ts` adaptado al flujo nuevo.

### 2026-11-07 · Tarjeta "Usuarios del panel" con menú por persona (rama `fix/configuracion-usuarios-menu`)

**Problema.** La tarjeta "Seguridad y accesos" de Configuración se titulaba "Administradores del sistema" aunque listaba a todos los usuarios, mostraba solo 6 sin avisar si había más, las fichas no hacían nada al tocarlas y el botón "+ Administrar usuarios y roles" parecía un alta. El enlace "Roles y permisos" quedaba suelto debajo.

**Hecho.**

- La tarjeta pasa a llamarse "Usuarios del panel" y muestra cuántos usuarios hay y cuántos están activos.
- Cada persona se toca y abre un **menú** con sus acciones: Cambiar rol, Restablecer contraseña y Desactivar o Reactivar. La ficha propia y la de quien tiene más permisos no abren menú y explican por qué.
- Arriba a la derecha, **Gestionar usuarios** (abre la ventana con el alta y la lista completa) y, solo para el Superadministrador, **Roles y permisos**. Si hay más de 6 personas, un enlace "Ver los N restantes".
- Las acciones sobre un usuario se movieron a `configuracion/user-actions.tsx`: la tarjeta y la ventana usan las mismas reglas, formularios y confirmaciones.
- Componente nuevo del kit: `DropdownMenu` (Radix, `@radix-ui/react-dropdown-menu`), accesible con teclado y lectores de pantalla.

**Pruebas.** Cypress `panel-b/usuarios-y-roles.cy.ts` suma el menú de la tarjeta (390 y 1440 px, con axe). Los specs que abrían la ventana usan el texto nuevo "Gestionar usuarios".

### 2026-11-07 · Las pruebas E2E usan su propia base (rama `fix/configuracion-usuarios-menu`)

**Problema.** `pnpm e2e` corría contra la base de desarrollo. Cada corrida dejaba usuarios y roles de prueba ("Rol 18", "Docentes invitados…", "Persona de prueba") que no se pueden borrar (los usuarios solo se desactivan): la base llegó a 70 usuarios y 28 roles, las listas se hicieron largas (las flechas de scroll tapaban opciones) y pruebas como E2E-10 dependían de lo que había dejado la corrida anterior.

**Hecho.** `pnpm e2e` prepara una base propia, `ifts2_e2e` (`scripts/lib/e2e-db.mjs`): la vacía, aplica las migraciones y carga la semilla demo antes de cada corrida, y la API y las tareas de Cypress la usan. Solo acepta una base llamada `ifts2_e2e` en `localhost:5433`, así nunca puede vaciar la de desarrollo. `--reset` ya no hace falta (se ignora); `--keep-db` reutiliza la base E2E.

### 2026-11-07 · Portada manual ante fallas y cambios simultáneos (A10, rama `fix/A10-portada-manual`)

**Problema (pendiente de A10 tras el PR #12).** En `POST /publications/:id/cover` la portada anterior se decidía con un dato leído **antes** de la transacción. Una transacción fallida dejaba la imagen subida huérfana (y si la publicación se eliminaba en el medio, respondía 500). Dos subidas simultáneas dejaban una imagen huérfana, y una subida mientras otro guardaba un formulario con la portada vieja podía dejar la publicación **apuntando a una imagen borrada**.

**Hecho (`apps/api/src/modules/publications/cover.service.ts`).**

- La subida y el `PATCH` con `coverUrl` cambian la portada con un UPDATE condicional ("solo si sigue siendo la esperada"): si otro cambio ganó, **409** sin guardar nada. Se distingue **404** (no existe) de **409** (cambió).
- Precondición opcional del cliente, `expectedCoverUrl` (en la subida va en el multipart). El formulario web la manda con la portada que vio al abrirse; el `PATCH` del formulario ya no reenviaba `coverUrl`.
- Si la transacción falla, la imagen nueva se borra solo si nadie la usa; ante una confirmación ambigua o la base caída, se conserva.
- La portada anterior se borra después de confirmar y solo si ya nadie la usa (también al eliminar una publicación). Un error posterior a la confirmación nunca borra archivos.
- Sin migraciones. No se tocó la solución del PR #12 (aprobación de Instagram).

**Pruebas.** 14 nuevas en `apps/api/test/api/publications.test.ts` ("portada ante fallas y cambios simultáneos (A10)"), deterministas (se intercepta la transacción): precondición vieja, otro cambio confirmado en el medio, dos subidas simultáneas reales (una 200 y otra 409, queda un solo archivo y es el referenciado), transacción fallida, publicación eliminada en el medio (404), confirmación ambigua, falla al borrar la anterior, portada anterior usada por otra publicación, formulario viejo en el `PATCH`, cambio a dirección externa y `PATCH` sin portada. Todas verifican base y almacenamiento. Contra el código anterior fallan 9 de las 14.

**Trabajo posterior (no incluido).** Los archivos huérfanos históricos del almacenamiento no se limpian. Si hiciera falta, un script que solo **liste** las imágenes sin referencia, para revisarlas a mano (sin borrado automático, por la regla del proyecto).

### 2026-11-07 · Cambio de contraseña voluntario: "Mi cuenta" (rama `feat/cambiar-contrasena`)

**Problema.** La API ya permitía cambiar la propia contraseña (`POST /auth/change-password`), pero la web solo mostraba el formulario cuando el cambio era obligatorio (tras un restablecimiento). Nadie, ni el Superadministrador, podía cambiar su clave por voluntad propia.

**Hecho.**

- Página **Mi cuenta** (`/panel/cuenta`), para cualquier persona logueada: muestra nombre, correo y rol y permite cambiar la contraseña (pide la actual). Al cambiarla, la API cierra las demás sesiones y la actual sigue abierta; la pantalla lo avisa.
- Se llega desde el menú de cuenta de la cabecera (escritorio) y desde el menú hamburguesa del panel (móvil), con "Cambiar contraseña".
- El formulario existente (`change-password-form.tsx`) tiene dos modos: `forced` (el obligatorio, sin cambios) y `voluntary`.

**Pruebas.** Cypress `panel-a/mi-cuenta.cy.ts` (390 y 1440 px, con axe): clave actual incorrecta, cambio correcto, la sesión sigue y solo la clave nueva sirve para entrar. `login.cy.ts` (cambio obligatorio) sigue en verde.

### 2026-11-07 · Pie del sitio más bajo y sin espacio en blanco en el panel (rama `fix/panel-pie`)

**Problema.** En el panel (escritorio) quedaba un espacio en blanco debajo del pie. Causa: el `<main>` que hace scroll no tenía posición propia, así que los elementos con `position: absolute` de adentro (los textos `sr-only` para lectores de pantalla) se ubicaban respecto de la página, escapaban del scroll y la estiraban (en Configuración, 992 px de alto con una ventana de 900). Además el pie ocupaba tres renglones.

**Hecho.**

- `panel-shell.tsx`: el `<main>` lleva `relative`. Ahora la página mide lo mismo que la ventana y el pie queda abajo, en todas las pantallas del panel.
- `site-footer.tsx`: en escritorio, una sola fila (texto y contactos a la izquierda, redes a la derecha); en móvil se apila. Instagram y Facebook son íconos (SVG propios con `currentColor`, porque la versión de lucide-react ya no trae íconos de marcas) con nombre accesible y `title`.

**Pruebas.** Cypress `recorrido`, `smoke`, `degradacion`, `integraciones-a11y` (axe) y `mi-cuenta` en verde; medido en el navegador: alto de página = alto de ventana.

### 2026-11-08 · Auditoría B (B01, B04, B08), hook de pre-commit y entrega final

- **B01 (permisos y navegación):** el menú y las páginas contenedoras usan la misma decisión por capacidades (`lib/nav.ts`); Configuración, Horarios y Publicaciones montan solo las secciones autorizadas. Detalle en `docs/auditoria-b/B01.md`.
- **B04 (confirmaciones HTTP):** el cliente de la API ya no devuelve `undefined` ante un error JSON; las mutaciones validan su contrato (`lib/mutation-contracts.ts`, `lib/confirm-publication.ts`) y la pantalla solo anuncia éxito si el servidor confirmó. `docs/auditoria-b/B04.md`.
- **B08 (integridad de horarios):** PATCH, publicar y despublicar usan una precondición atómica; el que pierde la carrera recibe 409 y no deja auditoría de éxito. La relación `Schedule.document` pasa a `onDelete: Restrict` (migración `20261107192000_schedule_document_restrict`). `docs/auditoria-b/B08.md`.
- **Hook de pre-commit:** husky + lint-staged formatean y corrigen los archivos en staging (`pnpm install` lo activa). La CI fallaba en `prettier --check` por el README.
- **Entrega final:** enlace al repositorio (`main`) en `Enlaces.md`; se quitó toda mención a aplicación desplegada; PDFs sueltos de los dos manuales y carátula de una hoja (`pnpm docs:pdf:all`, `pnpm docs:caratula`); PDF de entrega y zip regenerados desde `main`.

## Sincronización incremental de Instagram (07/11/2026, ADR-038)

- `sync.service.ts` + `sync-window.ts`: cada fetch exitoso registra `lastFetchAt`, la marca y la identidad (id de cuenta de Graph, hashtag, método) en `IntegrationConfig` (`instagram_sync`); la siguiente trae solo lo posterior (margen de 6 h) y corta la paginación al ver una publicación vieja. Completa la primera vez, con `POST /social/sync?full=true` y al cambiar cuenta, hashtag o método. Un fetch fallido no avanza la marca. `InstagramClient` suma `since`, `onCoverage` y `getAccountId()` (doble incluido).
- Panel: botón secundario "Sincronización completa" (con `ConfirmDialog`) y "Último fetch exitoso" en Publicaciones, Resumen y Configuración.
- **Pruebas:** unitarias (`sync-window`, corte de paginación, doble) y de API (incremental, margen, fallo, forzada, cambio de cuenta/hashtag/método, sin duplicar, 401/403/400) + Cypress corto. **Sin verificar:** contra una cuenta real de Meta.

## Semilla demo completa (07/11/2026)

`prisma/seed.ts` (`seedDemoExtras`) suma datos ficticios para que la demo muestre todo: publicaciones en todos los estados y años, publicaciones de redes detectada / aprobada / descartada, avisos para cada público y en cada estado, llamados pasados, próximos y sin publicar, mensajes en cada estado, una cuenta desactivada, un enlace oculto y auditoría de varias personas. Es idempotente y solo corre en modo demo. Lo único que carga el equipo a mano es el token de Instagram. Verificado en una base descartable: dos corridas seguidas sin duplicados.

## Páginas del sitio y galerías con nombre (08/11/2026, ADR-041)

Reorganización de la edición del contenido pensada para personas mayores: Configuración queda con dos pestañas (Integraciones, Enlaces de interés); los textos, las imágenes y las galerías de cada página (Inicio, Institucional, La carrera, Estudiantes, Ingreso, Inscripciones) se editan en la pantalla nueva «Páginas del sitio» (`/panel/paginas`); Galerías y Plantel docente viven solo en el menú lateral. Las imágenes del sitio se suben como archivo (ya no se escriben rutas) y el logo aparece también en el encabezado del login. Las galerías tienen nombre, pueden ser varias y se agregan a cualquier página como sección. Migración `20261108120000_galerias_con_nombre` (conserva las dos galerías anteriores). Se retiró el ajuste `student_gallery`. Pruebas: shared y web en verde; las de API (`gallery.test.ts`, `settings-images.test.ts`) y los E2E (`galerias.cy.ts`, `ajustes-pagina.cy.ts`, `delegated-capabilities.cy.ts`) quedan para correr con la base y los puertos propios.

## Instagram: errores de Graph bien clasificados (08/11/2026, ADR-044)

La sincronización con un token real siempre decía «venció o fue revocado»: `graph.ts` trataba todo `OAuthException` como token inválido (Meta lo usa también para el código 100 de parámetros y los de permisos) y el panel sumaba «No pudimos confirmar el resultado» a cualquier 502. Ahora solo 401/190/102 son token vencido; permisos, límite de uso, caída de Meta y consulta rechazada tienen su mensaje, y el 502 trae «Detalle para el equipo» con el código de Meta (sin token). La consulta de cuenta de ADR-038 ya no corta la sincronización si falla por otra causa (hace carga completa). Pruebas: 252 unitarias de la API en verde; los casos nuevos de `test/api/social.test.ts` quedan para correr con `ifts2_test`.
**Qué probar a mano con el token real:** sincronizar y leer el «Detalle para el equipo» (código y mensaje de Meta). Si dice 190, el token no es de «Instagram con inicio de sesión de Instagram» o venció; si dice 100 o 10, falta un permiso o la cuenta no es profesional.

## Estado actual (08/11/2026)

- **Hecho:** API completa (auth, usuarios, roles y permisos configurables, auditoría, integraciones, redes, publicaciones, avisos, horarios, llamados, ciclos, documentos, ajustes, contenido, enlaces, contacto, resumen y `/public/*`), sitio público (Inicio, Institucional con contacto, La carrera, Estudiantes, Ingreso, Inscripciones y Novedades), panel completo y responsive (login, Resumen, Publicaciones, Avisos, Mensajes, Horarios, Archivo, Configuración, Integraciones, Roles y permisos), semilla demo/prod, CI, evidencias, Manual Técnico, Manual de Usuario y PDF de entrega (del 30/10).
- **Últimas verificaciones registradas:** 30/10: 43 + 352 pruebas, Cypress 190 en 19 archivos, `pnpm verify` 33/33 (`docs/evidencias/2026-10-30-entrega-*`). 06/11: pruebas de roles, concurrencia, descargas remotas y A05 (`docs/evidencias/2026-11-06-*`).

## Pendiente

- **Con servicios reales (faltan cuentas o credenciales):** probar Instagram contra una cuenta profesional y una app de Meta del cliente (`GraphInstagramClient` solo se probó contra un servidor simulado); SMTP real (remitente, Q100) y `S3Storage` contra un servicio real.
- **Despliegue:** hosting, base y dominio sin definir (ADR-15, Q13, Q14); `deploy.yml` y `lighthouse.yml` de la CI. No hay aplicación desplegada: la entrega se ejecuta en local con las instrucciones del Manual Técnico.
- **Con el cliente:** datos de ingreso (Q122), ubicación de materias por año (Q120), nombres de la resolución (Q121), URL de SIU Guaraní, Mi Argentina y Tutoría (Q6), nombres finales Ingreso/Inscripciones (Q20, Q22), hashtag definitivo (Q1), a quién se entregan las credenciales del Superadministrador en producción (Q123), fotos y galería (Q63), plantel docente real (Q138) y consentimiento de fotos (Q139).
- **Producto:** plan por año navegable (Q17), "Prioridad visual" en la moderación (Q84), barra inferior móvil del Figma (Q65), documentos públicos de Ingreso (Q62), remitente SMTP (Q100).
- **Escala:** un proceso web se satura cerca de 300-360 pedidos/s (se resuelve con CDN o más procesos); el límite de frecuencia es en memoria (Q29).
- **Documentación:** capturas de Roles y permisos en el Manual de Usuario (el DER, las tablas y los PDF se regeneraron el 08/11 con `pnpm docs:pdf:all`).
- **Cuidado:** `pnpm db:reset` borra la base de desarrollo y lo corre una persona, no un agente. `pnpm e2e` ya no la toca: usa su propia base `ifts2_e2e`.

## Dificultades y soluciones (de la fundación)

- **Prisma rechazó el schema de la spec**: enums en una sola línea. Se pasaron a varias líneas.
- **pnpm 11 bloquea scripts de instalación**: se aprobaron en `pnpm-workspace.yaml` (`allowBuilds`).
- **Cypress no arrancaba** (`bad option: --smoke-test`): el entorno define `ELECTRON_RUN_AS_NODE=1`; se ejecuta con la variable sin definir.
- **Puerto 3000 ocupado por otro programa del equipo**: no se tocó; la web de verificación corrió en 3100 (`PORT`) y se documentó.
- **El foco no volvía al botón que abrió un diálogo controlado**: Radix solo lo hace con `Trigger`; se agregó `useRestoreFocus` (verificado con Cypress).
- **Variables CSS no admiten opacidad de Tailwind** (`bg-x/50`): se evita y se documentó.
- **El menú móvil cerraba con un `setState` en un efecto** (regla de lint de React): se resolvió guardando la ruta en la que se abrió.
- **`/ui-kit` quedaba prerenderizado y siempre devolvía 404 en producción**: se hizo dinámico (`ENABLE_UI_KIT`).

### 2026-11-08 · Error de imagen al publicar (agente F)

Aprobar una publicación mostraba siempre «La imagen de la publicación no se puede usar (formato no admitido o demasiado pesada)». Causa más probable: en la carga manual se pega el enlace de la publicación en vez de la dirección de la imagen y la descarga devuelve una página HTML. Ahora: (1) `storeUpload` acepta GIF/TIFF/AVIF/HEIC reconvirtiéndolos a WebP; (2) el descargador pide `image/*` con un `User-Agent` genérico; (3) cuatro causas con su mensaje (`imageProblem`: descarga, página web, formato, peso); (4) `withoutImage` en `/social/posts/:id/approve` y botón «Publicar sin imagen» con confirmación. ADR-043. Pruebas: `test/unit/upload-images.test.ts` (corrida, verde) y `test/api/social-imagen.test.ts` (escrita, sin correr).

## 08/11/2026 · Páginas del sitio rediseñada (ADR-042)

La pantalla «Páginas del sitio» ahora lista, para cada página (Inicio, Institucional, La carrera, Estudiantes, Ingreso e Inscripciones), sus **bloques en el orden real del sitio**, numerados y con nombre, explicación y etiqueta («Parte fija del sitio», «Agregada por vos», «Se carga en otra pantalla»). Cada bloque tiene el interruptor **«Mostrar en el sitio: Sí / No»**; lo fijo no se elimina (solo se oculta) y el encabezado siempre se muestra. Los bloques que vienen de otra pantalla (Avisos, Mesas, Novedades, Plantel, Enlaces de interés) llevan allí con un botón. «Agregar sección» pregunta Texto o Galería de fotos y funciona en cualquier página (Inicio incluida). Se quitó el título duplicado. La pantalla «Galerías» nombra las páginas donde se ve cada galería. Catálogo en `packages/shared/src/page-blocks.ts`; ocultos en el ajuste `hidden_blocks` (sin migración); la web pública respeta el catálogo (`showBlock`). Pruebas: shared (catálogo) y unit de la API (coherencia con la semilla) en verde; integración `content-blocks.test.ts` y E2E `paginas-sitio.cy.ts` (más ajustes de `galerias.cy.ts` y `ajustes-pagina.cy.ts`) escritos, a correr con base y puertos propios.

## 08/11/2026 · Instagram: dos tipos de token, "Probar conexión" paso a paso y carga manual por enlace (ADR-045)

**Causa de fondo de la sincronización:** el token nuevo del cliente empieza con `EAA` (Facebook Login) y Meta respondía 400/190 «Cannot parse access token»: nuestro cliente hablaba solo con `graph.instagram.com`. Ahora el prefijo elige el host (EAA → `graph.facebook.com`, IG… → `graph.instagram.com`, con reintento si el prefijo no es concluyente), se resuelve la cuenta de Instagram detrás de la Página, la renovación usa `fb_exchange_token` o `refresh_access_token` según el tipo y el hashtag público (solo Facebook Login) falla sin romper la sincronización. «Probar conexión» muestra cada paso con el código de Meta. **Carga manual:** un solo campo acepta el enlace de la publicación (Instagram solo deja copiar ese): se resuelve la imagen por la API oficial o se ofrece subirla o publicar sin imagen. Pruebas: `instagram-facebook.test.ts` (unit), `social-manual-link.test.ts` (integración, a correr). Pendiente: selector de cuenta con varias Páginas; probar con credenciales reales.
