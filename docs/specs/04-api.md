# 04 · API REST

Base: `/api/v1`. JSON UTF-8. Fechas ISO 8601 en UTC. Autenticación por cookie de sesión en `/panel/*` y en toda ruta fuera de `/public/*`. Errores en formato Problem Details: `{ type, title, status, detail, errors? }`. Listados con `?page=1&pageSize=20` y respuesta `{ items, page, pageSize, total }`.

**Eliminación:** existen endpoints `DELETE`, pero son **manuales**, exigen confirmación en la interfaz, quedan en `AuditLog` y solo aplican a contenido no vigente (borrador, pausado, descartado, vencido o archivado); si el elemento está referenciado devuelven 409. Para sacar algo de circulación sin perderlo se usan `pause`, `archive`, `discard`.

## Permisos por rol (matriz inicial)

Esta matriz es el **punto de partida de la semilla**. La API no pregunta "¿sos ADMIN?": cada ruta exige un **permiso del catálogo** (`notices:manage`, `integrations:manage`, `roles:manage`...) y los permisos de cada rol son datos que el Superadministrador edita (RF11, ADR-18, ADR-031). Los roles de sistema son SUPERADMIN, ADMIN, BEDELIA y EDITOR; los tres últimos se pueden editar y eliminar, y SUPERADMIN no.

| Recurso | SUPERADMIN | ADMIN | BEDELIA | EDITOR | Público |
|---|---|---|---|---|---|
| Lectura del sitio (`/public/*`) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Resumen (`/dashboard`) | ✔ | ✔ | ✔ | ✔ | |
| Publicaciones y redes (moderar, crear, pausar) | ✔ | ✔ | | ✔ | |
| Avisos académicos | ✔ | ✔ | ✔ | | |
| Horarios y llamados a examen | ✔ | ✔ | ✔ | | |
| Archivo documental (ver, archivar, restaurar) | ✔ | ✔ | ✔ | | |
| Configuración del sitio (`settings:manage`) y cambio del ciclo público (`terms:setPublic`) | ✔ | ✔ | | | |
| Integraciones: Instagram y correo (`integrations:manage`) | ✔ | ✔ | | | |
| Usuarios (`users:manage`: crear, desactivar, asignar rol; un ADMIN no asigna SUPERADMIN ni roles con permisos que no tiene) | ✔ | ✔ | | | |
| Mensajes de contacto (ver y marcar) | ✔ | ✔ | ✔ | | |
| Eliminar mensajes de contacto (`contact:delete`, solo respondidos) | ✔ | ✔ | | | |
| Auditoría | ✔ | ✔ | | | |
| Eliminar (DELETE) contenido no vigente | ✔ | ✔ | Avisos, horarios, llamados y documentos propios de su área | Publicaciones propias y publicaciones sociales descartadas | |
| **Roles y permisos** (`roles:manage`: crear, editar y eliminar roles y asignar permisos; reservado a SUPERADMIN) | ✔ | | | | |

## Autenticación

| Método y ruta | Descripción |
|---|---|
| `POST /auth/login` | `{ email, password, remember }` → 204 y cookie; 401 con mensaje genérico; 429 al exceder intentos |
| `POST /auth/logout` | Cierra la sesión actual |
| `GET /auth/me` | Usuario, rol y lista de permisos efectivos de la sesión (la interfaz oculta lo que no puede usar) |
| `POST /auth/change-password` | `{ current, next }`; obligatorio tras un restablecimiento |

## Público (sin sesión, solo lectura, con reglas de vigencia aplicadas)

| Ruta | Devuelve |
|---|---|
| `GET /public/home` | Frase ancla (`tagline`), `examEnrollmentOpen`, accesos rápidos, hasta 6 publicaciones vigentes de sección HOME o BOTH, avisos destacados y llamados destacados del ciclo público |
| `GET /public/publications?year=&category=&archived=&page=&pageSize=` | Publicaciones vigentes de sección NEWS o BOTH; `?archived=true` para el histórico del año (incluye las programadas ya terminadas, A05) |
| `GET /public/publications/:id?archived=` | Detalle de una publicación vigente (o del histórico con `archived=true`) |
| `GET /public/students?audience=ALL|STUDENTS|ASPIRANTS|GRADUATES` | Ciclo público, `examEnrollmentOpen`, horarios y llamados publicados, avisos vigentes (con `audience` devuelve los de "todos" y los de ese destinatario) y enlaces de interés. Lo usan tres pantallas: **Estudiantes**, **Inscripciones** (alumnos: llamados con `enrollmentOpen` y enlaces con `enrollment`). `enrollmentOpen` de cada llamado es el estado **efectivo**: interruptor general + casilla del llamado + llamado no terminado (A08, ADR-033) e **Ingreso** (aspirantes, con `audience=ASPIRANTS`) |
| `GET /public/content/:page` | Secciones visibles de `institucional`, `carrera` o `ingreso` (Markdown ya sanitizado); otra página: 404. No existen `/public/ingreso` ni `/public/inscripciones`: Ingreso usa `content/ingreso` más `students?audience=ASPIRANTS`, e Inscripciones usa `students` |
| `GET /public/settings` | Datos institucionales visibles (nombre, sigla, pie, dirección, correos, teléfono, redes, frase ancla; ADR-22) |
| `POST /public/contact` | (Should) `{ name, email, subject, message, consent, website? }`; 201 `{ received: true }`; el consentimiento es obligatorio; anti-spam con campo señuelo `website` y 5 envíos por hora por IP (429), sin captcha externo (Q46); el mensaje se guarda siempre aunque falle el correo |

Cabecera de caché de todo `/public/*`: ver la última sección. Los ids y filtros inválidos responden 400 (Problem Details).

## Panel

**Resumen**
- `GET /dashboard` → `{ instagram: { mode, status, ok, lastSyncAt, error?, tokenExpiresAt?, hashtag }, pendingPosts, activeNotices, noticesExpiringIn7Days, currentTerm, examCallNext, ingresoCycle }` (**implementado**; forma exacta y reglas en `apps/api/src/modules/dashboard/README.md`: `currentTerm` y `examCallNext` pueden ser `null`; `ingresoCycle` es `{ year, derived: true }`)

**Publicaciones y redes**
- `POST /social/sync` → renueva el token si hace falta y sincroniza; `{ created, matched, alreadyKnown, demo, lastSyncAt, token }`. 422 sin hashtag configurado; 502 con mensaje claro si Instagram falla (**implementado**).
- `POST /social/cron` → tarea diaria para un cron externo; se autentica con el secreto `CRON_SECRET` (`X-Cron-Secret` o `Authorization: Bearer`), sin sesión; 403 si no hay secreto configurado, 401 si es incorrecto; responde 200 con `{ ok, token, sync }` aunque Instagram falle.
- `GET /social/posts?status=DETECTED|LINKED|DISCARDED&source=instagram|manual&page=&pageSize=` → `{ items, page, pageSize, total, counts: { DETECTED, LINKED, DISCARDED } }`
- `POST /social/posts/:id/approve` → `{ title?, summary?, section, categoryId?, visibleFrom?, visibleUntil?, consentConfirmed }` → crea la `Publication` PUBLISHED (origen INSTAGRAM), copia la imagen al almacenamiento propio y devuelve `201 { publication, post }`; `consentConfirmed` debe ser `true` (400 si no); 409 si ya estaba vinculada o está descartada; 502/422 si no se puede copiar la imagen (no se crea nada).
- `POST /social/posts/:id/discard`, `POST /social/posts/:id/restore`
- `POST /social/manual` → carga manual equivalente (contingencia).
- `GET /publications?status=&origin=&page=`, `POST /publications`, `GET/PATCH /publications/:id`
- `POST /publications/:id/pause`, `/publish`, `/schedule`, `/reactivate` (con nueva vigencia), `POST /publications/:id/cover` (multipart, sube la portada). Transiciones inválidas: 409. Cada publicación trae `visible` y `expired` (calculados con las reglas de vigencia) y `coverSrc` (URL lista para mostrar).
- `GET/POST /categories`, `PATCH/DELETE /categories/:id` (único por nombre y tipo; `DELETE` 409 si está en uso).

**Avisos académicos**
- `GET /notices?status=ACTIVE|PAUSED|EXPIRED|ALL&audience=&page=&pageSize=` → `{ items, page, pageSize, total, counts: { ALL, ACTIVE, PAUSED, EXPIRED } }` (los conteos respetan `audience`, no `status`), `POST /notices`, `GET/PATCH /notices/:id`
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
- `GET/POST/PATCH /links` (`enrollment: boolean`: enlace de inscripción de alumnos, el único que muestra `/inscripciones`; A07)
- `GET/POST/PATCH /users` (con `roleId`), `POST /users/:id/deactivate`, `POST /users/:id/reset-password`
- **Roles y permisos (solo SUPERADMIN, permiso `roles:manage`):** `GET /permissions` (catálogo agrupado por recurso), `GET/POST /roles`, `GET/PATCH/DELETE /roles/:id`, `PUT /roles/:id/permissions` (`{ permissions: string[] }`). `GET /roles` también lo pueden usar quienes tienen `users:manage` (por defecto ADMIN) para elegir el rol de un usuario (solo lectura). Reglas: el rol de sistema SUPERADMIN no se edita ni se elimina (409); los roles de sistema ADMIN, BEDELIA y EDITOR **sí se pueden editar y eliminar** (decisión del 06/11/2026); un rol con usuarios asignados no se elimina (409, también los de sistema); no se desactiva ni se cambia el rol del último SUPERADMIN activo (409); nombre de rol único (409); permisos que no existen en el catálogo o `roles:manage` (400). `POST/PATCH /users` devuelve 403 si un ADMIN asigna SUPERADMIN o un rol con permisos que él no tiene. `GET /permissions` devuelve cada permiso con su recurso y una etiqueta en español para la pantalla de roles. Todo queda en `AuditLog` (`role.create`, `role.update`, `role.delete`, `role.permissions`).
- `GET /audit?entity=&page=` (permiso `audit:read`)

**Eliminación (CRUD completo):** `DELETE /publications/:id`, `/social/posts/:id` (solo descartadas), `/notices/:id`, `/schedules/:id`, `/exam-calls/:id`, `/documents/:id` (solo archivados), `/links/:id`, `/content/:page/:slug` (solo secciones no estáticas), `/contact-messages/:id`, `/categories/:id` (409 si está en uso) y `/roles/:id` (permiso `roles:manage`; 409 si tiene usuarios o es SUPERADMIN). Los usuarios no se eliminan: se desactivan (`POST /users/:id/deactivate`), para conservar la auditoría. Respuesta 204; 409 si está vigente o referenciado.

**Lecturas por id disponibles además de las listadas:** `GET /terms/:id`, `/schedules/:id`, `/exam-calls/:id`, `/links/:id`, `/content/:page/:slug`, `/contact-messages/:id`; `PATCH /documents/:id` (metadatos); `GET /health`. `GET /settings` solo exige sesión (excepción documentada en Q127).

**Códigos de estado:** 200/201/204; 400 validación; 401 sin sesión; 403 sin permiso; 404; 409 conflicto de estado; 413 archivo grande; 415 tipo no permitido; 422 regla de negocio; 429 límite de frecuencia; 502 falla de integración externa (con el sitio funcionando).

## Integraciones (permiso `integrations:manage`, con AuditLog; nunca devuelven secretos)

Todas las rutas de `/integrations/*` exigen el permiso `integrations:manage` (ADMIN lo trae en la matriz inicial; SUPERADMIN siempre lo tiene). Sin él: 403.

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

**Eliminación de publicaciones:** `DELETE /publications/:id` solo en borrador, pausada o vencida; vigente o programada -> 409. Si venía de Instagram, la publicación de redes vuelve a pendiente.

**Salud:** `GET /health` (y `/api/v1/health`) -> `{ status, api, db, integrations: { storage, mailer, instagram }, demoMode }`.

**Archivos locales:** `GET /files/<clave>?exp=&sig=` sirve archivos del almacenamiento local con URL firmada de corta duración (con `s3` las firma el proveedor).

**Usuarios (implementado):** `GET /users?page&pageSize&role&active&q`, `POST /users` (clave opcional; si falta se genera una temporal que se muestra una sola vez), `GET/PATCH /users/:id`, `POST /users/:id/deactivate`, `/activate` y `/reset-password`. No existe `DELETE`. No se puede desactivar a uno mismo (422) ni al **último SUPERADMIN activo** (409; tampoco cambiarle el rol, 409). Ya no existe la regla del "último administrador": un ADMIN sí puede quedar sin otros ADMIN. La regla del último SUPERADMIN corre en transacción serializable (dos pedidos simultáneos no pueden dejar al sistema sin ninguno). Correo duplicado: 409 con `errors.email`.

**Autenticación (implementado):** `GET /auth/me` devuelve además `mustChangePassword` y `permissions`; con `mustChangePassword` toda otra ruta responde 403 con `reason: "password-change-required"`.

**Roles (implementado, ADR-031).**

- **Respuestas de usuarios.** `GET /auth/me` y las respuestas de `/users` traen `role` (la clave, por ejemplo `"BEDELIA"`), `roleId` y `roleName`.
- **`GET /roles`.** Devuelve `{ items }` con `id`, `key`, `name`, `description`, `isSystem`, `editable`, `userCount`, `permissions` y `assignable`. `assignable` indica si quien pregunta puede asignar ese rol.
- **`GET /permissions`.** Devuelve `{ groups, reserved }`.
- **Rol inexistente.** Un `roleId` que no existe responde 400 en `errors.roleId`.
- **Usuarios con más permisos.** Un ADMIN que intenta editar, desactivar, reactivar o restablecer la clave de un usuario con más permisos que él recibe 403 (Q126).

**Configuración pública (contrato para el agente de `/public/*`):** `GET /public/settings` debe devolver un objeto plano con las claves de `SETTING_KEYS` (`institution_name`, `institution_short`, `institution_subtitle`, `footer_text`, `address`, `phone`, `email_*`, `instagram_url`, `facebook_url`, `tagline`...), que la web usa para cabecera y pie (ADR-22).

## Bloque académico (implementado en `feat/academic`)

Los tipos exactos de cada respuesta están en `packages/shared/src/academic.ts` (`NoticeDto`, `TermDto`, `ScheduleDto`, `ExamCallDto`, `DocumentDto`, `Public*Dto`...). Resumen del contrato; cada módulo tiene su `README.md` en `apps/api/src/modules/<m>/`.

**Convenciones.** Fechas ISO 8601 UTC. Listados paginados `{ items, page, pageSize, total }` (`/terms` usa `pageSize` 50 por defecto; `/links` devuelve `{ items, total }` sin paginar). Errores Problem Details con `errors` por campo. Lo no vigente se calcula al consultar; nada se elimina solo.

**Avisos** — `NoticeDto`: `{ id, title, body, categoryId, category: {id,name}|null, audience, urgent, highlighted, status: 'ACTIVE'|'PAUSED', viewStatus: 'ACTIVE'|'PAUSED'|'EXPIRED', visibleNow, visibleFrom, visibleUntil|null, attachmentId, attachment: DocumentRefDto|null, authorId, createdAt, updatedAt }`. `GET /notices?status=ACTIVE|PAUSED|EXPIRED|ALL(default)&audience=&page=&pageSize=` (urgentes primero; responde también `counts` por estado calculado). `POST /notices/:id/resume` acepta `{ visibleUntil? }` (obligatorio si el aviso venció). `DELETE` solo pausado o vencido (409 si vigente o programado).

**Ciclos** — `TermDto`: `{ id, year, kind, label: "2026 · 2.º cuatrimestre", startsOn, endsOn, publicCurrent, counts: { schedules, examCalls } }`. `PATCH /terms/:id` (solo fechas). `PUT /terms/:id/public-current` (permiso `terms:setPublic`) devuelve el `TermDto` ya público; idempotente.

**Horarios** — `ScheduleDto`: `{ id, termId, term: TermRefDto, commissionName, documentId, document: DocumentRefDto|null, notes, published, visibleNow, updatedBy, updatedAt }`. Publicar exige archivo (422). `DELETE` 409 si hoy se muestra.

**Llamados** — `ExamCallDto`: `{ id, termId, term, name, startsOn, endsOn, enrollmentOpen, highlighted, documentId, document, notes, published, visibleNow, updatedBy, updatedAt }`.

**Documentos** — `DocumentDto`: `{ id, title, filename, kind, category, cycleYear, termLabel, resolutionCode, mimeType, sizeBytes, status, archivedAt, restoredAt, uploadedBy, createdAt, usage: { notices, schedules, examCalls } }` (sin clave de almacenamiento). `GET /documents/:id` agrega `references: [{ type: 'notice'|'schedule'|'examCall', id, label, visible }]` y `visibleReferences`. `GET /documents/:id/file` -> `{ url, filename, mimeType }`. `POST /documents/:id/archive` con contenido visible adjunto responde 409 `{ ..., requiresConfirmation: true, references }`; reintentar con `{ "force": true }`. `DELETE` solo archivado y sin ninguna referencia.

**Ajustes** — `GET /settings` -> objeto plano con todas las claves (`null` si falta; `exam_enrollment_open` booleano). `PUT /settings` (permiso `settings:manage`) parcial, devuelve el objeto completo.

**Contenido** — `GET /content/:page` -> `{ page, items: ContentSectionDto[] }`; `PUT /content/:page/:slug` (201 crea, 200 reemplaza); `DELETE` solo secciones ocultas. **Enlaces** — `LinkDto`: `{ id, title, url, description, group, order, visible }`; `DELETE` solo ocultos; un enlace `*.invalid` no puede mostrarse (422).

**Contacto** — `POST /public/contact` -> 201 `{ received: true }` (campo señuelo `website`; 5 envíos/hora por IP). Panel: `GET /contact-messages?status=&q=`, `PATCH /contact-messages/:id` `{ status }`, `DELETE` (permiso `contact:delete`: solo ADMIN, solo respondidos; BEDELIA recibe 403).

**Público** — formas completas en `PublicHomeDto`, `PublicPublicationsDto`, `PublicPublicationDetailDto`, `PublicStudentsDto`, `PublicContentDto`, `PublicSettingsDto`. Cabecera `Cache-Control: public, max-age=20, s-maxage=30, stale-while-revalidate=30` (ajustes y contenido: 30/60/60). Los archivos llevan `downloadUrl` firmado (vigencia 30 min) o `null` si el almacenamiento falla.
