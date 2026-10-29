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
