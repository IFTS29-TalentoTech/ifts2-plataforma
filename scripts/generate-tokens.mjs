// Genera apps/web/src/styles/tokens.css desde docs/specs/design-tokens.json.
// Uso: pnpm tokens   (agrega --check para verificar que el CSS está sincronizado sin escribir)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const src = new URL('../docs/specs/design-tokens.json', import.meta.url);
const out = new URL('../apps/web/src/styles/tokens.css', import.meta.url);
const t = JSON.parse(readFileSync(src, 'utf8'));

const decl = (prefix, obj) =>
  Object.entries(obj)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `  --${prefix}-${k}: ${v};`)
    .join('\n');

const root = [
  '  /* Colores (Figma) */',
  decl('color', t.color),
  '  /* Colores derivados: ajustes de contraste AA */',
  decl('color', t.colorDerivados),
  '  /* Fuentes: next/font asigna --font-sans-loaded / --font-display-loaded (src/app/fonts.ts) */',
  `  --font-sans: var(--font-sans-loaded), ${t.fuentes.sans.fallback};`,
  `  --font-display: var(--font-display-loaded), ${t.fuentes.display.fallback};`,
  '  /* Radios, sombras y espaciados */',
  decl('radius', t.radio),
  decl('shadow', t.sombra),
  decl('space', t.espaciado),
].join('\n');

const themes = Object.entries(t.temas ?? {})
  .map(
    ([name, th]) =>
      `[data-theme='${name}'] {\n${[decl('color', th.color ?? {}), decl('color', th.colorDerivados ?? {})].filter(Boolean).join('\n')}\n}`,
  )
  .join('\n\n');

const css = `/* ARCHIVO GENERADO por \`pnpm tokens\` desde docs/specs/design-tokens.json. No editar a mano. */
/* Único lugar con colores hex y nombres de fuente de la web. */

:root {
${root}
}

${themes}
`;

if (process.argv.includes('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (current.replace(/\r/g, '') !== css) {
    console.error('tokens.css no está sincronizado con design-tokens.json. Ejecutá: pnpm tokens');
    process.exit(1);
  }
  console.log('tokens.css sincronizado.');
} else {
  writeFileSync(out, css);
  console.log('Generado apps/web/src/styles/tokens.css');
}
