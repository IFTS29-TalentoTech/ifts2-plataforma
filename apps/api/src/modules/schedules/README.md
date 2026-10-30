# Módulo `schedules` — horarios por comisión

Horarios de cursada con la grilla como archivo adjunto (un `Document`). ADMIN y BEDELIA (`schedules:manage`, `schedules:delete`).

| Método y ruta                               | Qué hace                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /schedules?termId=&published=&page=`   | Lista (sin `termId`, todos los ciclos).                                              |
| `POST /schedules`                           | `{ termId, commissionName, documentId?, notes? }`. Nace sin publicar.                |
| `GET/PATCH /schedules/:id`                  | Detalle / edición parcial.                                                           |
| `POST /schedules/:id/publish`, `/unpublish` | 409 si ya estaba en ese estado. **Publicar exige archivo** (422 sin `documentId`).   |
| `DELETE /schedules/:id`                     | 204 si NO se muestra hoy (no publicado, o su ciclo ya no es el público); si no, 409. |

Reglas: nombre de comisión único por ciclo (409, sin distinguir mayúsculas); el adjunto debe existir y estar ACTIVO; un horario publicado no puede quedarse sin archivo. `visibleNow` en la respuesta usa `isScheduleVisible` de `@ifts2/shared`. Auditoría: `schedule.create|update|publish|unpublish|delete`.

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/schedules-exam-calls.test.ts`
