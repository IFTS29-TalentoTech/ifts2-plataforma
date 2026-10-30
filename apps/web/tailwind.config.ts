import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

// `base` es un token de COLOR del tema (texto claro sobre fondos oscuros). Tailwind trae además
// `text-base` como TAMAÑO de fuente: ambas utilidades se generaban con el mismo nombre y el
// tamaño pisaba a `text-sm`, o el color quedaba casi blanco al usarla como tamaño. Se quita el
// tamaño `base` y se ofrece `text-md` (1rem). `text-base` pasa a significar solo color.
const { base: _removedBaseSize, ...fontSizeSinBase } = defaultTheme.fontSize;

/**
 * Todo viene de variables CSS definidas en src/styles/tokens.css (generado desde
 * docs/specs/design-tokens.json). Prohibido escribir hex o nombres de fuente acá o en componentes.
 */
const v = (name: string) => `var(--${name})`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    fontSize: { ...fontSizeSinBase, md: ['1rem', { lineHeight: '1.5rem' }] },
    extend: {
      colors: {
        primary: { DEFAULT: v('color-primary'), strong: v('color-primary-strong') },
        base: v('color-base'),
        surface: v('color-surface'),
        accent: { DEFAULT: v('color-accent'), 2: v('color-accent-2'), 3: v('color-accent-3') },
        font: { DEFAULT: v('color-font'), strong: v('color-font-strong') },
        success: { text: v('color-success-text'), back: v('color-success-back') },
        warning: {
          text: v('color-warning-text'),
          strong: v('color-warning-text-strong'),
          back: v('color-warning-back'),
        },
        danger: {
          text: v('color-danger-text'),
          back: v('color-danger-back'),
          solid: v('color-danger-solid'),
        },
        focus: v('color-focus-ring'),
      },
      fontFamily: { sans: v('font-sans'), display: v('font-display') },
      borderRadius: {
        sm: v('radius-sm'),
        md: v('radius-md'),
        lg: v('radius-lg'),
        xl: v('radius-xl'),
        pill: v('radius-pill'),
      },
      boxShadow: { card: v('shadow-card'), popover: v('shadow-popover'), focus: v('shadow-focus') },
      maxWidth: { container: v('space-container') },
      width: { sidebar: v('space-panel-sidebar') },
      spacing: {
        gutter: v('space-gutter'),
        'gutter-lg': v('space-gutter-lg'),
        section: v('space-section'),
      },
    },
  },
  plugins: [],
};

export default config;
