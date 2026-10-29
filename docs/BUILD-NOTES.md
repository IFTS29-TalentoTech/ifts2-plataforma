# Notas de construcción (leer junto con docs/specs/AGENTS.md)

Proyecto: plataforma web del IFTS N.° 2 (sitio público + panel). Equipo: Talento Tech. Las especificaciones están en `docs/specs/` y son la fuente de verdad para el comportamiento; el diseño visual está en `docs/design/` (capturas del Figma vigente al 18/10/2026).

## Entorno de desarrollo (Windows 10, Git Bash / PowerShell)

- Node 24, pnpm 11, Docker Desktop disponible. **No uses PostgreSQL local ni toques otros contenedores del equipo**: la base de desarrollo es un contenedor propio `ifts2-db` (postgres:17) definido en `docker-compose.yml`, expuesto en el puerto **5433** (el 5432 y otros pueden estar ocupados).
- `DATABASE_URL=postgresql://ifts2:ifts2@localhost:5433/ifts2` para desarrollo y `.../ifts2_test` para pruebas.
- Puertos: API 4000, web 3000.
- Sin acceso a internet de pago ni a credenciales reales: Instagram, correo y almacenamiento externo se implementan detrás de interfaces con implementación **falsa o local** (ver ADR-08, 09, 16). No inventes credenciales.

## Cambios posteriores a las especificaciones (prevalecen sobre ellas)

1. **El Figma incluye ahora el panel en móvil** (`docs/design/mobile/`, 13 pantallas y sus modales). El panel debe ser responsive, no solo "usable".
2. El menú público del Figma tiene el ítem **Administración** (acceso al panel). El cliente pidió (reunión del 06/10) separar **Ingreso** (aspirantes a la tecnicatura) de **Inscripciones** (alumnos: carreras y exámenes); implementarlo y registrar los nombres finales en `docs/specs/09-preguntas-abiertas.md`.
3. Paleta definida con el cliente: marrones (`docs/specs/design-tokens.json`). Las capturas de `docs/design/` son la referencia visual. Verificá contraste AA y corregí si hace falta, anotándolo.
4. Calendario académico y mesas se cargan **por archivo** con casilla "destacar"; picos de 300 a 400 concurrentes (RNF09).
5. Eliminación: manual, con confirmación, nunca automática (ver ADR-07). La consigna de la cátedra exige CRUD completo.

## Convenciones del repo

- pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`.
- Conventional commits; una rama por tarea cuando trabajen varios agentes; los agentes **no hacen push** a ningún remoto.
- Cada tarea cierra con pruebas y con el avance anotado en `docs/avance.md`.
- Evidencias de pruebas en `docs/evidencias/` (salidas y capturas con fecha).
