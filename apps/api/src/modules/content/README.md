# Módulo `content` — secciones de páginas estancas

Secciones editables de Inicio, Institucional, La carrera, Estudiantes, Ingreso e Inscripciones (`ContentSection`): de **texto** o de **galería** (muestra una galería con nombre, ADR-041). Solo ADMIN (`content:manage`, `content:delete`).

- `GET /content/:page` — `{ page, items: ContentSectionDto[], hidden: string[] }` (incluye ocultas), por `order`; `hidden` = bloques fijos ocultos (ajuste `hidden_blocks`).
- `PUT /content/blocks/:blockId` — `{ visible }`: muestra u oculta un bloque fijo de una página (Avisos, Contacto, Accesos…; ver `PAGE_LAYOUT` en `packages/shared/src/page-blocks.ts`). Se registra antes de `/:page/...`. 400 si el bloque no existe o no se puede ocultar (el encabezado).
- `PATCH /content/:page/:slug` — `{ visible }`: el interruptor «Mostrar en el sitio» de una sección. El encabezado de la página no se oculta (409).
- `PUT /content/:page/order` — `{ slugs }`: orden de un grupo de secciones (reparte las mismas posiciones; 409 si cambió; 422 si incluye el encabezado). `order` no puede ser un `slug`.
- `GET /content/:page/:slug` — una sección (404 si no existe).
- `POST /content/:page` — `{ title, body, kind?, galleryId?, order?, visible? }`; crea la sección y **genera el `slug`** del título (con sufijo `-2`, `-3`… si ya existe). 201. `kind` = `TEXT` (por defecto, el texto es obligatorio) o `GALLERY` (exige `galleryId`; 422 si la galería no existe).
- `PUT /content/:page/:slug` — mismos campos; 201 si crea, 200 si reemplaza.
- `DELETE /content/:page/:slug` — 204 solo si la sección fue AGREGADA por una persona y está OCULTA (409 si está visible o si es una sección fija de la semilla: se oculta, no se elimina; ADR-042).

`:page` ∈ `inicio | institucional | carrera | estudiantes | ingreso | inscripciones`; `:slug` en minúsculas con guiones.

**Markdown acotado y sanitizado** (`src/lib/markdown.ts`): se quitan etiquetas HTML, scripts, imágenes y enlaces con esquemas peligrosos, al guardar y de nuevo al publicar. El HTML final lo produce la web con un renderizador que escape HTML.

Interpretación de 04-api.md ("solo secciones no estáticas"): se pueden eliminar únicamente las agregadas y ocultas (secciones fijas = `FIXED_SECTIONS`). Registrado en `docs/specs/09-preguntas-abiertas.md`.

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/settings-content-links.test.ts test/api/content-blocks.test.ts test/unit/markdown.test.ts`
