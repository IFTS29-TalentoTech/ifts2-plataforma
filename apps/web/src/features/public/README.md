# Sitio público (`features/public`)

Implementa las páginas públicas del sitio con datos de la API `/public/*`. Fuente visual: `docs/design/desktop/01..06` y `docs/design/mobile/`. Reglas: RF02, RF03, RF04, RF06, RF07, RF08, RNF03, RNF05, RNF07, RNF08.

## Mapa: página -> endpoints -> componentes

| Ruta              | Archivo                                | Endpoints                                                                   | Componentes principales                                               |
| ----------------- | -------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/`               | `app/(public)/page.tsx`                | `/public/home`, `/public/settings`                                          | `PageHero`, `LinkCard`, `PublicationCard`, `ExamCallCard`             |
| `/institucional`  | `app/(public)/institucional/page.tsx`  | `/public/content/institucional`, `/public/settings`, `POST /public/contact` | `PageHero`, `Markdown`, `ContactForm` (ancla `#contacto`)             |
| `/la-carrera`     | `app/(public)/la-carrera/page.tsx`     | `/public/content/carrera`                                                   | `PageHero`, `Markdown`                                                |
| `/estudiantes`    | `app/(public)/estudiantes/page.tsx`    | `/public/students`                                                          | `NoticeCard`, `ScheduleCard`, `ExamCallCard`, `LinkCard`              |
| `/ingreso`        | `app/(public)/ingreso/page.tsx`        | `/public/content/ingreso`, `/public/students?audience=ASPIRANTS`            | `MarkdownBlocks`, `NoticeCard`                                        |
| `/inscripciones`  | `app/(public)/inscripciones/page.tsx`  | `/public/students`                                                          | `ExamCallCard` (`enrollmentOpen` efectivo), `LinkCard` (`enrollment`) |
| `/novedades`      | `app/(public)/novedades/page.tsx`      | `/public/publications?year&category&archived&page`                          | `NewsFilters`, `PublicationCard`, `LinkPagination`                    |
| `/novedades/[id]` | `app/(public)/novedades/[id]/page.tsx` | `/public/publications/:id[?archived=true]`                                  | `Cover` (`next/image`), `Markdown`; 404 en `not-found.tsx`            |

Archivos de esta carpeta: `data.ts` (cliente de datos con ISR y degradación), `markdown.tsx` (renderizador que escapa HTML), `parts.tsx` (hero, secciones, tarjetas, archivos, paginación), `academic-parts.tsx` (avisos, horarios, llamados), `contact-form.tsx` y `news-filters.tsx` (los únicos componentes cliente).

## Decisiones clave

- **ISR de 60 s**: cada pedido a la API lleva `next.revalidate = 60` (`PUBLIC_REVALIDATE`) y las páginas estáticas exportan `revalidate = 60` (debe ser un literal; Next lo analiza estáticamente). `/novedades` y el detalle dependen de la URL, así que se renderizan por pedido, con los datos cacheados 60 s.
- **Degradación (RNF03)**: `loadPublic` nunca lanza; devuelve `{ ok: false }` y la página muestra `SectionError` (rol `alert`) sin romperse. `getSiteInfo` ya cae a valores genéricos.
- **Markdown**: nunca `dangerouslySetInnerHTML`; React escapa todo y los enlaces solo admiten http(s), mailto, tel, rutas y anclas.
- **Identidad**: nada institucional en el código; nombre, pie, sede y contactos salen de `getSiteInfo()`. Solo hay textos de navegación y de interfaz.
- **Tokens**: solo clases del tema. Cuidado: `text-base` es a la vez tamaño de fuente y COLOR (`base` es un token de color): no usarlo como tamaño ni usar `Button size="lg"` (usa `text-base`).
- **Imágenes**: `Cover` usa `next/image` con dimensiones explícitas. Solo optimiza rutas propias y URLs de la API sin parámetros; las externas, firmadas y locales se cargan directo. `CoverImage` aísla el fallback accesible de error. Ver A06 y `pnpm test:covers` en el README de web.
- **Fotos del Figma (ADR-035)**: `HeroPhotos` (Inicio), `HeroImage` (Ingreso), la foto del perfil (La carrera), `PhotoCard` (galería de Estudiantes) y el logo (`SiteLogo`) leen sus rutas de los ajustes (`getSiteInfo()`: `heroImage1/2`, `careerImage`, `ingresoImage`, `gallery`, `logoUrl`). Son provisorias, decorativas (`alt=""`) y sin imagen configurada no se dibuja nada (el layout no se rompe). Las tarjetas de novedades sin portada muestran un bloque neutro. La galería es una grilla estática, no un carrusel (Q135).
- **Hero**: usa `primary-strong` con texto `surface` (AA); `primary` del Figma no alcanza 4,5:1 con blanco.

## Cómo probar

```bash
pnpm db:migrate && SEED_MODE=demo pnpm db:seed
pnpm --filter @ifts2/api dev                      # API (puerto de tu .env)
pnpm --filter @ifts2/web build && pnpm --filter @ifts2/web start   # o `dev`
cd apps/web
CYPRESS_BASE_URL=http://localhost:3000 env -u ELECTRON_RUN_AS_NODE pnpm exec cypress run --spec "cypress/e2e/public/*.cy.ts"
```

- `capturas.cy.ts` regenera las imágenes del Manual de Usuario (`cypress/screenshots/capturas.cy.ts/`, copiar a `docs/capturas/publico/`). Usar `--browser chrome --headless` para capturas de 1440 px sin recorte.
- `degradacion.cy.ts` se omite salvo que `DEGRADED_URL` apunte a una web levantada con `API_ORIGIN` a un puerto sin API (por ejemplo `API_ORIGIN=http://localhost:4999 pnpm exec next dev -p 3119` y `DEGRADED_URL=http://localhost:3119`). No compartir el directorio `.next` con otro servidor.
- El spec de contacto real envía un mensaje: la API limita 5 por hora por IP; reiniciar la API reinicia el contador.
- Lighthouse: `npx lighthouse http://localhost:3000/ --only-categories=performance,accessibility` contra el build de producción. Resultados en `docs/evidencias/2026-10-30-web-public-lighthouse.md`.

## Pendientes

Plantel docente y plan de estudios por año/correlatividades (sin datos ni API; ver Q60 a Q65 y Q134 en `docs/specs/09-preguntas-abiertas.md`), las fotos definitivas con consentimiento (hoy provisorias, Q63) y documentos públicos de ingreso (no existe endpoint).
