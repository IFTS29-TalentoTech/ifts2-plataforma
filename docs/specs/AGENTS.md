# AGENTS.md — Instrucciones para el agente que implementa el MVP

Sos el agente de desarrollo de **Talento Tech** y vas a construir el MVP del sitio institucional del **IFTS N.° 2 DE 20** (sitio público + panel de gestión) en un repositorio nuevo. Todo lo necesario para decidir está en la carpeta `especificaciones/`. **No programes nada que no esté especificado sin dejarlo anotado** en `especificaciones/09-preguntas-abiertas.md` del repo nuevo.

## Cómo empezar

1. Leé en este orden: `README.md` → `especificaciones/00-vision-y-alcance.md` → `01-requerimientos.md` → `02-decisiones-tecnicas.md` → `03-arquitectura-y-estructura.md` → `04-api.md` → `05-ui-y-pantallas.md` → `06-testing-y-calidad.md` → `07-backlog-y-plan.md` → `08-contenido-y-datos-semilla.md` → `09-preguntas-abiertas.md` → `10-entregables-etapa-3.md`.
2. Copiá `especificaciones/` al repo nuevo (por ejemplo en `docs/specs/`) y usala como fuente de verdad.
3. Seguí el plan de `07-backlog-y-plan.md` por fases. No avances de fase sin cumplir la definición de terminado.

## Reglas no negociables

1. **Desarrollo a medida.** La cátedra descartó WordPress y cualquier CMS de terceros. No uses uno.
2. **Nada se borra de forma automática ni sin confirmar.** El contenido vencido se archiva o se pausa solo; jamás se elimina por tarea programada. La **eliminación es siempre manual**, con diálogo de confirmación, solo para roles autorizados, solo sobre contenido en borrador, pausado, descartado, vencido o archivado, y queda en `AuditLog`. La consigna de la cátedra exige un CRUD completo con confirmación antes de eliminar (ver `especificaciones/10-entregables-etapa-3.md`).
3. **La vigencia se calcula al consultar** (estado + fechas `visibleFrom` / `visibleUntil`). No dependas de tareas programadas para ocultar contenido.
4. **Nada de redes llega al sitio sin aprobación humana.** Una publicación de Instagram queda `DETECTED` hasta que un usuario del panel la aprueba.
5. **El sitio sigue funcionando si fallan Instagram, el correo o el almacenamiento externo.** Esas integraciones van detrás de interfaces y con alternativa manual.
6. **Interfaz en español rioplatense (es-AR)**, tono institucional, voseo en los textos de ayuda ("Elegí…", "Consultá…") como en el Figma.
7. **Colores y tipografía solo desde `especificaciones/design-tokens.json`.** No inventes colores. Si el contraste no cumple WCAG 2.2 AA, ajustalo y anotalo.
8. **Accesibilidad AA y datos personales** (Ley 25.326) son requerimientos, no extras: ver RNF07 y RNF08.
9. **Seguridad:** contraseñas con argon2id, sesiones en cookie `httpOnly` + `Secure` + `SameSite=Lax`, validación de todo input con zod, secretos solo en variables de entorno, nunca en el repo.
10. **No inventes contenido institucional.** Usá `08-contenido-y-datos-semilla.md`. Los textos de ejemplo del Figma son provisorios y se marcan como tales.

## Cómo resolver conflictos entre fuentes

- **Aspecto visual:** manda el Figma (`especificaciones/05-ui-y-pantallas.md` indica los nodos).
- **Comportamiento, datos y reglas de negocio:** mandan estas especificaciones.
- **Algo no definido en ninguno:** elegí la opción más simple y reversible, documentala en una decisión (`docs/decisiones/ADR-nnn.md`) y seguí.
- **Contradicción entre un RF y el Figma:** no lo resuelvas en silencio; registralo en `09-preguntas-abiertas.md`.

## Convenciones de trabajo

- Monorepo `pnpm`; TypeScript estricto en todo; ESLint y Prettier; commits convencionales (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Una rama por historia (`feat/US-12-moderar-publicacion`), pull request pequeño, revisión antes de integrar.
- Cada historia de usuario se cierra con pruebas (ver `06-testing-y-calidad.md`) y su criterio de aceptación verificado.
- Migraciones de base de datos siempre con Prisma Migrate; nunca editar la base a mano.
- Los datos semilla (`prisma/seed.ts`) deben permitir levantar un entorno de demostración completo con un solo comando.

## Definición de terminado (DoD)

- Cumple los criterios de aceptación de la historia (Gherkin en `01-requerimientos.md`).
- Tests unitarios y de API en verde; escenario E2E de Cypress asociado en verde.
- Sin errores de lint, tipos ni accesibilidad automática (axe) en las pantallas tocadas.
- Responsive verificado a 390 px y 1440 px.
- Documentación actualizada (README del repo, variables de entorno, ADR si hubo decisión).
- Registro en `AuditLog` en toda mutación de contenido.

## La entrega de la cátedra

La Etapa 3 de la materia (consigna en `consigna/Etapa 3 - Desarrollo completo.pdf` del repo del equipo) exige una aplicación funcional **más** Manual Técnico, Manual de Usuario, evidencia de pruebas unitarias y de integración, base de datos con CRUD completo e instrucciones de instalación que permitan a un docente ejecutarla. Todo eso está bajado a tareas en `especificaciones/10-entregables-etapa-3.md`. Guardá evidencias (capturas, salidas de pruebas) a medida que avanzás: no se pueden reconstruir al final.

- Mantené `docs/avance.md` con tareas completadas y pendientes, dificultades y soluciones: sirve de registro del avance. Una rama por funcionalidad y commits con mensajes significativos (también se evalúan).

## Qué entregar al terminar cada fase

Un resumen corto: qué quedó hecho, qué queda pendiente, qué decisiones tomaste, qué preguntas abiertas sumaste. El equipo humano (Martín Juan es el canal con el cliente) resuelve las preguntas con el instituto.
