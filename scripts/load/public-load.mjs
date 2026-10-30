// Prueba de carga del sitio público (RNF05 y RNF09): `pnpm load`.
//
// Simula N usuarios virtuales concurrentes (400 por defecto, el pico de inscripciones del cliente)
// que navegan Inicio, Estudiantes y Novedades contra el build de producción + API, y mide la
// latencia exacta (p50/p95/p99) y los errores. Objetivo (RNF09): SIN errores 5xx y p95 < 1,5 s.
//
// Herramienta: autocannon (Node, sin instalar binarios; k6 requiere un instalador con permisos).
// Cada "usuario" es una conexión que recorre las tres páginas en ciclo, como una persona que navega.
// Dos perfiles:
//   - USO REAL: una página cada `--think` segundos por usuario (3 por defecto: lo que tarda alguien en
//     leer). Es el que evalúa el objetivo.
//   - SATURACIÓN: sin pausa entre pedidos (cada usuario insiste todo el tiempo). Es una prueba de estrés
//     para ver dónde se rompe; no es un uso humano.
// Se envía Accept-Encoding como lo hace un navegador.
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
const think = Number(opt('--think', 3));
const out = opt('--out', `docs/evidencias/${today}-carga-publico.md`);

const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0;

/** Corre un escenario y devuelve métricas exactas calculadas con cada respuesta. */
function scenario(name, baseUrl, paths, thinkSeconds = 0) {
  return new Promise((resolve) => {
    const times = [];
    const statuses = {};
    const instance = autocannon(
      {
        url: baseUrl,
        connections: users,
        duration,
        timeout: 30,
        headers: { 'accept-encoding': 'gzip, deflate, br' },
        // autocannon no admite menos de 1 pedido/s por conexión: se limita la tasa total (N usuarios / pausa).
        ...(thinkSeconds ? { overallRate: Math.round(users / thinkSeconds) } : {}),
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
          think: thinkSeconds,
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

const NOTE =
  '## Cómo leer estos números\n\n- **Uso real** (400 usuarios, un pedido cada 3 s por usuario, ~133 pedidos/s) es el perfil que evalúa RNF09. La base, la API y la web corren en la misma PC de desarrollo junto con el generador de carga.\n- **Saturación** (400 usuarios insistiendo sin pausa) es una prueba de estrés: muestra el techo de un único proceso de Node (~300-360 pedidos/s para Inicio, Estudiantes o Novedades). Los escenarios de una sola página arrojan reinicios de conexión y colas largas (p95 de varios segundos) al pasar ese techo; no hubo ningún 5xx. En producción el techo se sube con la caché de la plataforma de hosting/CDN (las páginas ya responden `s-maxage=60`) o con más de un proceso web.\n- Mejoras aplicadas a partir de la primera medición (`2026-10-30-carga-publico-antes-de-mejoras.txt`: Novedades se renderizaba por pedido y limitaba todo a ~40 pedidos/s): `/novedades` sin filtros pasó a ser estática con ISR; el resto del sitio ya lo era.\n';

let results;
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

  const pages = ['/', '/estudiantes', '/novedades'];
  const apiPaths = [
    '/api/v1/public/home',
    '/api/v1/public/students',
    '/api/v1/public/publications',
  ];
  results = [
    // Perfil de uso real (evalúa el objetivo).
    await scenario(
      `USO REAL: Inicio + Estudiantes + Novedades (1 pedido cada ${think} s por usuario)`,
      web,
      pages,
      think,
    ),
    await scenario(
      `USO REAL: API pública directa (1 pedido cada ${think} s por usuario)`,
      api,
      apiPaths,
      think,
    ),
    // Saturación (estrés).
    await scenario('SATURACIÓN: Inicio + Estudiantes + Novedades', web, pages),
    await scenario('SATURACIÓN: solo Inicio', web, ['/']),
    await scenario('SATURACIÓN: solo Estudiantes', web, ['/estudiantes']),
    await scenario('SATURACIÓN: solo Novedades', web, ['/novedades']),
    await scenario('SATURACIÓN: API pública directa', api, apiPaths),
  ];
} finally {
  killAll();
}

const lines = [
  `# Prueba de carga del sitio público — ${today}`,
  '',
  `Herramienta: autocannon (Node). ${users} usuarios virtuales concurrentes, ${duration} s por escenario, contra el build de producción (\`next start\`) + API de producción en la misma máquina de desarrollo. Objetivo (RNF05/RNF09): sin errores 5xx y p95 < 1,5 s en el perfil de **uso real**; los escenarios de **saturación** (sin pausa entre pedidos) son de estrés y no un uso humano.`,
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
// El código de salida evalúa solo el perfil de uso real.
process.exit(results.filter((r) => r.think).every((r) => verdict(r) === 'CUMPLE') ? 0 : 1);
