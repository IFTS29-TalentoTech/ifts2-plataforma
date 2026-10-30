# Módulo `exam-calls` — llamados a examen / mesas

ADMIN y BEDELIA (`examCalls:manage`, `examCalls:delete`).

| Método y ruta                                | Qué hace                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /exam-calls?termId=&published=&page=`   | Lista por fecha de inicio ascendente.                                                                        |
| `POST /exam-calls`                           | `{ termId, name, startsOn, endsOn, enrollmentOpen?, highlighted?, documentId?, notes? }`. Nace sin publicar. |
| `GET/PATCH /exam-calls/:id`                  | Detalle / edición parcial (las fechas se validan contra las guardadas).                                      |
| `POST /exam-calls/:id/publish`, `/unpublish` | 409 si ya estaba en ese estado.                                                                              |
| `DELETE /exam-calls/:id`                     | 204 si NO se muestra hoy; 409 si está publicado en el ciclo público.                                         |

Reglas: nombre único por ciclo; `highlighted` ("destacar", reunión del 06/10) resalta el llamado hasta su fecha de fin; `enrollmentOpen` marca inscripción abierta; el adjunto es opcional pero debe estar ACTIVO. Las fechas como día se guardan 00:00 / 23:59:59.999 hora de Buenos Aires. Auditoría: `exam-call.create|update|publish|unpublish|delete`.

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/schedules-exam-calls.test.ts`
