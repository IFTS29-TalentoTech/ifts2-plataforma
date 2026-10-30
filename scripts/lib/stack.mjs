// Levanta y cierra API + web (build de producción) para las pruebas de punta a punta, de carga y de
// Lighthouse. Lo comparten `scripts/e2e.mjs` y `scripts/load/*.mjs`.
//
// Importante: nunca toca procesos ajenos. Solo mata los que lanzó este módulo (y su árbol).
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '../..');
const isWin = process.platform === 'win32';
const logDir = path.join(root, '.e2e-logs');
mkdirSync(logDir, { recursive: true });

const children = [];

/** Lanza un proceso hijo con su salida en `.e2e-logs/<name>.log`. */
export function start(name, cmd, cmdArgs, cwd, env = {}) {
  const out = createWriteStream(path.join(logDir, `${name}.log`));
  const child = spawn(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, ...env },
    shell: isWin,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  children.push({ name, child });
  return child;
}

/** Cierra todo lo lanzado. En Windows hay que matar el árbol (shell -> node). */
export function killAll() {
  for (const { child } of children) {
    if (!child.pid) continue;
    if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  children.length = 0;
}

export async function waitFor(url, label, ms = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* todavía no está */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} no respondió en ${ms / 1000} s (${url}). Mirá ${logDir}`);
}

/**
 * Levanta la API (dist/server.js) y la web (`next start`) ya compiladas.
 * `degraded: true` suma una segunda web con la API caída (spec de degradación, RNF03).
 */
export async function startStack({
  apiPort = 4000,
  webPort = 3100,
  degraded = false,
  extraApiEnv = {},
} = {}) {
  const web = `http://localhost:${webPort}`;
  const env = {
    APP_ORIGIN: web,
    API_PORT: String(apiPort),
    API_ORIGIN: `http://localhost:${apiPort}`,
    ENABLE_UI_KIT: 'true',
  };
  start('api', 'node', ['--env-file=../../.env', 'dist/server.js'], path.join(root, 'apps/api'), {
    ...env,
    ...extraApiEnv,
    NODE_ENV: 'production',
  });
  start('web', 'npx', ['next', 'start', '-p', String(webPort)], path.join(root, 'apps/web'), env);
  if (degraded) {
    start(
      'web-degradada',
      'npx',
      ['next', 'start', '-p', String(webPort + 1)],
      path.join(root, 'apps/web'),
      { ...env, API_ORIGIN: 'http://localhost:4999', NEXT_DIST_DIR: '.next-degraded' },
    );
  }
  await waitFor(`http://localhost:${apiPort}/health`, 'La API');
  await waitFor(web, 'La web');
  if (degraded) await waitFor(`http://localhost:${webPort + 1}`, 'La web degradada');
  return { web, api: `http://localhost:${apiPort}`, degraded: `http://localhost:${webPort + 1}` };
}

process.on('SIGINT', () => {
  killAll();
  process.exit(130);
});
