# Evidencia — Tarjeta "Ingreso" del Resumen con datos verificables (A14)

Fecha: 2026-11-07. Rama `fix/indicador-ingreso` (desde `develop` en `f0c236f`). Decisión: ADR-034.

| Verificación | Comando | Resultado |
| --- | --- | --- |
| Tipos (shared, API, web) | `pnpm typecheck` | Sin errores |
| Lint, formato, estilos y tokens | `pnpm lint` | Sin errores |
| Unitarias shared | `pnpm --filter @ifts2/shared test` | 50 aprobadas en 3 archivos (`content.test.ts` nuevo) |
| Unitarias API | `pnpm --filter @ifts2/api exec vitest run --project unit` | 211 aprobadas |
| Integración API | `pnpm --filter @ifts2/api exec vitest run --project integration` | 321 aprobadas en 21 archivos (1 caso nuevo de A14, 1 ajustado) |
| E2E Cypress (390 y 1440 px, axe) | `pnpm e2e --build --spec cypress/e2e/panel-a/resumen-ingreso.cy.ts,cypress/e2e/panel-a/publicaciones.cy.ts` | 14 aprobadas (4 nuevas en `resumen-ingreso.cy.ts`) |

## Casos nuevos

- **API:** `ingresoContent` cuenta solo las secciones visibles de Ingreso (no las ocultas ni las de
  otra página) y detecta la marca `[a confirmar ...]` sin distinguir mayúsculas.
- **Shared:** `hasPendingConfirmation` reconoce la marca y no la confunde con texto común
  ("Vas a confirmar…", "[a confirmarse]").
- **E2E:** con la semilla demo, la tarjeta muestra "A confirmar", aclara que el año es estimado y no
  dice "preinscripción activa", sin errores de axe. Sin contenido publicado (respuesta interceptada),
  muestra "Sin publicar".

## Notas

- La primera versión del E2E interceptado falló por la caché HTTP (ETag/304) de `/dashboard`. Se quitó
  `If-None-Match` y la respuesta alterada se marca `no-store`.
- Cypress borra `apps/web/cypress/screenshots/` (versionada) al correr; se restauró con `git restore`.
