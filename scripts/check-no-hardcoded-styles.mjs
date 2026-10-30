// Falla si hay colores hex o nombres de fuente escritos a mano en apps/web/src fuera de styles/tokens.css
// (y de la fuente declarada en app/fonts.ts). Regla: colores y tipografías solo desde variables CSS.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../apps/web/src');
const ALLOWED = new Set([
  path.join(root, 'styles', 'tokens.css').toLowerCase(),
  path.join(root, 'app', 'fonts.ts').toLowerCase(),
]);
const EXT = new Set(['.ts', '.tsx', '.css', '.js', '.jsx', '.mjs']);
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /\b(?:rgb|rgba|hsl|hsla)\(/g;
const FONT = /font-family\s*:|fontFamily\s*[:=]\s*['"`]/g;

const problems = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.has(path.extname(p)) && !ALLOWED.has(p.toLowerCase())) {
      const lines = readFileSync(p, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/^\s*(\/\*|\*)/.test(line)) return;
        // Se ignoran anclas HTML (href="#...") y ids CSS comunes en strings de URL
        const hexes = [...code.matchAll(HEX)].filter(
          (m) =>
            !/(href|to|url)\s*[=:(]\s*['"`]?#/.test(
              code.slice(Math.max(0, m.index - 12), m.index + 1),
            ),
        );
        if (hexes.length || RGB.test(code) || FONT.test(code))
          problems.push(`${path.relative(process.cwd(), p)}:${i + 1}: ${line.trim()}`);
        RGB.lastIndex = 0;
        FONT.lastIndex = 0;
      });
    }
  }
};
walk(root);

// Regla anti `text-base` como tamaño: `base` es un token de COLOR (texto claro sobre fondo oscuro).
// Como tamaño de fuente usar `text-md` (1rem). Se rechaza `text-base`:
//  - en el kit (components/ui): nunca hace falta como color ahí;
//  - junto a un fondo claro (bg-primary*, bg-surface, bg-base, bg-accent-2) en la misma línea.
// Además tailwind.config.ts debe seguir quitando el tamaño `base` del tema.
const TEXT_BASE = /(^|[\s"'`:])text-base(?=[\s"'`]|$)/;
const LIGHT_BG = /(^|[^\w-])bg-(primary|primary-strong|surface|base|accent-2)(?![\w-])/;
const walkTextBase = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walkTextBase(p);
    else if (['.tsx', '.ts'].includes(path.extname(p))) {
      const inKit = p.split(path.sep).join('/').includes('/components/ui/');
      readFileSync(p, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (TEXT_BASE.test(line) && (inKit || LIGHT_BG.test(line)))
            problems.push(
              `${path.relative(process.cwd(), p)}:${i + 1}: 'text-base' es un COLOR (no un tamaño); usá 'text-md': ${line.trim()}`,
            );
        });
    }
  }
};
walkTextBase(root);
const tw = readFileSync(path.resolve(root, '../tailwind.config.ts'), 'utf8');
if (!/fontSizeSinBase/.test(tw))
  problems.push("apps/web/tailwind.config.ts: debe quitar el tamaño de fuente 'base' del tema");

if (problems.length) {
  console.error(
    'Hay colores o fuentes escritos a mano. Usá las variables de src/styles/tokens.css (clases Tailwind: bg-primary, text-accent, font-sans...):\n',
  );
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('OK: sin colores ni fuentes hardcodeados en apps/web/src.');
