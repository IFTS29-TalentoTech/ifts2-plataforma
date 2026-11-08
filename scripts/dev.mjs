// `pnpm dev`: levanta la API y la web en modo desarrollo y, al cerrar (Ctrl+C, cerrar la terminal o
// si uno de los dos se cae), mata los DOS árboles de procesos.
//
// Por qué existe: con `pnpm -r --parallel dev` en Windows, Ctrl+C corta pnpm pero deja vivos al
// `tsx watch` de la API y al `next dev` de la web (son nietos de pnpm). Seguían ocupando los puertos
// 3000 y 4000 y mantenían abierto el motor de Prisma, que después impedía `pnpm db:generate`
// (EPERM al reemplazar query_engine-windows.dll.node).
//
// Solo mata los procesos que lanzó este script; nunca toca procesos ajenos.
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const isWin = process.platform === 'win32';

const services = [
  { name: 'api', port: Number(process.env.API_PORT ?? 4000), filter: '@ifts2/api' },
  { name: 'web', port: Number(process.env.PORT ?? 3000), filter: '@ifts2/web' },
];

/** true si el puerto está libre (no hay nadie escuchando). */
function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

const busy = [];
for (const s of services) if (!(await portIsFree(s.port))) busy.push(s);
if (busy.length) {
  for (const s of busy) {
    console.error(
      `\nEl puerto ${s.port} (${s.name}) ya está ocupado: probablemente quedó un "pnpm dev" anterior vivo.`,
    );
  }
  console.error(
    isWin
      ? '\nCerralo desde el Administrador de tareas (procesos "node.exe") o con:\n  Get-NetTCPConnection -LocalPort <puerto> -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }\n'
      : '\nCerralo con: lsof -ti :<puerto> | xargs kill\n',
  );
  process.exit(1);
}

const children = [];
let closing = false;

function killTree(child) {
  if (!child.pid) return;
  if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const c of children) killTree(c);
  process.exit(code);
}

for (const s of services) {
  const child = spawn('pnpm', ['--filter', s.filter, 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
  });
  children.push(child);
  // Si uno se cae, se cierra el otro: no queda a medias ocupando un puerto.
  child.on('exit', (code) => shutdown(code ?? 1));
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => shutdown(0));
process.on('exit', () => {
  if (!closing) for (const c of children) killTree(c);
});
