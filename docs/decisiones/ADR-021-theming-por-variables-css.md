# ADR-021 · Colores y tipografías solo por variables CSS

Estado: Cerrada. Reemplaza el punto "Fuente Inter con `next/font`" de ADR-11 (la fuente se elige en un solo archivo).

## Decisión

- `docs/specs/design-tokens.json` es la **fuente única** de colores (Figma + derivados de contraste), fuentes, radios, sombras y espaciados.
- `pnpm tokens` genera `apps/web/src/styles/tokens.css` (`:root { --color-primary… --font-sans… --radius-md… }` y un tema alternativo `[data-theme='alt']` de ejemplo). `pnpm lint` verifica que el CSS esté sincronizado (`--check`).
- Tailwind (`apps/web/tailwind.config.ts`) solo referencia esas variables (`colors.primary = var(--color-primary)`, `fontFamily.sans = var(--font-sans)`).
- Las fuentes se cargan con `next/font` en `apps/web/src/app/fonts.ts` y alimentan `--font-sans-loaded` / `--font-display-loaded`. Cambiar de tipografía = tocar ese archivo.
- `scripts/check-no-hardcoded-styles.mjs` (parte de `pnpm lint` y de la CI) falla si hay hex, `rgb()/hsl()` o `font-family` fuera de `tokens.css` y `fonts.ts`.
- No usar modificadores de opacidad de Tailwind sobre colores del tema (`bg-primary/50`): las variables no admiten canal alfa.

## Tipografía

Las capturas del Figma lucen una sans geométrica tipo **Plus Jakarta Sans** (títulos y texto). Se usa para ambas variables (`--font-sans`, `--font-display`) y se verificó visualmente. El token original del JSON decía Inter; no coincide con las capturas. Pendiente confirmar con el cliente (Q4).

## Contraste (WCAG 2.2 AA), ajustes con criterio

`pnpm contrast` calcula los pares. Resultado sobre los colores del Figma y ajustes (tokens derivados en el JSON):

| Par                                                                  | Original    | Problema | Ajuste                                                                                                                       |
| -------------------------------------------------------------------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| blanco sobre `primary` #8D775F (botón)                               | 4,25:1      | < 4,5    | Botón primario usa `primary-strong` #806C56 (5,00:1)                                                                         |
| `primary` sobre `base` (texto, etiquetas)                            | 3,93:1      | < 4,5    | Texto en `accent` #6F5142 (6,62:1); `primary` queda para bordes, filetes e iconos (≥ 3:1)                                    |
| `font` #6E7271 sobre `accent-2` / `success-back`                     | 3,64 / 4,10 | < 4,5    | Texto secundario en `font-strong` #5F6261 (≥ 4,6:1). `font` sobre `base` da 4,50 (justo AA): se usa solo en texto no crítico |
| `warning-text` sobre `warning-back`                                  | 3,00:1      | < 4,5    | `warning-text-strong` #8D5E2D (4,66:1)                                                                                       |
| `accent`, `accent-3`, `danger-text`, `success-text` sobre sus fondos | 4,96 a 15,8 | OK       | Sin cambios                                                                                                                  |

axe (Cypress) no reporta violaciones serias en el catálogo `/ui-kit` ni en las rutas públicas.
