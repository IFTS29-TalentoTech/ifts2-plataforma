import { Plus_Jakarta_Sans } from 'next/font/google';

/**
 * ÚNICO lugar donde se elige la tipografía. Cambiar de fuente = tocar este archivo (y los nombres en
 * docs/specs/design-tokens.json -> "fuentes"). Las capturas del Figma lucen Plus Jakarta Sans (sans
 * geométrica); se usa para texto y títulos. Las variables CSS resultantes alimentan --font-sans y
 * --font-display en src/styles/tokens.css.
 */
export const fontSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-loaded',
});

export const fontDisplay = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700', '800'],
  variable: '--font-display-loaded',
});
