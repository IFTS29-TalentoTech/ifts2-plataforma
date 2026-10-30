// Corre toda la suite Cypress de punta a punta con un solo comando: `pnpm e2e`.
//
// Qué hace (y por qué):
//  1. (opcional) `--reset`: recrea la base de desarrollo con la semilla demo, para partir de un estado conocido.
//  2. (opcional) `--build`: compila API y web (la suite corre contra el build de producción).
//  3. Levanta la API y la web en puertos propios (por defecto 4000 y 3100; el 3000 suele estar ocupado)
//     y una segunda web con la API caída (puerto +1) para el spec de degradación (RNF03).
//  4. Corre Cypress (sin ELECTRON_RUN_AS_NODE, que impide arrancar Electron).
//  5. Cierra todos los procesos que levantó, pase lo que pase.
//
// La API se levanta con LOGIN_MAX_ATTEMPTS alto: los specs inician sesión muchas veces desde la misma
// IP y un solo fallo real (p. ej. comprobar que un usuario desactivado no entra) cuenta para el
// límite por IP de ADR-06. El bloqueo real (5 intentos) está cubierto por las pruebas de API y por una
// respuesta simulada en el spec de login.
//
// Uso: node scripts/e2e.mjs [--reset] [--build] [--spec "cypress/e2e/public/**"] [--browser chrome]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { killAll, root, startStack } from './lib/stack.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const isWin = process.platform === 'win32';

function run(cmd, cmdArgs, env) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`Falló: ${cmd} ${cmdArgs.join(' ')}`);
}

let code = 1;
try {
  if (flag('--reset')) run('pnpm', ['db:reset'], { SEED_MODE: 'demo' });
  if (flag('--build')) run('pnpm', ['build'], { ENABLE_UI_KIT: 'true' });

  const urls = await startStack({
    apiPort: Number(process.env.E2E_API_PORT ?? 4000),
    webPort: Number(process.env.E2E_WEB_PORT ?? 3100),
    degraded: true,
    extraApiEnv: { LOGIN_MAX_ATTEMPTS: '1000' },
  });

  const cyArgs = ['cypress', 'run'];
  if (opt('--spec')) cyArgs.push('--spec', opt('--spec'));
  if (opt('--browser')) cyArgs.push('--browser', opt('--browser'), '--headless');
  const env = { ...process.env, CYPRESS_BASE_URL: urls.web, DEGRADED_URL: urls.degraded };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync('npx', cyArgs, {
    cwd: path.join(root, 'apps/web'),
    stdio: 'inherit',
    shell: isWin,
    env,
  });
  code = r.status ?? 1;
} catch (e) {
  console.error(String(e));
} finally {
  killAll();
}
process.exit(code);
