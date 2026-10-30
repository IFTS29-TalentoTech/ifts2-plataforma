# Módulo `publications` — Novedades y eventos

Implementa **RF03** (vigencia y archivo) y **US-08 a US-10**. Montado en `/api/v1/publications`. Permisos: `publications:manage` (ver, crear, editar, cambiar estado) y `publications:delete` — EDITOR y ADMIN; BEDELIA no.

## Endpoints

| Método y ruta                                          | Descripción                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /publications?status=&origin=&q=&page=&pageSize=` | Listado paginado (más nuevas primero). Cada ítem trae `visible` y `expired` calculados.                                             |
| `POST /publications`                                   | Crea una publicación **MANUAL en borrador**.                                                                                        |
| `GET /publications/:id` · `PATCH /publications/:id`    | Detalle y edición.                                                                                                                  |
| `POST /publications/:id/cover`                         | Sube la portada (multipart, campo `file`; JPG/PNG/WebP, se guarda como WebP de hasta 1600 px).                                      |
| `POST /publications/:id/publish`                       | `DRAFT`/`SCHEDULED` -> `PUBLISHED`.                                                                                                 |
| `POST /publications/:id/schedule`                      | `{ visibleFrom (futura), visibleUntil? }` desde `DRAFT`/`PAUSED` -> `SCHEDULED`.                                                    |
| `POST /publications/:id/pause`                         | `PUBLISHED`/`SCHEDULED` -> `PAUSED` (sale de circulación, no se pierde).                                                            |
| `POST /publications/:id/reactivate`                    | `{ visibleFrom?, visibleUntil? }` desde `PAUSED` o **vencida** -> `PUBLISHED`. Una vencida exige nueva fecha de fin futura (`422`). |
| `DELETE /publications/:id`                             | Eliminación **manual**: solo borrador, pausada o vencida (`204`). Vigente o programada -> `409`.                                    |

Las transiciones no válidas devuelven `409` con un mensaje que orienta ("usá reactivar…").

## Reglas

- **La visibilidad se calcula al consultar** con `isPublicationVisible` de `@ifts2/shared` (estado + `visibleFrom`/`visibleUntil`). No hay tareas que oculten ni borren contenido (ADR-07). "Vencida" no es un estado: es `expired: true`.
- **Toda mutación se audita** (`publication.create|update|cover|publish|pause|schedule|reactivate|delete`).
- **Portada** (`coverUrl`): es una dirección `http(s)` **o** una clave del almacenamiento (`covers/...`, `social/...`). Por el cuerpo solo se aceptan direcciones web; las claves se asignan subiendo el archivo o aprobando una publicación de Instagram (así nadie apunta a un archivo ajeno). El panel usa `coverSrc` (URL lista para `<img>`, las firmadas vencen). **El módulo público debe resolver `coverUrl` con `resolveCoverSrc` de `lib/cover.ts`.**
- **Eliminar una publicación que vino de Instagram** devuelve la publicación de redes a _pendiente_ (se puede aprobar de nuevo o descartar) y borra la imagen copiada.

## Cómo probar

```bash
pnpm --filter @ifts2/api exec vitest run test/api/publications.test.ts
```

Factories: `createPublicationRow` en `test/helpers/social-factories.ts`.
