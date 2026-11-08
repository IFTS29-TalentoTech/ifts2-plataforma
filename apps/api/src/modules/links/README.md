# Módulo `links` — enlaces de interés

Accesos directos (SIU Guaraní, Aulas virtuales, Mi Argentina, Tutoría; RF07). Solo ADMIN (`links:manage`, `links:delete`).

- `GET /links?visible=` — `{ items: LinkDto[], total }` (incluye ocultos), por grupo y orden.
- `POST /links`, `GET/PATCH /links/:id`.
- `DELETE /links/:id` — 204 solo si está oculto; visible => 409.

Campo `enrollment` (A07, ADR-033): marca el enlace donde se inscriben los **alumnos**. La página pública `/inscripciones` muestra solo los enlaces visibles con esta marca; nunca deduce el destino por el título (hay un "SIU Guaraní" para profesores y secretaría).

Reglas: título único (sin distinguir mayúsculas, 409). Un enlace con URL provisoria (`*.invalid`, los "a confirmar" de la semilla) **no puede ponerse visible** hasta cargar la dirección real (422). El sitio público lista solo los visibles (`/public/home`, `/public/students`).

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/settings-content-links.test.ts`
