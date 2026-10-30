// Empaqueta la entrega: dist-entrega/ifts2-plataforma-<fecha>.zip  (`pnpm package`).
//
// Usa `git archive` sobre HEAD: solo entra lo que está versionado, o sea SIN node_modules, .next, uploads/, .env
// ni ningún secreto (todo eso está en .gitignore). Incluye docs/ (con el PDF de la entrega), prisma/ (migraciones y
// semilla), scripts/ y .env.example. Las capturas intermedias de Cypress se excluyen (.gitattributes: export-ignore).
// Antes de generar el zip comprueba que el árbol de trabajo esté limpio (si no, el zip no tendría tus cambios) y
// después revisa el contenido: falla si encuentra un .env, node_modules, .next o uploads.
//
// Uso: node scripts/package.mjs [--allow-dirty]
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) =>
  execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const dirty = git('status', '--porcelain', '--untracked-files=no').trim();
if (dirty && !process.argv.includes('--allow-dirty')) {
  console.error(
    'Hay cambios sin commitear: el zip se arma desde HEAD y no los incluiría.\n' + dirty,
  );
  console.error('\nHacé commit (o usá --allow-dirty si es a propósito).');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const outDir = path.join(root, 'dist-entrega');
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `ifts2-plataforma-${date}.zip`);
git('archive', '--format=zip', '--prefix=ifts2-plataforma/', '-o', out, 'HEAD');

// Verificación del contenido.
const names = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\n')
  .filter(Boolean);
const forbidden = names.filter(
  (n) =>
    /(^|\/)(node_modules|\.next|\.next-degraded|uploads|dist-entrega)\//.test(n) ||
    /(^|\/)\.env($|\.local)/.test(n),
);
if (forbidden.length) {
  console.error(
    'El repositorio versiona archivos que no deberían ir en la entrega:\n' + forbidden.join('\n'),
  );
  process.exit(1);
}
const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`Zip generado: ${path.relative(root, out)} (${mb} MB)`);
