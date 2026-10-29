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

if (problems.length) {
  console.error(
    'Hay colores o fuentes escritos a mano. Usá las variables de src/styles/tokens.css (clases Tailwind: bg-primary, text-accent, font-sans...):\n',
  );
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('OK: sin colores ni fuentes hardcodeados en apps/web/src.');
