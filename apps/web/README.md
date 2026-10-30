# apps/web — Next.js 15 (App Router) + Tailwind + Radix

## Rutas (placeholders listos para completar, sin tocar archivos de routing compartidos)

- Público (`src/app/(public)/`, layout `PublicLayout` ya aplicado): `/`, `/institucional`, `/la-carrera`, `/estudiantes`, `/ingreso`, `/inscripciones`, `/novedades`, `/novedades/[id]`.
- Panel (`src/app/panel/(shell)/`, layout con `PanelShell` y sesión obligatoria): `/panel`, `/panel/publicaciones`, `/panel/avisos`, `/panel/horarios`, `/panel/archivo`, `/panel/configuracion`.
- Login: `src/app/panel/login/page.tsx` (fuera del shell). `/ui-kit` es un catálogo solo para desarrollo.

Cada agente edita **solo** el `page.tsx` (y archivos nuevos en su carpeta) de sus rutas; reemplazar `<Placeholder />`. Los componentes propios de una pantalla van en `src/features/<pantalla>/`.

## Kit de UI (`@/components/ui`)

`Button` (primary/secondary/danger/ghost, `loading`, `asChild`), `Badge` (success/warning/danger/neutral/urgent), `Card` (`accentBar`), `Eyebrow`, `Table`/`THead`/`TBody`/`TR`/`TH`/`TD`, `Input`/`Textarea`/`Select`/`Checkbox`/`Switch` (etiqueta, ayuda y error asociados), **`ConfirmDialog`** (único para todas las confirmaciones; controlado o `useConfirm()`), `Dialog` (modales con formulario), `useToast()`, `Skeleton`/`LoadingRegion`, `EmptyState`, `ErrorState` (con "Reintentar"), `Tabs`, `Pagination`.

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
