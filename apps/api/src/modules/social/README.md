# Módulo `social` — redes sociales (Instagram)

Implementa **RF04** (moderación de redes), **ADR-09** (integración con Instagram) y las historias **US-07 a US-10**. Montado en `/api/v1/social`.

## Qué hace

Trae las publicaciones de Instagram que llevan el hashtag configurado, las deja **pendientes** (`DETECTED`) y un usuario del panel decide: **aprobar** (se crea una `Publication` PUBLISHED y se copia la imagen a nuestro almacenamiento), **descartar** o **restaurar**. Si Instagram falla, existe la **carga manual**.

```
DETECTED --approve--> LINKED            (crea Publication PUBLISHED, origen INSTAGRAM)
DETECTED --discard--> DISCARDED --restore--> DETECTED
DISCARDED --DELETE--> (se elimina; solo manual, auditado)     LINKED nunca se elimina
```

## Endpoints

| Método y ruta                                 | Permiso               | Descripción                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /social/sync`                           | `social:moderate`     | Renueva el token si hace falta y sincroniza. `200 { created, matched, alreadyKnown, demo, lastSyncAt, lastFetchAt, mode, fullReason, since, token }`; `?full=true` fuerza la carga completa (ver Sincronización incremental). `422` sin hashtag o sin cuenta configurada; `502` si Instagram falla (mensaje claro, el resto sigue andando). Limitado a 6/min. |
| `GET /social/posts?status=&page=&pageSize=`   | `social:moderate`     | Listado paginado (más nuevas primero) con `counts` por estado.                                                                                                                                                                                                                                                                                                |
| `POST /social/posts/:id/approve`              | `social:moderate`     | `{ title?, summary?, section, categoryId?, visibleFrom?, visibleUntil?, consentConfirmed: true }` -> `201 { publication, post }`. `409` si ya estaba vinculada o descartada.                                                                                                                                                                                  |
| `POST /social/posts/:id/discard` · `/restore` | `social:moderate`     | Cambian el estado (`409` si no corresponde).                                                                                                                                                                                                                                                                                                                  |
| `POST /social/manual`                         | `social:moderate`     | Contingencia: `{ permalink, caption, mediaUrl, postedAt }` -> `201` post pendiente. `409` si el enlace ya está cargado.                                                                                                                                                                                                                                       |
| `DELETE /social/posts/:id`                    | `social:delete`       | Solo `DISCARDED` (`204`); `409` si está pendiente o vinculada.                                                                                                                                                                                                                                                                                                |
| `POST /social/cron`                           | secreto `CRON_SECRET` | Tarea diaria (ver abajo). Sin sesión.                                                                                                                                                                                                                                                                                                                         |

## Reglas de negocio (y dónde están)

- **Hashtag**: solo se importan publicaciones cuya leyenda contiene el hashtag de `SiteSetting.instagram_hashtag` (completo, sin distinguir mayúsculas ni acentos). Lógica en `infra/instagram/hashtag.ts`, con pruebas unitarias.
- **Idempotencia**: `externalId` es único; sincronizar dos veces (o dos a la vez) no duplica. Las ya moderadas conservan su estado; a las pendientes se les refresca la URL de la imagen porque **las URLs de Instagram expiran** (`sync.service.ts`).
- **Sincronización incremental (ADR-038)**: cada fetch exitoso guarda en `IntegrationConfig` (clave `instagram_sync`, cifrada, sin secretos) `lastFetchAt`, la marca `coveredUntil`, `mode`, `count` y la identidad (`accountId` de `/me?fields=id`, hashtag, método de conexión). La siguiente sincronización pide solo lo posterior a la marca menos 6 h (más las pendientes de hasta 14 días, para refrescar su imagen) y corta la paginación al ver una publicación más vieja (`since` lo aplica el cliente, no la Graph API: ver ADR-038). Es **completa** la primera vez, con `?full=true` y si cambia la cuenta, el hashtag o el método. Un fetch fallido no avanza la marca. Cálculo puro en `sync-window.ts` (con pruebas unitarias). Cron y planificador siempre incrementales. En el panel: botón "Sincronización completa" (Publicaciones, con confirmación) y "Último fetch exitoso" (Publicaciones, Resumen y Configuración).
- **Aprobación humana**: nada llega al sitio sin `approve`. El consentimiento para imágenes de estudiantes (Ley 25.326) debe venir como `consentConfirmed: true` explícito y queda en la auditoría.
- **Imagen**: al aprobar se descarga y se guarda en `req.ctx.storage` (clave `social/<uuid>.webp`, ver `lib/cover.ts`). Si la descarga falla no se crea nada (queda pendiente). La descarga bloquea direcciones internas (SSRF, `infra/media-download.ts`). En modo demostración (`*.invalid`) se usa una imagen neutra generada.
- **Carrera entre moderadores**: los cambios de estado son condicionales; si dos personas aprueban a la vez, una recibe `409` y no queda una imagen huérfana.
- **Degradación**: un fallo de Instagram responde `502`, guarda `lastSyncOk=false` + motivo (lo muestra el Resumen) y nunca afecta al resto de la API ni al sitio público.
- **Secretos**: ni el token ni el App Secret salen en respuestas, logs ni auditoría.

## Token de larga duración y tareas diarias

- `token.service.ts`: el token dura ~60 días y solo se puede renovar mientras no venció. Se renueva cuando faltan **10 días o menos** (~50 días de vida) en cada sincronización y en la tarea diaria. Si ya venció, queda el aviso "Volvé a conectar la cuenta" en el Resumen.
- `jobs.ts` → `runSocialJob`: renueva el token y sincroniza (en modo demostración o sin hashtag la sincronización se omite). Se dispara de dos formas, **ambas opcionales** (la vigencia se calcula al consultar, así que si no corre no se rompe nada):
  1. **Cron externo** (recomendado en hosting gratuito): `curl -X POST -H "X-Cron-Secret: $CRON_SECRET" https://<api>/api/v1/social/cron` una vez por día (también acepta `Authorization: Bearer <secreto>`). Sin `CRON_SECRET` el endpoint responde 403. Responde `200` con `ok: true|false` y el detalle aunque Instagram falle.
  2. **Planificador interno**: `SOCIAL_SCHEDULER_ENABLED=true` (y `SOCIAL_SYNC_INTERVAL_HOURS`, 24 por defecto). Se arranca en `server.ts`.

## Cómo probar

```bash
pnpm --filter @ifts2/api exec vitest run test/api/social.test.ts test/unit/instagram-graph.test.ts test/unit/social-pure.test.ts
```

No hay credenciales reales: las pruebas levantan un **servidor HTTP simulado** (`test/helpers/instagram-mock.ts`) y le redirigen todo el `fetch` saliente (`createTestApp({ fetch: mock.fetch })`). Para ejercitar el cliente real: `createTestApp({ useRealIntegrationResolution: true, fetch })` + `ctx.integrations.set('instagram', { mode: 'real', ... })`.

**Pendiente de verificar con la API real**: la prueba de concepto con una cuenta profesional real (ADR-09) la hace el equipo cuando el cliente cree su app de Meta; los endpoints y formatos siguen la documentación de Meta pero solo se probaron con respuestas simuladas.
