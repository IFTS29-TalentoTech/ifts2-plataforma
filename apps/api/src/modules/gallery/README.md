# Módulo `gallery` — galerías de fotos con nombre (RF09, ADR-036, ADR-041)

Permiso `gallery:manage` (ADMIN y EDITOR por defecto). El administrador crea galerías con nombre, les sube fotos y las agrega a cualquier página como una sección de tipo galería (módulo `content`).

- `GET /gallery` — `{ galleries: GalleryDto[], max }`: cada galería con sus fotos (`src` ya resuelto, firmado si es una clave del almacenamiento) y las páginas donde se muestra.
- `POST /gallery` `{ name }` — crea la galería (201). `PATCH /gallery/:id` `{ name }` — renombra.
- `DELETE /gallery/:id` — 204; manual (la interfaz confirma), auditado (`gallery.delete`), borra fotos y archivos propios. **409** si se muestra en una página: primero se quita de ahí.
- `POST /gallery/:id/items` — multipart: `file` (JPG/PNG/WebP, máx. 5 MB) + `title`, `caption`, `alt`, `category` (opcional, hasta 40 caracteres). 201. Se reduce a 1600 px y se guarda como WebP (`gallery/<uuid>.webp`). 415 tipo inválido, 413 grande, 422 si la galería ya tiene 10.
- `PUT /gallery/:id/order` — `{ ids }` con los ids de **todas** las fotos en el orden deseado (409 si la galería cambió).
- `PATCH /gallery/items/:itemId` — textos y categoría (US-30). `POST /gallery/items/:itemId/image` — reemplaza la foto (borra la anterior si era nuestra). `DELETE /gallery/items/:itemId` — 204, auditado, renumera el resto.
- Lectura pública: dentro de `GET /public/content/:page` (módulo `public`), campo `galleries`; omite las fotos sin imagen utilizable y las secciones ocultas o vacías (RNF03).

`image` guarda una **ruta del sitio** (`/img/...`, la deja la semilla) o una **clave del almacenamiento**; nunca una URL firmada (vence). Ver `src/lib/cover.ts`.

Probar: `pnpm --filter @ifts2/api exec vitest run --project integration test/api/gallery.test.ts`
