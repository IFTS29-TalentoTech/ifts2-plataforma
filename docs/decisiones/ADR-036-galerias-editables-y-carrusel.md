# ADR-036 · Galerías editables y carrusel accesible

**Estado:** aceptada (07/11/2026). Resuelve Q135 y cumple lo básico de RF09. Complementa ADR-035.

## Contexto

El Figma muestra la galería "Vida en la cocina" (Estudiantes) y la foto de La carrera como **carruseles** (flechas y puntos). ADR-035 los resolvió con una grilla estática y las imágenes en ajustes de texto (`student_gallery`, `career_image`), sin forma cómoda de cambiarlas: el personal del instituto tenía que editar rutas a mano. El equipo pidió el carrusel y que sea **editable desde el panel**.

## Decisión

1. **Modelo.** Tabla `GalleryItem` (`area` `STUDENTS` o `CAREER`, `order`, `title`, `caption`, `alt`, `image`, fechas; índice por `area` y `order`). Migración aditiva `20261107075740_galeria`. `image` guarda una **ruta propia del sitio** (`/img/...`, la deja la semilla) o una **clave del almacenamiento** (`gallery/<uuid>.webp`, la deja la subida); nunca una URL firmada, porque vence: se resuelve al responder (`apps/api/src/lib/cover.ts`).
2. **API.** Módulo `gallery` (`/gallery`): listar, alta con imagen (multipart), editar textos, reemplazar la foto, ordenar (`PUT /gallery/order` con los ids de toda el área) y eliminar. La imagen sigue ADR-08: JPG, PNG o WebP, 5 MB, tipo por firma del archivo, 1600 px y WebP. Hasta **10 diapositivas por área** (Q10; 422 al pasarse). Toda mutación va a `AuditLog` (`gallery.create`, `.update`, `.image`, `.order`, `.delete`). Lectura pública: `GET /public/gallery?area=` (sin sesión, caché de contenido estanco), que **omite** las diapositivas sin imagen utilizable, así que una falla del almacenamiento no rompe el sitio (RNF03).
3. **Permiso.** `gallery:manage` (recurso "Galerías" del catálogo), concedido por defecto a **ADMIN y EDITOR**; la migración se lo agrega a los roles que ya existen y el Superadministrador lo ajusta en "Roles y permisos". Se separa de `settings:manage` a propósito: el EDITOR (comunicación) no entra a Configuración y es quien más va a cambiar fotos.
4. **Eliminación.** Es manual, con confirmación (`ConfirmDialog`) y auditada. A diferencia de avisos o publicaciones, una diapositiva no tiene vigencia ni estados, así que no rige la regla "solo contenido no vigente". Borra también el archivo si era propio (las rutas `/img/...` y las direcciones externas no se tocan).
5. **Panel.** Página `/panel/galerias` (ítem "Galerías" en el menú, visible con `gallery:manage`) y la misma pantalla como pestaña de Configuración. Subir, editar textos y foto, **Subir / Bajar** (sin arrastrar: funciona con teclado y lectores de pantalla) y Eliminar.
6. **Componente `Carousel`** (`apps/web/src/components/ui/carousel.tsx`): scroll-snap horizontal, botones Anterior y Siguiente (deshabilitados en los extremos), puntos, **sin reproducción automática**, semántica de carrusel (`aria-roledescription`, diapositivas "n de N"), ← → Inicio Fin en la pista, `prefers-reduced-motion` y mejora progresiva (sin JavaScript queda como scroll horizontal). Los controles aparecen solo si hay algo para desplazar: en escritorio las 3 tarjetas entran juntas y no se muestran; en el celular sí. Ids fijos y sin `useId` (un id generado difería entre servidor y cliente en el build de producción y rompía la hidratación).
7. **Respaldo y semilla.** Si un área no tiene diapositivas (o la API de galería falla), las páginas usan los ajustes `student_gallery` y `career_image` como antes: el sitio nunca queda sin su imagen. Esos ajustes **se conservan como respaldo**; la semilla (`seedGallery`) crea las diapositivas iniciales a partir de las imágenes provisorias (ADR-035) solo si el área está vacía y nunca pisa lo editado.

## Consecuencias

- Reemplazar o sumar fotos ya no requiere tocar rutas: se hace desde el panel y se guarda en el almacenamiento propio (local, memoria o S3 según el entorno).
- Hay dos orígenes posibles de imagen por pantalla (galería y ajuste de respaldo). Si el instituto vacía una galería, el sitio vuelve a las provisorias del ajuste: para quitarlas de verdad hay que vaciar también el ajuste.
- Las fotos provisorias (ADR-035, Q63) siguen sin consentimiento documentado: reemplazarlas antes de producción.
- La galería con **categorías** que pedía RF09 completo no se implementó: queda como mejora (Could).
