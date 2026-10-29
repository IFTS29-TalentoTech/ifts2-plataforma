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

## Reglas de la fundación (obligatorias para todos los agentes)

1. **Integraciones configurables** (ADR-020). Instagram y correo los configura **el cliente desde el panel** (se guardan cifrados en `IntegrationConfig`; las variables de entorno son solo valores por defecto). Almacenamiento: por entorno (`STORAGE_PROVIDER=local|memory|s3`). Siempre se usan las fábricas del contexto (`req.ctx.storage`, `await req.ctx.getMailer()`, `await req.ctx.getInstagramClient()`), que se resuelven en cada uso. Sin configuración real, todo opera en modo demostración y `GET /health` lo informa (`demoMode`). Ningún secreto sale en una respuesta, un log ni la auditoría.
2. **Colores y tipografías solo por variables CSS** (ADR-021). Prohibido escribir hex, `rgb()` o nombres de fuente en componentes o páginas: se usan las clases del tema Tailwind. Fuente única de valores: `docs/specs/design-tokens.json` -> `pnpm tokens` -> `apps/web/src/styles/tokens.css`. `pnpm lint` falla si se rompe la regla.
3. **Producto genérico** (ADR-022). No escribir "IFTS N.° 2" ni textos institucionales en el código: nombre, sigla, pie, contactos, redes y hashtag salen de `SiteSetting`/`ContentSection` (`GET /public/settings`). Los valores del IFTS están solo en la semilla.
4. **Un módulo de API = una carpeta** `apps/api/src/modules/<nombre>/index.ts` con `{ mountPath, router }` (autodescubrimiento; no se editan archivos compartidos). Una página = su `page.tsx` bajo `src/app/...` (placeholders ya creados).
5. Toda mutación audita (`audit.fromReq`), todo input se valida con zod de `@ifts2/shared`, toda confirmación usa el `ConfirmDialog` único.
6. Puertos: API 4000, web 3000 (`PORT=3100` si está ocupado y ajustar `APP_ORIGIN`). Base de desarrollo `ifts2-db` en 5433.

## Comentarios y documentación (el proyecto lo va a tomar otro grupo de estudiantes)

7. **Comentá mientras avanzás, en español, el porqué y las reglas de negocio** (no lo obvio). Cabecera breve en cada módulo o archivo clave: qué hace, de qué depende y qué regla de la spec implementa (por ejemplo "RF03: la vigencia se calcula al consultar, nunca se borra automáticamente"). Comentá las decisiones no evidentes: seguridad, vigencia, cifrado, qué pasa cuando falla Instagram o el correo. Usá JSDoc/TSDoc en las funciones públicas de `packages/shared` y de los servicios. Nada de comentarios redundantes ("incrementa i").
8. **Dejá la documentación al día cuando agregues algo**: el README del paquete (`apps/api`, `apps/web`, `packages/shared`) si cambia cómo se usa; `.env.example` si hay variables nuevas; `docs/specs/04-api.md` si hay endpoints; `docs/ARQUITECTURA.md` si hay un módulo o servicio nuevo; un ADR en `docs/decisiones/` si decidiste algo; una entrada en `docs/avance.md`; y el README raíz si cambia la instalación, los comandos o los problemas frecuentes. Un README desactualizado cuenta como tarea incompleta.
9. Pensá en quien llega sin contexto: nombres claros, ejemplos mínimos en los README, y nada que dependa de "lo sabe el equipo".
