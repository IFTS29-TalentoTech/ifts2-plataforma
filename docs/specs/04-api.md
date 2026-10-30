# 04 · API REST

Base: `/api/v1`. JSON UTF-8. Fechas ISO 8601 en UTC. Autenticación por cookie de sesión en `/panel/*` y en toda ruta fuera de `/public/*`. Errores en formato Problem Details: `{ type, title, status, detail, errors? }`. Listados con `?page=1&pageSize=20` y respuesta `{ items, page, pageSize, total }`.

**Eliminación:** existen endpoints `DELETE`, pero son **manuales**, exigen confirmación en la interfaz, quedan en `AuditLog` y solo aplican a contenido no vigente (borrador, pausado, descartado, vencido o archivado); si el elemento está referenciado devuelven 409. Para sacar algo de circulación sin perderlo se usan `pause`, `archive`, `discard`.

## Permisos por rol

| Recurso | ADMIN | BEDELIA | EDITOR | Público |
|---|---|---|---|---|
| Lectura del sitio (`/public/*`) | ✔ | ✔ | ✔ | ✔ |
| Resumen (`/dashboard`) | ✔ | ✔ | ✔ | |
| Publicaciones y redes (moderar, crear, pausar) | ✔ | | ✔ | |
| Avisos académicos | ✔ | ✔ | | |
| Horarios y llamados a examen | ✔ | ✔ | | |
| Archivo documental (ver, archivar, restaurar) | ✔ | ✔ | | |
| Configuración del sitio y ciclo público | ✔ | | | |
| Usuarios y roles | ✔ | | | |
| Mensajes de contacto | ✔ | ✔ | | |
| Auditoría | ✔ | | | |
| Eliminar (DELETE) contenido no vigente | ✔ | Avisos, horarios, llamados y documentos propios de su área | Publicaciones propias y publicaciones sociales descartadas | |

## Autenticación

| Método y ruta | Descripción |
|---|---|
| `POST /auth/login` | `{ email, password, remember }` → 204 y cookie; 401 con mensaje genérico; 429 al exceder intentos |
| `POST /auth/logout` | Cierra la sesión actual |
| `GET /auth/me` | Usuario y rol de la sesión |
| `POST /auth/change-password` | `{ current, next }`; obligatorio tras un restablecimiento |

## Público (sin sesión, solo lectura, con reglas de vigencia aplicadas)

| Ruta | Devuelve |
|---|---|
| `GET /public/home` | Frase ancla, accesos rápidos y publicaciones de sección HOME vigentes |
| `GET /public/publications?year=&category=&page=` | Publicaciones vigentes de sección NEWS; `?archived=true` para el histórico del año |
| `GET /public/publications/:id` | Detalle de una publicación vigente |
| `GET /public/students` | Ciclo público, horarios y llamados publicados, avisos vigentes, enlaces de interés |
| `GET /public/content/:page` | Secciones de `institucional`, `carrera` o `ingreso` |
| `GET /public/settings` | Datos institucionales visibles (dirección, correos, teléfono) |
| `POST /public/contact` | (Should) `{ name, email, subject, message, consent }`; 201; límite de frecuencia y captcha |

## Panel

**Resumen**
- `GET /dashboard` → `{ instagram: { ok, lastSyncAt, error? }, pendingPosts, activeNotices, noticesExpiringIn7Days, currentTerm, examCallNext, ingresoCycle }`

**Publicaciones y redes**
- `POST /social/sync` → dispara la sincronización; devuelve cantidad de nuevas.
- `GET /social/posts?status=DETECTED|LINKED|DISCARDED&page=`
- `POST /social/posts/:id/approve` → `{ title?, summary?, section, categoryId?, visibleFrom?, visibleUntil?, consentConfirmed }` → crea la `Publication` PUBLISHED, copia la imagen; 409 si ya estaba vinculada.
- `POST /social/posts/:id/discard`, `POST /social/posts/:id/restore`
- `POST /social/manual` → carga manual equivalente (contingencia).
- `GET /publications?status=&origin=&page=`, `POST /publications`, `GET/PATCH /publications/:id`
- `POST /publications/:id/pause`, `/publish`, `/schedule`, `/reactivate` (con nueva vigencia)

**Avisos académicos**
- `GET /notices?status=ACTIVE|PAUSED|EXPIRED|ALL&audience=`, `POST /notices`, `GET/PATCH /notices/:id`
- `POST /notices/:id/pause`, `/resume`

**Horarios y llamados**
- `GET /terms`, `POST /terms`, `PUT /terms/:id/public-current` (con confirmación; deja un único ciclo público)
- `GET /schedules?termId=`, `POST /schedules` (con `documentId`), `PATCH /schedules/:id`, `POST /schedules/:id/publish|unpublish`
- `GET /exam-calls?termId=`, `POST /exam-calls`, `PATCH /exam-calls/:id`, `POST /exam-calls/:id/publish|unpublish`

**Documentos y archivo**
- `POST /documents` (multipart; metadatos: título, tipo, categoría, ciclo, código de resolución)
- `GET /documents?q=&kind=&cycleYear=&status=&page=` (búsqueda por título, código de resolución o año)
- `GET /documents/:id` (detalle), `GET /documents/:id/file` (URL firmada)
- `POST /documents/:id/archive`, `POST /documents/:id/restore`

**Configuración y usuarios**
- `GET/PUT /settings` (sede, correos, teléfono, hashtag de Instagram, inscripciones a mesas habilitadas)
- `GET/PUT /content/:page/:slug`
- `GET/POST/PATCH /links`
- `GET/POST/PATCH /users`, `POST /users/:id/deactivate`, `POST /users/:id/reset-password`
- `GET /audit?entity=&page=`

**Eliminación (CRUD completo):** `DELETE /publications/:id`, `/social/posts/:id` (solo descartadas), `/notices/:id`, `/schedules/:id`, `/exam-calls/:id`, `/documents/:id` (solo archivados), `/links/:id`, `/content/:page/:slug` (solo secciones no estáticas), `/contact-messages/:id`. Los usuarios no se eliminan: se desactivan (`POST /users/:id/deactivate`), para conservar la auditoría. Respuesta 204; 409 si está vigente o referenciado.

**Códigos de estado:** 200/201/204; 400 validación; 401 sin sesión; 403 sin permiso; 404; 409 conflicto de estado; 413 archivo grande; 415 tipo no permitido; 422 regla de negocio; 429 límite de frecuencia; 502 falla de integración externa (con el sitio funcionando).

## Integraciones (solo ADMIN, con AuditLog; nunca devuelven secretos)

La configuración la carga el cliente desde el panel y se guarda cifrada (ADR-20). Los `GET` devuelven máscaras (`••••1234`), el estado, la dirección de redirección que debe registrar en su app de Meta, los permisos requeridos y la guía paso a paso (`setupSteps`).

| Método y ruta | Descripción |
|---|---|
| `GET /integrations/instagram` | `{ status: demo / credentials_saved / connected / expiring / error, statusLabel, demoMode, mode, source, appIdMasked, appSecretMasked, hasAccessToken, accessTokenMasked, username, connectedAt, tokenExpiresAt, lastSyncAt, lastSyncOk, lastError, hashtag, redirectUri, scopes, setupSteps }` |
| `PUT /integrations/instagram` | `{ mode?: 'demo' o 'real', appId?, appSecret?, hashtag?, accessToken? }` (el secreto omitido se conserva; 422 si pide modo real sin App ID y Secret) |
| `GET /integrations/instagram/connect` | `{ url }` de autorización OAuth (botón "Conectar con Instagram"); 422 si faltan credenciales |
| `GET /integrations/instagram/callback` | Destino de Meta: guarda el token cifrado y redirige a `/panel/configuracion?instagram=connected` o `error` |
| `POST /integrations/instagram/test` | "Probar conexión": `{ ok, demo, username, error }` |
| `POST /integrations/instagram/disconnect` | Borra credenciales y token; vuelve a modo demostración |
| `GET/PUT /integrations/mail` | `{ contactToEmail?, smtpUrl? (null quita el SMTP) }`; devuelve proveedor activo, origen y SMTP enmascarado |
| `POST /integrations/mail/test` | Envía un correo de prueba al destino de contacto (502 si falla) |

**Salud:** `GET /health` (y `/api/v1/health`) -> `{ status, api, db, integrations: { storage, mailer, instagram }, demoMode }`.

**Archivos locales:** `GET /files/<clave>?exp=&sig=` sirve archivos del almacenamiento local con URL firmada de corta duración (con `s3` las firma el proveedor).

**Usuarios (implementado):** `GET /users?page&pageSize&role&active&q`, `POST /users` (clave opcional; si falta se genera una temporal que se muestra una sola vez), `GET/PATCH /users/:id`, `POST /users/:id/deactivate`, `/activate` y `/reset-password`. No existe `DELETE`. No se puede desactivar a uno mismo ni al último administrador activo (422). Correo duplicado: 409 con `errors.email`.

**Autenticación (implementado):** `GET /auth/me` devuelve además `mustChangePassword` y `permissions`; con `mustChangePassword` toda otra ruta responde 403 con `reason: "password-change-required"`.

**Configuración pública (contrato para el agente de `/public/*`):** `GET /public/settings` debe devolver un objeto plano con las claves de `SETTING_KEYS` (`institution_name`, `institution_short`, `institution_subtitle`, `footer_text`, `address`, `phone`, `email_*`, `instagram_url`, `facebook_url`, `tagline`...), que la web usa para cabecera y pie (ADR-22).

## Bloque académico (implementado en `feat/academic`)

Los tipos exactos de cada respuesta están en `packages/shared/src/academic.ts` (`NoticeDto`, `TermDto`, `ScheduleDto`, `ExamCallDto`, `DocumentDto`, `Public*Dto`...). Resumen del contrato; cada módulo tiene su `README.md` en `apps/api/src/modules/<m>/`.

**Convenciones.** Fechas ISO 8601 UTC. Listados paginados `{ items, page, pageSize, total }` (`/terms` usa `pageSize` 50 por defecto; `/links` devuelve `{ items, total }` sin paginar). Errores Problem Details con `errors` por campo. Lo no vigente se calcula al consultar; nada se elimina solo.

**Avisos** — `NoticeDto`: `{ id, title, body, categoryId, category: {id,name}|null, audience, urgent, highlighted, status: 'ACTIVE'|'PAUSED', viewStatus: 'ACTIVE'|'PAUSED'|'EXPIRED', visibleNow, visibleFrom, visibleUntil|null, attachmentId, attachment: DocumentRefDto|null, authorId, createdAt, updatedAt }`. `GET /notices?status=ACTIVE|PAUSED|EXPIRED|ALL(default)&audience=&page=&pageSize=` (urgentes primero). `POST /notices/:id/resume` acepta `{ visibleUntil? }` (obligatorio si el aviso venció). `DELETE` solo pausado o vencido (409 si vigente o programado).

**Ciclos** — `TermDto`: `{ id, year, kind, label: "2026 · 2.º cuatrimestre", startsOn, endsOn, publicCurrent, counts: { schedules, examCalls } }`. `PATCH /terms/:id` (solo fechas). `PUT /terms/:id/public-current` (ADMIN) devuelve el `TermDto` ya público; idempotente.

**Horarios** — `ScheduleDto`: `{ id, termId, term: TermRefDto, commissionName, documentId, document: DocumentRefDto|null, notes, published, visibleNow, updatedBy, updatedAt }`. Publicar exige archivo (422). `DELETE` 409 si hoy se muestra.

**Llamados** — `ExamCallDto`: `{ id, termId, term, name, startsOn, endsOn, enrollmentOpen, highlighted, documentId, document, notes, published, visibleNow, updatedBy, updatedAt }`.

**Documentos** — `DocumentDto`: `{ id, title, filename, kind, category, cycleYear, termLabel, resolutionCode, mimeType, sizeBytes, status, archivedAt, restoredAt, uploadedBy, createdAt, usage: { notices, schedules, examCalls } }` (sin clave de almacenamiento). `GET /documents/:id` agrega `references: [{ type: 'notice'|'schedule'|'examCall', id, label, visible }]` y `visibleReferences`. `GET /documents/:id/file` -> `{ url, filename, mimeType }`. `POST /documents/:id/archive` con contenido visible adjunto responde 409 `{ ..., requiresConfirmation: true, references }`; reintentar con `{ "force": true }`. `DELETE` solo archivado y sin ninguna referencia.

**Ajustes** — `GET /settings` -> objeto plano con todas las claves (`null` si falta; `exam_enrollment_open` booleano). `PUT /settings` (ADMIN) parcial, devuelve el objeto completo.

**Contenido** — `GET /content/:page` -> `{ page, items: ContentSectionDto[] }`; `PUT /content/:page/:slug` (201 crea, 200 reemplaza); `DELETE` solo secciones ocultas. **Enlaces** — `LinkDto`: `{ id, title, url, description, group, order, visible }`; `DELETE` solo ocultos; un enlace `*.invalid` no puede mostrarse (422).

**Contacto** — `POST /public/contact` -> 201 `{ received: true }` (campo señuelo `website`; 5 envíos/hora por IP). Panel: `GET /contact-messages?status=&q=`, `PATCH /contact-messages/:id` `{ status }`, `DELETE` (ADMIN, solo respondidos).

**Público** — formas completas en `PublicHomeDto`, `PublicPublicationsDto`, `PublicPublicationDetailDto`, `PublicStudentsDto`, `PublicContentDto`, `PublicSettingsDto`. Cabecera `Cache-Control: public, max-age=20, s-maxage=30, stale-while-revalidate=30` (ajustes y contenido: 30/60/60). Los archivos llevan `downloadUrl` firmado (vigencia 30 min) o `null` si el almacenamiento falla.
