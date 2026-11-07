# ADR-035 · Imágenes del sitio público: provisorias del Figma y configurables

**Estado:** aceptada (07/11/2026). Resuelve Q64 y modifica el tratamiento de Q63.

## Contexto

El Figma vigente muestra fotografías en Inicio, La carrera, Estudiantes ("Vida en la cocina"), Ingreso y Novedades, y un logo. El sitio no las mostraba (Q63: requieren imágenes provistas por el instituto y consentimiento, RNF08), así que las pantallas se veían muy distintas del diseño. El equipo decidió mostrarlas ya, **como provisorias**, y que el instituto pueda reemplazarlas sin tocar código (ADR-22: nada institucional en el código).

## Decisión

1. **Origen.** Las imágenes se exportaron del Figma (`aRnoXCbNpkCFkHPH0En5B5`, nodos 1:2, 1:63, 1:106, 1:154 y 1:196), se optimizaron a `webp` (calidad 78, ancho máximo 640 a 800 px) y viven en `apps/web/public/img/provisorio/` (13 archivos, 472 KB en total). Son **provisorias**: se reemplazan por las del instituto, con consentimiento de las personas que aparecen (RNF08), antes de producción.
2. **Configuración, no código.** Cada imagen es un ajuste de `SiteSetting` (se edita en **Panel → Configuración → Encabezado de Inicio e imágenes**):

   | Clave                                   | Dónde se usa                                                                                  |
   | --------------------------------------- | --------------------------------------------------------------------------------------------- |
   | `logo_url`                              | Logo del encabezado (sin logo: iniciales de la sigla)                                         |
   | `hero_image_1`, `hero_image_2`          | Las dos fotos del encabezado de Inicio                                                        |
   | `career_image`                          | Foto junto al perfil profesional de La carrera                                                |
   | `ingreso_image`                         | Foto del encabezado de Ingreso                                                                |
   | `student_gallery`                       | Galería "Vida en la cocina": una tarjeta por línea, `ruta \| título \| descripción` (hasta 6) |
   | `hero_title`, `hero_eyebrow`, `tagline` | Titular corto, rótulo y frase institucional de Inicio (Q64)                                   |

   Un valor es una **ruta del sitio** (`/img/...`) o una **dirección https** completa; vacío significa "sin imagen" y la pantalla no se rompe. La validación es común a la API y al panel (`imageRef` en `packages/shared`).

3. **Portadas de publicaciones.** `Publication.coverUrl` acepta además una ruta propia (`/img/...`): se devuelve tal cual y no pasa por el almacenamiento (`apps/api/src/lib/cover.ts`). Solo la escribe la semilla; por la API sigue exigiéndose una dirección http(s) o un archivo subido, así nadie apunta una portada a un archivo interno.
4. **Semilla.** Los valores del IFTS (rutas, titular, rótulo, textos de la galería) están solo en `prisma/seed-data.ts`; las publicaciones de demostración reciben su portada provisoria si no tienen una (no pisa las editadas).
5. **Accesibilidad.** Las fotos son decorativas (`alt=""`); el texto de cada tarjeta es la descripción accesible. La galería es una grilla estática, **no un carrusel** (el Figma muestra un carrusel; evita trampas de foco y no depende de JavaScript). El texto sobre las fotos va sobre un degradé del color más oscuro del tema (contraste AA).
6. **`next/image`.** Se mantiene la política de dominios de A06: las rutas propias pasan por el optimizador; las direcciones externas se cargan sin optimizar.

## Consecuencias

- Reemplazar una foto es cambiar un ajuste (o subir otro archivo a `public/img/` y apuntar a él); no hay que tocar componentes.
- Mientras sean provisorias, el sitio muestra fotos con personas sin consentimiento documentado: **no pasar a producción así**. Queda registrado en Q63.
- Quien quiera subir imágenes desde el panel (almacenamiento propio) necesitará un módulo de medios; no está en el alcance (RF09 sigue siendo "Podría").
