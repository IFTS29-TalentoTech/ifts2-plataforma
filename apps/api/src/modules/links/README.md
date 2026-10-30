# Módulo `links` — enlaces de interés

Accesos directos (SIU Guaraní, Aulas virtuales, Mi Argentina, Tutoría; RF07). Solo ADMIN (`links:manage`, `links:delete`).

- `GET /links?visible=` — `{ items: LinkDto[], total }` (incluye ocultos), por grupo y orden.
- `POST /links`, `GET/PATCH /links/:id`.
- `DELETE /links/:id` — 204 solo si está oculto; visible => 409.

Reglas: título único (sin distinguir mayúsculas, 409). Un enlace con URL provisoria (`*.invalid`, los "a confirmar" de la semilla) **no puede ponerse visible** hasta cargar la dirección real (422). El sitio público lista solo los visibles (`/public/home`, `/public/students`).

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/settings-content-links.test.ts`
