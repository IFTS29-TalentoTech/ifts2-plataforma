# ADR-042 · Bloques de las páginas del sitio: orden real, mostrar/ocultar y agregar en cualquier página

**Estado:** aceptada (08/11/2026). Completa ADR-041 («Páginas del sitio»).

## Contexto

Al probar la pantalla «Páginas del sitio» (ADR-041) quien edita —personal del instituto, muchas veces de edad avanzada— no entendía qué estaba tocando: el título se repetía; Inicio no listaba sus partes; en Institucional se veían tres textos sin saber cuál era el encabezado y cuáles tarjetas, ni en qué orden; en Ingreso «Cómo es el proceso» y «Requisitos» parecían iguales; en Inscripciones y Estudiantes los enlaces y las mesas no aparecían como partes de la página; y solo se podía agregar una galería en Estudiantes.

## Decisión

1. **Catálogo de bloques** (`packages/shared/src/page-blocks.ts`, fuente única del panel y del sitio). Por página, `PAGE_LAYOUT` lista en el **orden real de arriba hacia abajo** cada bloque (`id` estable `<página>.<bloque>`, nombre en lenguaje común, qué es y cómo se ve, de dónde sale el contenido y si se puede ocultar) y dos «lugares» donde caen las secciones de texto y las galerías agregadas. `FIXED_SECTIONS` nombra las secciones de texto que trae la semilla (encabezado o tarjeta). Un test (`apps/api/test/unit/page-blocks-seed.test.ts`) verifica que el catálogo y la semilla no se desincronicen.
2. **Interruptor «Mostrar en el sitio: Sí / No»** en cada bloque, con el estado escrito (no solo un switch):
   - Secciones de texto/galería: `PATCH /content/:page/:slug` `{ visible }` (usa `ContentSection.visible`, que la web ya respetaba).
   - Bloques que no son secciones (Avisos, Contacto, Accesos, Plantel…): `PUT /content/blocks/:blockId` `{ visible }`, que guarda la lista de ocultos en el ajuste **`hidden_blocks`** (JSON en `SiteSetting`, **sin migración**). Sale en `GET /public/settings`; la web lo lee con `showBlock(site, id)` al renderizar (la vigencia se calcula al consultar, sin tareas programadas).
   - Ocultar/mostrar no pide confirmación (se deshace con el mismo interruptor) y se audita (`content.visibility`, `content.block`).
3. **Lo fijo no se elimina.** Las secciones de la semilla y los bloques del catálogo solo se muestran u ocultan (si se eliminaran no podrían recrearse): `DELETE` responde 409 para ellas. Solo se eliminan las secciones **agregadas por una persona**, manualmente, con `ConfirmDialog`, y solo si están ocultas (regla de AGENTS.md sobre eliminación). El **encabezado** de cada página siempre se muestra (`canHide: false`; `PATCH` ocultarlo → 409).
4. **Orden.** El panel numera los bloques con su posición real. Las tarjetas de texto y las galerías se suben o bajan con `PUT /content/:page/order` `{ slugs }` (reparte entre ellas las mismas posiciones; no mueve el resto de la página ni el encabezado). Los bloques fijos que no son secciones mantienen su lugar (decisión simple y reversible; reordenarlos exigiría cambiar el diseño de la página pública).
5. **Agregar una sección en cualquier página, Inicio incluida.** `CONTENT_PAGES` suma `inicio` (`ContentSection.page` ya era texto: sin migración). El botón «Agregar sección» pregunta primero **Texto o Galería de fotos** (con un select de las galerías existentes y un enlace a «Galerías» para crear otra). La nueva sección va al final. Inicio dibuja sus secciones y galerías después de «Actualidad institucional».
6. **Bloques que vienen de otra pantalla** (Avisos, Mesas, Novedades, Plantel, Enlaces de interés) se listan igual, con «Se carga en otra pantalla» y un botón que lleva allí; los enlaces de interés explican dónde se ven y llevan a Configuración > Enlaces de interés.
7. **Galerías.** La pantalla «Galerías» muestra con nombre las páginas donde se ve cada una (sin «nomenclatura») y ofrece «Agregar a una página», que lleva a «Páginas del sitio»: ahí se decide dónde va cada galería.
8. **Lenguaje y diseño para personas mayores:** una sola cabecera (se quitó el título duplicado), números de posición, letra grande (`text-md`/`text-xl`), botones de 48 px con texto, etiquetas «Parte fija del sitio» / «Agregada por vos» / «Se carga en otra pantalla».

## Consecuencias

- Agregar un bloque nuevo al sitio público exige sumarlo a `PAGE_LAYOUT` (y, si es una sección de texto de la semilla, a `FIXED_SECTIONS`); los tests avisan si falta.
- `hidden_blocks` solo la escribe el endpoint dedicado (no `PUT /settings`).
- No hay migración nueva. La semilla no cambia (por defecto no hay bloques ocultos: el sitio se ve igual que antes).
- Pendiente: ver los cambios de orden de los bloques fijos que no son secciones (hoy el orden lo define el diseño); capturas del Manual de Usuario de esta pantalla.
