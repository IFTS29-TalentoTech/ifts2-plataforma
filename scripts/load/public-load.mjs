// Prueba de carga del sitio público (RNF05 y RNF09): `pnpm load`.
//
// Simula N usuarios virtuales concurrentes (400 por defecto, el pico de inscripciones del cliente)
// que navegan Inicio, Estudiantes y Novedades contra el build de producción + API, y mide la
// latencia exacta (p50/p95/p99) y los errores. Objetivo: SIN errores 5xx y p95 < 1,5 s.
//
// Herramienta: autocannon (Node, sin instalar binarios; k6 requiere un instalador con permisos).
// Cada "usuario" es una conexión que recorre las tres páginas en ciclo (como una persona que navega),
// sin pausas: es un escenario más duro que un usuario real, que lee entre página y página.
//
// Uso: node scripts/load/public-load.mjs [--users 400] [--duration 30] [--out docs/evidencias/x.md]
//      [--no-start]  (usa una pila ya levantada en WEB_URL / API_URL en lugar de levantar la propia)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import autocannon from 'autocannon';
import { killAll, root, startStack } from '../lib/stack.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const users = Number(opt('--users', 400));
const duration = Number(opt('--duration', 30));
const today = new Date().toISOString().slice(0, 10);
const out = opt('--out', `docs/evidencias/${today}-carga-publico.md`);

const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0;

/** Corre un escenario y devuelve métricas exactas calculadas con cada respuesta. */
function scenario(name, baseUrl, paths) {
  return new Promise((resolve) => {
    const times = [];
    const statuses = {};
    const instance = autocannon(
      {
        url: baseUrl,
        connections: users,
        duration,
        timeout: 30,
        requests: paths.map((p) => ({ method: 'GET', path: p })),
      },
      (err, result) => {
        if (err) throw err;
        const sorted = times.sort((a, b) => a - b);
        const s5xx = Object.entries(statuses)
          .filter(([c]) => Number(c) >= 500)
          .reduce((n, [, v]) => n + v, 0);
        resolve({
          name,
          paths,
          users,
          duration,
          requests: result.requests.total,
          rps: Math.round(result.requests.average),
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99),
          max: sorted.at(-1) ?? 0,
          statuses,
          s5xx,
          non2xx: result.non2xx,
          errors: result.errors,
          timeouts: result.timeouts,
        });
      },
    );
    instance.on('response', (_client, statusCode, _bytes, responseTime) => {
      times.push(responseTime);
      statuses[statusCode] = (statuses[statusCode] ?? 0) + 1;
    });
  });
}

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const verdict = (r) =>
  r.s5xx === 0 && r.errors === 0 && r.timeouts === 0 && r.p95 < 1500 ? 'CUMPLE' : 'NO CUMPLE';

let results = [];
try {
  let web = process.env.WEB_URL ?? 'http://localhost:3100';
  let api = process.env.API_URL ?? 'http://localhost:4000';
  if (!args.includes('--no-start')) {
    const urls = await startStack({
      // El límite general de la API no debe falsear la prueba (todas las conexiones son de una IP).
      extraApiEnv: {},
    });
    web = urls.web;
    api = urls.api;
  }
  console.log(`Carga: ${users} usuarios virtuales, ${duration} s por escenario.\n`);
  // Calentamiento: la primera página de cada ruta compila/cachea (ISR); no se mide.
  for (const p of ['/', '/estudiantes', '/novedades']) await fetch(web + p).catch(() => null);

  results = [
    await scenario('Sitio público (Inicio + Estudiantes + Novedades)', web, [
      '/',
      '/estudiantes',
      '/novedades',
    ]),
    await scenario('Solo Inicio', web, ['/']),
    await scenario('Solo Estudiantes', web, ['/estudiantes']),
    await scenario('Solo Novedades', web, ['/novedades']),
    await scenario('API pública directa (home + students + publications)', api, [
      '/api/v1/public/home',
      '/api/v1/public/students',
      '/api/v1/public/publications',
    ]),
  ];
} finally {
  killAll();
}

const lines = [
  `# Prueba de carga del sitio público — ${today}`,
  '',
  `Herramienta: autocannon (Node). ${users} usuarios virtuales concurrentes sin pausas, ${duration} s por escenario, contra el build de producción (\`next start\`) + API de producción en la misma máquina de desarrollo. Objetivo (RNF05/RNF09): sin errores 5xx y p95 < 1,5 s.`,
  '',
  '| Escenario | Pedidos | Req/s | p50 | p95 | p99 | Máx. | 5xx | Errores de conexión | Veredicto |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...results.map(
    (r) =>
      `| ${r.name} | ${r.requests} | ${r.rps} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${fmt(r.max)} | ${r.s5xx} | ${r.errors + r.timeouts} | ${verdict(r)} |`,
  ),
  '',
  'Códigos de estado por escenario: ' +
    results.map((r) => `${r.name}: ${JSON.stringify(r.statuses)}`).join(' · '),
  '',
];
const md = lines.join('\n');
console.log('\n' + md);
if (out) {
  const file = path.resolve(root, out);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, md);
  console.log(`Guardado en ${file}`);
}
process.exit(results.every((r) => verdict(r) === 'CUMPLE') ? 0 : 1);
