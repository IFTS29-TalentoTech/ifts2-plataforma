# Módulo `gallery` — galerías editables (RF09, ADR-036)

Carrusel "Vida en la cocina" de Estudiantes (`area=STUDENTS`) y fotos de La carrera (`area=CAREER`). Permiso `gallery:manage` (ADMIN y EDITOR por defecto).

- `GET /gallery?area=` — `{ items: GalleryItemDto[], max }` con `src` ya resuelto (firmado si la imagen es una clave del almacenamiento).
- `POST /gallery` — multipart: `file` (JPG/PNG/WebP, máx. 5 MB) + `area`, `title`, `caption`, `alt`, `category` (opcional, hasta 40 caracteres). 201. Se reduce a 1600 px y se guarda como WebP (`gallery/<uuid>.webp`). 415 tipo inválido, 413 grande, 422 si el área ya tiene 10.
- `PATCH /gallery/:id` — título, descripción, texto alternativo y categoría (US-30).
- `POST /gallery/:id/image` — multipart `file`: reemplaza la foto (borra la anterior si era nuestra).
- `PUT /gallery/order` — `{ area, ids }` con los ids de **todas** las diapositivas del área en el orden deseado (409 si la galería cambió).
- `DELETE /gallery/:id` — 204; manual (la interfaz confirma), auditado (`gallery.delete`), renumera el resto y borra el archivo propio.
- Lectura pública: `GET /public/gallery?area=` (módulo `public`); omite las diapositivas sin imagen utilizable (RNF03).

`image` guarda una **ruta del sitio** (`/img/...`, la deja la semilla) o una **clave del almacenamiento**; nunca una URL firmada (vence). Ver `src/lib/cover.ts`.

Probar: `pnpm --filter @ifts2/api exec vitest run --project integration test/api/gallery.test.ts`
