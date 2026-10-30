# Módulo `content` — secciones de páginas estancas

Texto editable de Institucional, La carrera e Ingreso (`ContentSection`). Solo ADMIN (`content:manage`, `content:delete`).

- `GET /content/:page` — `{ page, items: ContentSectionDto[] }` (incluye ocultas), por `order`.
- `GET /content/:page/:slug` — una sección (404 si no existe).
- `PUT /content/:page/:slug` — `{ title, body, order?, visible? }`; 201 si crea, 200 si reemplaza.
- `DELETE /content/:page/:slug` — 204 solo si la sección está OCULTA (409 si visible).

`:page` ∈ `institucional | carrera | ingreso`; `:slug` en minúsculas con guiones.

**Markdown acotado y sanitizado** (`src/lib/markdown.ts`): se quitan etiquetas HTML, scripts, imágenes y enlaces con esquemas peligrosos, al guardar y de nuevo al publicar. El HTML final lo produce la web con un renderizador que escape HTML.

Interpretación de 04-api.md ("solo secciones no estáticas"): se pueden eliminar únicamente las ocultas. Registrado en `docs/specs/09-preguntas-abiertas.md`.

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/settings-content-links.test.ts test/unit/markdown.test.ts`
