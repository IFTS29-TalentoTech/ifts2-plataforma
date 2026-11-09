# Módulo `links` — enlaces de interés

Accesos directos (SIU Guaraní, Aulas virtuales, Mi Argentina, Tutoría; RF07). Solo ADMIN (`links:manage`, `links:delete`).

- `GET /links?visible=` — `{ items: LinkDto[], total }` (incluye ocultos), por orden (ADR-039).
- `POST /links`, `GET/PATCH /links/:id`.
- `PUT /links/order` — `{ ids }` con TODOS los enlaces en el orden deseado (409 si la lista cambió). Audita `link.order`.
- `DELETE /links/:id` — 204 solo si está oculto; visible => 409.

Lugares donde se muestra (ADR-039): `showHome` (Inicio), `showStudents` (Estudiantes) y `enrollment` (Inscripciones). `group` ya no se edita ni se usa.

Campo `enrollment` (A07, ADR-033): marca el enlace donde se inscriben los **alumnos**. La página pública `/inscripciones` muestra solo los enlaces visibles con esta marca; nunca deduce el destino por el título (hay un "SIU Guaraní" para profesores y secretaría).

Reglas: título único (sin distinguir mayúsculas, 409). Un enlace con URL provisoria (`*.invalid`, los "a confirmar" de la semilla) **no puede ponerse visible** hasta cargar la dirección real (422). El sitio público lista solo los visibles (`/public/home`, `/public/students`).

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/settings-content-links.test.ts`
