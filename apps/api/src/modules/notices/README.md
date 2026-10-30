# Módulo `notices` — avisos académicos

Cartelera oficial del instituto (RF03, RF06; US-11, US-36). Permisos: `notices:manage` y `notices:delete` (ADMIN y BEDELIA).

| Método y ruta                                    | Qué hace                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `GET /notices?status=&audience=&page=&pageSize=` | `status`: `ACTIVE`, `PAUSED`, `EXPIRED` o `ALL` (por defecto). Urgentes primero.                 |
| `POST /notices`                                  | Crea un aviso ACTIVO. 422 si la categoría no es de avisos o el adjunto no existe/está archivado. |
| `GET /notices/:id`, `PATCH /notices/:id`         | Detalle y edición parcial (la vigencia se valida contra lo ya guardado).                         |
| `POST /notices/:id/pause`                        | Lo saca del sitio sin perderlo. 409 si ya estaba pausado.                                        |
| `POST /notices/:id/resume`                       | Reanuda un pausado o reactiva un vencido. Body `{ visibleUntil? }` (obligatorio si venció).      |
| `DELETE /notices/:id`                            | 204. **Solo** pausado o vencido; vigente (o programado a futuro) responde 409.                   |

## Reglas

- **EXPIRED no se guarda.** Se guarda `status` (`ACTIVE` | `PAUSED`) y `visibleUntil`; el JSON trae `viewStatus` calculado (`PAUSED` gana sobre `EXPIRED`) y `visibleNow`.
- Fechas dadas como día (`2026-11-25`) se interpretan en Buenos Aires: el inicio es 00:00 y el fin 23:59:59.999. `visibleFrom` es inclusivo y `visibleUntil` exclusivo.
- Nada se elimina solo. `DELETE` es manual, queda en `AuditLog` (`notice.delete`) y el adjunto (`Document`) no se toca.
- Auditoría: `notice.create|update|pause|resume|reactivate|delete`.

## Archivos

- `index.ts`: rutas. `notices.service.ts`: serializador (`toNoticeDto`), filtros SQL equivalentes a las funciones de vigencia de `@ifts2/shared`, elegibilidad de borrado.
- Forma de la respuesta: `NoticeDto` en `packages/shared/src/academic.ts`.

## Probar

`pnpm --filter @ifts2/api exec vitest run test/api/notices.test.ts`
