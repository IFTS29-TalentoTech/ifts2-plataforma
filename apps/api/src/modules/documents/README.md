# Módulo `documents` — archivo documental y adjuntos

Repositorio de archivos (RF03; US-16..18). ADMIN y BEDELIA (`documents:manage`, `documents:delete`).

| Método y ruta                                      | Qué hace                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /documents` (multipart)                      | Campo `file` + `title`, `kind`, `category`, `cycleYear`, `termLabel`, `resolutionCode`. 415/413 según tipo/tamaño.                            |
| `GET /documents?q=&kind=&cycleYear=&status=&page=` | `q` busca en título, nombre de archivo, categoría, código de resolución y año (si son 4 dígitos).                                             |
| `GET /documents/:id`                               | Detalle + `references` (qué avisos, horarios y llamados lo usan, y cuáles se ven hoy).                                                        |
| `GET /documents/:id/file`                          | `{ url, filename, mimeType }` con URL firmada de corta duración.                                                                              |
| `PATCH /documents/:id`                             | Solo metadatos (para otro archivo se sube otro documento).                                                                                    |
| `POST /documents/:id/archive`                      | `ARCHIVED` + `archivedAt`. Si está adjunto a algo visible: 409 con `requiresConfirmation` y `references`; reintentar con `{ "force": true }`. |
| `POST /documents/:id/restore`                      | `ACTIVE` + `restoredAt`.                                                                                                                      |
| `DELETE /documents/:id`                            | 204 solo si está ARCHIVADO y **ningún** aviso/horario/llamado lo referencia (409 + `references`). Borra también el archivo físico.            |

## Decisiones

- Carga: `uploadSingle()` + `storeUpload()` de `infra/storage` (firma real del archivo, 10 MB PDF / 5 MB imagen, imágenes a WebP 1600 px, clave aleatoria). La clave **nunca** sale en una respuesta.
- Almacenamiento caído al subir: 502 y ninguna fila a medias. Si falla la base tras guardar el archivo, el archivo se borra.
- Archivar con `force` deja el adjunto enlazado: el contenido visible sigue funcionando; solo sale del Archivo activo.
- `DELETE` bloquea ante CUALQUIER referencia (no solo vigentes): la clave foránea es `SET NULL` y sin esta regla se perderían adjuntos en silencio.
- Auditoría: `document.create|update|archive|restore|delete`.

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/documents.test.ts`
