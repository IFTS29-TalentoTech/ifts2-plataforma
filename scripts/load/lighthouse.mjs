// Lighthouse móvil (emulación por defecto: Moto G con 4G lento simulado) sobre las páginas clave:
// `pnpm lighthouse`. Objetivo del proyecto: rendimiento >= 80 y accesibilidad >= 90.
//
// Corre contra el build de producción (levanta su propia API + web con `startStack`; usá
// `--no-start` para apuntar a una pila ya levantada en WEB_URL). Necesita Chrome instalado.
// Cada página se mide `--runs` veces (3 por defecto) y se informa la MEDIANA, porque una sola
// corrida de Lighthouse varía bastante.
//
// Uso: node scripts/load/lighthouse.mjs [--runs 3] [--out docs/evidencias/x.md] [--no-start]
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { killAll, root, startStack } from '../lib/stack.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const runs = Number(opt('--runs', 3));
const today = new Date().toISOString().slice(0, 10);
const out = opt('--out', `docs/evidencias/${today}-lighthouse-movil.md`);
const isWin = process.platform === 'win32';

const PAGES = [
  ['Inicio', '/'],
  ['Estudiantes', '/estudiantes'],
  ['Novedades', '/novedades'],
  ['Login del panel', '/panel/login'],
];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const tmp = mkdtempSync(path.join(os.tmpdir(), 'lh-'));
const rows = [];
try {
  let web = process.env.WEB_URL ?? 'http://localhost:3100';
  if (!args.includes('--no-start')) web = (await startStack()).web;
  for (const [name, route] of PAGES) {
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const file = path.join(tmp, `${name.replace(/\W+/g, '_')}-${i}.json`);
      const r = spawnSync(
        'npx',
        [
          'lighthouse',
          web + route,
          '--quiet',
          '--output=json',
          `--output-path=${file}`,
          '--only-categories=performance,accessibility,best-practices,seo',
          '--chrome-flags=--headless=new --no-sandbox',
        ],
        { cwd: root, shell: isWin, stdio: ['ignore', 'ignore', 'inherit'] },
      );
      if (r.status !== 0) throw new Error(`Lighthouse falló en ${route}`);
      const j = JSON.parse(readFileSync(file, 'utf8'));
      const c = j.categories;
      const a = j.audits;
      samples.push({
        perf: Math.round(c.performance.score * 100),
        a11y: Math.round(c.accessibility.score * 100),
        bp: Math.round(c['best-practices'].score * 100),
        seo: Math.round(c.seo.score * 100),
        lcp: a['largest-contentful-paint'].numericValue,
        tbt: a['total-blocking-time'].numericValue,
        cls: a['cumulative-layout-shift'].numericValue,
      });
    }
    const m = (k) => median(samples.map((s) => s[k]));
    rows.push({
      name,
      route,
      ...Object.fromEntries(Object.keys(samples[0]).map((k) => [k, m(k)])),
    });
    console.log(`${name}: rendimiento ${m('perf')}, accesibilidad ${m('a11y')}`);
  }
} finally {
  killAll();
}

const ok = (r) => r.perf >= 80 && r.a11y >= 90;
const md = [
  `# Lighthouse móvil — ${today}`,
  '',
  `Lighthouse (emulación móvil por defecto, 4G lento simulado) sobre el build de producción; mediana de ${runs} corridas por página. Objetivo: rendimiento >= 80 y accesibilidad >= 90.`,
  '',
  '| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP | TBT | CLS | Objetivo |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.name} (\`${r.route}\`) | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} | ${(r.lcp / 1000).toFixed(1)} s | ${Math.round(r.tbt)} ms | ${r.cls.toFixed(3)} | ${ok(r) ? 'CUMPLE' : 'NO CUMPLE'} |`,
  ),
  '',
].join('\n');
console.log('\n' + md);
if (out) {
  const file = path.resolve(root, out);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, md);
}
process.exit(rows.every(ok) ? 0 : 1);
