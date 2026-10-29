// Calcula contrastes WCAG de los pares texto/fondo de docs/specs/design-tokens.json
import { readFileSync } from 'node:fs';
const t = JSON.parse(
  readFileSync(new URL('../docs/specs/design-tokens.json', import.meta.url), 'utf8'),
);
const c = { ...t.color, white: '#FFFFFF' };
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const pairs = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => p.split(':'))
  : [
      ['font', 'base'],
      ['font', 'white'],
      ['primary', 'base'],
      ['white', 'primary'],
      ['accent-3', 'primary'],
      ['base', 'primary'],
      ['accent', 'base'],
      ['white', 'accent'],
      ['accent-3', 'base'],
      ['accent-3', 'accent-2'],
      ['font', 'accent-2'],
      ['accent', 'accent-2'],
      ['base', 'accent-3'],
      ['accent-2', 'accent-3'],
      ['white', 'accent-3'],
      ['success-text', 'success-back'],
      ['warning-text', 'warning-back'],
      ['danger-text', 'danger-back'],
      ['warning-text', 'white'],
      ['primary', 'white'],
      ['font', 'success-back'],
    ];
for (const [fg, bg] of pairs) {
  const f = c[fg] ?? fg,
    b = c[bg] ?? bg;
  const r = ratio(f, b);
  console.log(
    `${fg.padEnd(14)} ${f}  sobre ${bg.padEnd(13)} ${b}  ${r.toFixed(2)}  ${r >= 4.5 ? 'AA' : r >= 3 ? 'solo texto grande/UI' : 'FALLA'}`,
  );
}
