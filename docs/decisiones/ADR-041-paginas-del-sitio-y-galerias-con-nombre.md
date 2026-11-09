# ADR-041 · Páginas del sitio y galerías con nombre

**Estado:** aceptada (08/11/2026). Reemplaza partes de ADR-036 (galerías fijas, pestañas de Configuración) y de ADR-035 (respaldo `student_gallery`).

## Contexto

Quien edita el sitio es personal del instituto, muchas veces de edad avanzada. La edición estaba desperdigada: titular e imágenes de cada página en la pantalla general de Configuración (como **rutas de texto**, sin ver la imagen), los textos en una pestaña, las galerías en otra pestaña **y** en el menú lateral, el plantel también en dos lugares. Estudiantes e Inscripciones no tenían edición propia, y solo existían dos galerías fijas (`STUDENTS`, `CAREER`).

## Decisión

1. **Una pantalla por cosa.** Configuración queda con los datos de la sede, los usuarios y **solo dos pestañas** (Integraciones, Enlaces de interés). Galerías y Plantel docente viven únicamente en el menú lateral. Los textos de las páginas pasan a una pantalla propia, **«Páginas del sitio»** (`/panel/paginas`, permiso `content:manage`), con un botón visible desde Configuración.
2. **Todo lo de una página, en un solo lugar.** Páginas editables: Inicio, Institucional, La carrera, Estudiantes, Ingreso e Inscripciones (`CONTENT_PAGES` suma `estudiantes` e `inscripciones`; desde ADR-042 también `inicio`). Cada página tiene «Textos e imágenes de la página» (titular y fotos, que se **suben como archivo**, ver el endpoint `POST /settings/image/:key`) y su lista de **secciones**.
3. **Secciones de texto o de galería.** `ContentSection` gana `kind` (`TEXT` | `GALLERY`) y `galleryId`. Una sección de galería muestra una galería con nombre dentro de cualquier página. El identificador interno (`slug`) lo genera la API a partir del título (`POST /content/:page`): nadie escribe «identificadores».
4. **Galerías con nombre.** Nueva tabla `Gallery` (`name`, `order`); `GalleryItem` pasa de `area` a `galleryId` (borrado en cascada). La migración `20261108120000_galerias_con_nombre` conserva los datos: las fotos de `STUDENTS` y `CAREER` pasan a las galerías «Vida en la cocina» y «Fotos de La carrera», ya asociadas como sección de Estudiantes y de La carrera, así que el sitio se ve igual. Solo se crean si había fotos; la semilla las crea si faltan (idempotente, sin pisar lo editado).
5. **API de galerías** (`/gallery`): `GET` (galerías con fotos y páginas donde se muestran), `POST` y `PATCH /:id` (nombre), `DELETE /:id`, `POST /:id/items` (foto), `PUT /:id/order`, `PATCH|DELETE /items/:itemId`, `POST /items/:itemId/image`. Una galería **en uso no se elimina** (409 que nombra la página): primero se la quita de la página; quitarla de una página no borra la galería ni sus fotos. Se retiró `GET /public/gallery?area=`: las galerías viajan dentro de `GET /public/content/:page` (`galleries: [{ slug, title, body, order, items }]`), con las ocultas o sin fotos utilizables omitidas (RNF03).
6. **Se retiró `student_gallery`** (texto `ruta | título | descripción`): ya no hay respaldo por texto. `career_image` se mantiene como respaldo de La carrera si no hay galería asociada.
7. **Público.** Estudiantes, Inscripciones, Institucional e Ingreso dibujan las galerías de su página como carruseles con filtro por categoría (`GallerySections`); Estudiantes e Inscripciones además muestran sus secciones de texto (`TextSections`). La carrera usa la primera galería junto al perfil, como antes.
8. **Lenguaje.** Se evita la jerga («grupo», «identificador», «diapositiva»): «sección», «foto», «galería», «Posición en la página», «Mostrar en el sitio». Botones con texto, letra más grande y descripciones en voseo.

## Consecuencias

- El instituto puede armar tantas galerías como quiera y ponerlas en cualquier página sin tocar código.
- Menú lateral nuevo: «Páginas del sitio». `content:manage` ya no abre Configuración (se quitó de sus capacidades de acceso).
- Cualquier cliente de `/gallery?area=` o de `student_gallery` deja de funcionar (solo lo usaba la web propia).
- Las fotos provisorias siguen sin consentimiento documentado (Q63, Q139).
