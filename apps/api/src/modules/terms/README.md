# Módulo `terms` — ciclos lectivos

Un ciclo es año + período (`FIRST`, `SECOND`, `EXTRAORDINARY`). Horarios y llamados cuelgan de un ciclo y **solo se ven en el sitio si su ciclo es el público** (RF06).

| Método y ruta                   | Permiso                         | Qué hace                                                                           |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /terms?page=&pageSize=`    | `terms:manage` (ADMIN, BEDELIA) | Lista (más nuevos primero) con contadores de horarios y llamados.                  |
| `GET /terms/:id`                | idem                            | Detalle.                                                                           |
| `POST /terms`                   | idem                            | `{ year, kind, startsOn?, endsOn? }`. Año + período únicos (409). Nace NO público. |
| `PATCH /terms/:id`              | idem                            | Solo fechas.                                                                       |
| `PUT /terms/:id/public-current` | `terms:setPublic` (ADMIN)       | Deja EXACTAMENTE un ciclo público. Idempotente.                                    |

## Cómo se garantiza "exactamente un ciclo público"

1. Índice único parcial en la base (`AcademicTerm_publicCurrent_unique`).
2. `setPublicTerm(tx, id)` (`terms.service.ts`): en una transacción apaga el anterior y enciende el nuevo; el orden importa porque el índice se verifica por sentencia.
3. La decisión (qué apagar) es una función pura, `planPublicTermChange`, con pruebas unitarias.
4. Si dos administradores compiten, la base frena a uno (P2002) y se responde 409.

No hay `DELETE`: los ciclos viejos son el archivo histórico. Auditoría: `term.create|update|set-public`.

## Probar

`pnpm --filter @ifts2/api exec vitest run test/api/terms.test.ts test/unit/public-term.test.ts`
