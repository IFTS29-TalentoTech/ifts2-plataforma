# Evidencia — Inscripciones: enlace de alumnos y estado efectivo (A07, A08)

Fecha: 2026-11-07. Rama `fix/inscripciones-siu-y-estado` (desde `develop` en `f0c236f`). Decisión: ADR-033.

| Verificación | Comando | Resultado |
| --- | --- | --- |
| Tipos (shared, API, web) | `pnpm typecheck` | Sin errores |
| Lint, formato, estilos y tokens | `pnpm lint` | Sin errores |
| Unitarias shared | `pnpm --filter @ifts2/shared test` | 50 aprobadas (2 nuevas de `effectiveExamEnrollmentOpen`) |
| Unitarias API | `pnpm --filter @ifts2/api exec vitest run --project unit` | 211 aprobadas |
| Integración API | `pnpm --filter @ifts2/api exec vitest run --project integration` | 324 aprobadas en 21 archivos (4 casos nuevos de A07/A08, 2 ajustados) |
| E2E Cypress (390 y 1440 px) | `pnpm e2e --build --spec cypress/e2e/public/estudiantes.cy.ts` | 14 aprobadas (caso nuevo A07 en ambos anchos) |

## Casos nuevos

- **A08, API:** con el interruptor general apagado ningún llamado figura abierto; encendido, solo el
  marcado y no terminado; la casilla guardada no cambia. El inicio (`/public/home`) aplica la misma regla.
- **A08, shared:** las cuatro combinaciones de interruptor general y casilla, más el borde de fin
  exclusivo (`now === endsOn` => cerrada).
- **A07, API:** `/public/students` informa `enrollment` por enlace y excluye los ocultos; el panel
  crea, marca y desmarca la opción y rechaza valores no booleanos (400).
- **A07, E2E:** "¿Dónde me inscribo?" no muestra "Gestión académica" y, sin enlace de alumnos
  publicado, avisa que está pendiente y ofrece el correo de Bedelía.

## Notas

- `pnpm test` dentro de `apps/api` falla antes de correr pruebas: Vitest 5 rechaza los proyectos
  `unit` e `integration` juntos porque tienen distinto `maxWorkers` y el mismo `sequence.groupOrder`.
  Ya pasaba antes de este cambio; se corrió cada proyecto por separado.
- Cypress borra `apps/web/cypress/screenshots/` (versionada) al empezar cada corrida; se restauró con
  `git restore` y no forma parte de este cambio.
