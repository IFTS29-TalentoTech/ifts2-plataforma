# apps/web — Next.js 15 (App Router) + Tailwind + Radix

## Rutas (placeholders listos para completar, sin tocar archivos de routing compartidos)

- Público (`src/app/(public)/`, layout `PublicLayout` ya aplicado): `/`, `/institucional`, `/la-carrera`, `/estudiantes`, `/ingreso`, `/inscripciones`, `/novedades`, `/novedades/[id]`.
- Panel (`src/app/panel/(shell)/`, layout con `PanelShell` y sesión obligatoria): `/panel`, `/panel/publicaciones`, `/panel/avisos`, `/panel/horarios`, `/panel/archivo`, `/panel/configuracion`.
- Login: `src/app/panel/login/page.tsx` (fuera del shell). `/ui-kit` es un catálogo solo para desarrollo.

Cada agente edita **solo** el `page.tsx` (y archivos nuevos en su carpeta) de sus rutas; reemplazar `<Placeholder />`. Los componentes propios de una pantalla van en `src/features/<pantalla>/`.

## Kit de UI (`@/components/ui`)

`Button` (primary/secondary/danger/ghost, `loading`, `asChild`), `Badge` (success/warning/danger/neutral/urgent), `Card` (`accentBar`), `Eyebrow`, `Table`/`THead`/`TBody`/`TR`/`TH`/`TD`, `Input`/`Textarea`/`Select`/`Checkbox`/`Switch` (etiqueta, ayuda y error asociados), **`ConfirmDialog`** (único para todas las confirmaciones; controlado o `useConfirm()`), `Dialog` (modales con formulario), `useToast()`, `Skeleton`/`LoadingRegion`, `EmptyState`, `ErrorState` (con "Reintentar"), `Tabs`, `Pagination`, `DropdownMenu` (menú de acciones sobre un elemento, Radix; las acciones que cambian datos igual pasan por `ConfirmDialog`).

Layout: `PageHeader` (título, descripción, acción) y `Placeholder` en `@/components/layout/page-header`.

```tsx
const confirm = useConfirm();
if (await confirm({ title: '¿Eliminar el aviso?', tone: 'danger', confirmLabel: 'Sí, eliminar' })) {
  await api.delete(`/notices/${id}`);
  toast({ title: 'Aviso eliminado', tone: 'success' });
}
```

## Reglas

- **Sin hex ni nombres de fuente en componentes**: solo clases Tailwind del tema (`bg-primary-strong`, `text-accent`, `bg-surface`, `font-display`…). Los valores viven en `src/styles/tokens.css`, generado con `pnpm tokens` desde `docs/specs/design-tokens.json`. `pnpm lint` lo verifica. Para cambiar la paleta: editar el JSON y `pnpm tokens` (o probar `data-theme="alt"` en `<html>`).
- No usar opacidad de Tailwind sobre colores del tema (`bg-primary/50` no funciona con variables).
- Texto sobre fondos: usar `primary-strong` para botones, `accent` para texto de acento y `font-strong` para texto secundario (contraste AA; ver ADR-021).
- Nada institucional escrito en el código: nombre, pie, contactos salen de `getSiteInfo()` (`lib/site.ts`) -> `GET /public/settings`.
- Tipografía: se cambia solo en `src/app/fonts.ts`.

## Datos y sesión (`@/lib`)

`api` (get/post/put/patch/delete con cookies, `ApiError` con `fieldErrors` y `userMessage`; en el navegador usa `/api/v1` y Next lo reenvía a la API; en el servidor reenviá `cookie: await cookieHeader()`), `getSession()` / `requireSession()`, `formatDateAR` & co. (es-AR, Buenos Aires), `PUBLIC_NAV` / `PANEL_NAV`, `cn()`.

## Cypress

`pnpm test:e2e` (web levantada; `CYPRESS_BASE_URL` para otro puerto). Viewports 390 y 1440; el comando `cy.a11y()` corre axe (WCAG 2.2 AA, impactos serio/crítico). Specs: `smoke.cy.ts`, `ui-kit.cy.ts` y, para el sitio público, `e2e/public/*.cy.ts` (recorrido, estudiantes, novedades, contacto, degradación, capturas; ver `src/features/public/README.md`). Chrome: `--browser chrome --headless`.

## Sitio público

Implementado en `src/features/public/` (mapa de páginas, endpoints y decisiones en su README). `next.config.ts` lee el `.env` de la raíz con `forceReload` y autoriza el origen de la API para `next/image`. Cuidado con `text-base` (también es un color del tema).

### Portadas externas (A06)

`Cover` optimiza rutas propias y URLs de `API_ORIGIN` sin parámetros. Las URLs externas, las
firmadas (también las de la API local) y las de desarrollo se cargan directamente desde el
navegador con `next/image` y `unoptimized`. El optimizador solo autoriza el origen exacto de la
API, sin parámetros; no se agregan dominios de terceros ni patrones universales. Se conservan
dimensiones, carga diferida, prioridad del detalle y ancho responsive. Solo `CoverImage` es
cliente: ante un error reemplaza la imagen por un bloque con nombre accesible.

Las imágenes de Instagram ya copiadas siguen usando la clave del almacenamiento y su URL
firmada. La firma pública dura 1800 segundos; las respuestas y páginas públicas usan caché,
por lo que una pestaña abierta puede intentar cargar una firma vencida. El fallback permite
seguir leyendo; no renueva firmas ni reintenta automáticamente. Una recarga obtiene la URL
disponible según la caché vigente. La disponibilidad, HTTPS en sitios HTTPS y las restricciones
del proveedor externo siguen siendo responsabilidad del origen. S3/R2/Supabase/MinIO reales
no se verifican con credenciales en estas pruebas.

Validación sin servicios externos ni PostgreSQL: `pnpm test:covers` desde la raíz compila la
web con una API simulada (puerto 4100), la sirve en 3200 y ejecuta Cypress a 390 y 1440 px.
Incluye inicio, novedades, detalle, imágenes propias, manuales, firmadas, copia de Instagram,
404/403, ausencia de portada, axe y rechazo del optimizador. Usa el build `.next` habitual y
requiere Cypress instalado (`pnpm --filter @ifts2/web exec cypress install`) y sus bibliotecas
de sistema. `pnpm --filter @ifts2/web test` verifica la selección del optimizador con Vitest.

`pnpm test:e2e` (web levantada; `CYPRESS_BASE_URL` para otro puerto). Viewports 390 y 1440; el comando `cy.a11y()` corre axe (WCAG 2.2 AA, impactos serio/crítico). Specs: `smoke.cy.ts`, `ui-kit.cy.ts`.

## Panel B (Horarios, Archivo, Configuración)

Pantallas en `src/features/panel-b/` (ver su `README.md`) montadas desde `app/panel/(shell)/{horarios,archivo,configuracion}`. Specs en `cypress/e2e/panel-b/` con `cy.loginAsApi(rol)`, `cy.api()` y `cy.byLabel()` (`cypress/support/panel-b.ts`). Para E2E se recomienda `pnpm build` + `pnpm start` con `API_ORIGIN` exportado (ver Q105). Capturas del manual: `capturas-manual.cy.ts` y copiar `cypress/screenshots/capturas-manual.cy.ts/b-*.png` a `docs/capturas/panel/`.

`pnpm test:e2e` (web levantada; `CYPRESS_BASE_URL` para otro puerto). Viewports 390 y 1440; el comando `cy.a11y()` corre axe (WCAG 2.2 AA, impactos serio/crítico). Specs: `smoke.cy.ts`, `ui-kit.cy.ts` y, del panel parte A, `e2e/panel-a/*.cy.ts` (ver `src/features/panel-a/README.md`). Cypress 16 no tiene `Cypress.env`: los usuarios de prueba están en `cypress/support/panel-a.ts`.

## Panel parte A

`/panel/login`, `/panel/login/cambiar-clave`, `/panel`, `/panel/publicaciones`, `/panel/avisos` y `/panel/mensajes` están implementados en `src/features/panel-a/` (pantallas, endpoints, permisos y cómo probar en su README). El menú del panel tiene el ítem Mensajes (permiso `contact:read`). El cierre de sesión también está en el menú móvil. `next.config.ts` aplica el `.env` de la raíz con `forceReload` (antes el proxy ignoraba `API_ORIGIN`).
