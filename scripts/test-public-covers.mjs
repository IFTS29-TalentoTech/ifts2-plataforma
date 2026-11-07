// A06: API e imágenes simuladas; prueba la web compilada sin PostgreSQL ni servicios externos.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiOrigin = 'http://127.0.0.2:4100';
const webOrigin = 'http://localhost:3200';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAYAAAA7KqwyAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQokWNgGAWjgIFyAAACSQABOhaGKQAAAABJRU5ErkJggg==',
  'base64',
);
const covers = {
  propia: `${apiOrigin}/cover.png`,
  externa: 'https://covers.example.test/manual.png',
  firmada: 'https://bucket.example.test/social/copia.png?X-Amz-Signature=demo&X-Amz-Expires=300',
  instagram: `${apiOrigin}/api/v1/files/social/copia.png?exp=9999999999&sig=demo`,
  vencida: `${apiOrigin}/api/v1/files/social/vencida.png?exp=1&sig=demo`,
  ausente: 'https://covers.example.test/ausente.png',
  sin: null,
};
const publications = Object.entries(covers).map(([id, coverUrl]) => ({
  id,
  coverUrl,
  title: `Portada ${id}`,
  kind: 'NEWS',
  summary: 'Publicación de prueba de portadas.',
  category: null,
  section: 'BOTH',
  origin: id === 'instagram' ? 'INSTAGRAM' : 'MANUAL',
  date: '2026-11-01T12:00:00.000Z',
  visibleUntil: null,
  eventStart: null,
  eventEnd: null,
  location: null,
}));
const api = createServer((req, res) => {
  const url = new URL(req.url, apiOrigin);
  if (url.pathname.endsWith('.png')) {
    res.writeHead(url.pathname.includes('vencida') ? 403 : 200, { 'Content-Type': 'image/png' });
    return res.end(url.pathname.includes('vencida') ? '' : png);
  }
  let body;
  if (url.pathname === '/api/v1/public/settings') body = {};
  if (url.pathname === '/api/v1/public/home') {
    body = {
      publications,
      quickLinks: [],
      highlightedNotices: [],
      highlightedExamCalls: [],
    };
  }
  if (url.pathname === '/api/v1/public/publications') {
    body = {
      items: publications,
      total: publications.length,
      page: 1,
      pageSize: 12,
      year: 2026,
      availableYears: [2026],
      categories: [],
    };
  }
  const publication = publications.find(
    (p) => url.pathname === `/api/v1/public/publications/${p.id}`,
  );
  if (publication) body = { ...publication, body: 'Contenido de la publicación.', permalink: null };
  res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body ?? { title: 'Recurso no simulado' }));
});

const children = new Set();
const env = { ...process.env, API_ORIGIN: apiOrigin, APP_ORIGIN: webOrigin };
// El segundo loopback distingue el origen confiable del navegador sin salir del equipo.
env.NO_PROXY = `${env.NO_PROXY ?? ''},127.0.0.2`;
env.no_proxy = `${env.no_proxy ?? ''},127.0.0.2`;
delete env.NEXT_DIST_DIR;
delete env.ELECTRON_RUN_AS_NODE;
function start(args) {
  const child = spawn('pnpm', args, { cwd: root, env, stdio: 'inherit', detached: true });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
async function run(args) {
  const [code] = await once(start(args), 'exit');
  if (code !== 0) throw new Error(`Falló pnpm ${args.join(' ')} (${code})`);
}
async function waitForWeb(child) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('La web terminó antes de estar disponible.');
    try {
      if ((await fetch(webOrigin)).ok) return;
    } catch {
      // Se espera únicamente al proceso local recién iniciado.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('La web de portadas no inició a tiempo.');
}

try {
  api.listen(4100, '0.0.0.0');
  await once(api, 'listening');
  await run(['--filter', '@ifts2/web', 'build']);
  const web = start(['--filter', '@ifts2/web', 'start', '--port', '3200']);
  await waitForWeb(web);
  env.CYPRESS_BASE_URL = webOrigin;
  await run([
    '--filter',
    '@ifts2/web',
    'exec',
    'cypress',
    'run',
    '--config-file',
    'cypress.covers.config.ts',
  ]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // El proceso puede haber terminado entre la comprobación y el cierre.
    }
  }
  api.closeAllConnections();
  api.close();
}
