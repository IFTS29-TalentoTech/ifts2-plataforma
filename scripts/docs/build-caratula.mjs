// Genera la carátula de entrega de una hoja: docs/entrega/Caratula-Entrega.pdf  (`pnpm docs:caratula`).
//
// Es la hoja que se sube a la plataforma de la facultad: nombre del equipo, integrantes, descripción breve y los
// dos enlaces (carpeta de Drive y repositorio). Si cambia un enlace, editá las constantes de abajo y volvé a correr
// el comando. Usa los colores de apps/web/src/styles/tokens.css y Chrome headless (CHROME_PATH para otra ruta).
//
// Uso: node scripts/docs/build-caratula.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ------------------------------------------------------------------ datos editables
const DRIVE_URL = 'https://drive.google.com/drive/folders/1UNzvDp6loFH1cEmlk3ogOX_Ol3Lwo_UN';
const REPO_URL = 'https://github.com/IFTS29-TalentoTech/ifts2-plataforma';

const TEAM = [
  ['Santiago Cuda', 'DevOps'],
  ['Adrián Madroñal', 'QA'],
  ['Martín Juan', 'Product Owner'],
  ['Nicolás Rolón', 'Backend'],
  ['Gastón Zampar', 'Frontend'],
];

// ------------------------------------------------------------------ Chrome y rutas
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const entrega = path.join(root, 'docs', 'entrega');
const outPdf = path.join(entrega, 'Caratula-Entrega.pdf');
const htmlFile = path.join(entrega, '.build-caratula.html');

const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encontré Google Chrome. Indicá la ruta con CHROME_PATH.');
  process.exit(1);
}

const tokensCss = readFileSync(
  path.join(root, 'apps', 'web', 'src', 'styles', 'tokens.css'),
  'utf8',
);
const today = new Date().toLocaleDateString('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Carátula de entrega — Talento Tech</title>
<style>
${tokensCss}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html { font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif; font-size: 10.5pt; line-height: 1.5; color: var(--color-accent-3); background: var(--color-base); }
body { margin: 0; }
.sheet { position: relative; width: 210mm; height: 296mm; padding: 26mm 22mm 16mm 32mm; overflow: hidden; }
.bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14mm; background: var(--color-primary); }
.bar::after { content: ""; position: absolute; left: 14mm; top: 0; bottom: 0; width: 3mm; background: var(--color-accent-3); }
.eyebrow { font-weight: 700; font-size: 9.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-primary-strong); margin: 0 0 6mm; }
h1 { font-family: var(--font-display); font-size: 32pt; line-height: 1.1; margin: 0 0 3mm; }
.sub { font-size: 14pt; color: var(--color-accent); margin: 0 0 9mm; }
h4 { text-transform: uppercase; letter-spacing: 0.08em; font-size: 8.5pt; color: var(--color-primary-strong); margin: 0 0 2mm; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-bottom: 8mm; }
ul { list-style: none; padding: 0; margin: 0; }
li { margin: 0 0 1mm; }
li span { color: var(--color-font-strong); }
p { margin: 0 0 3mm; }
.desc { border-left: 4px solid var(--color-primary); padding: 1mm 0 1mm 5mm; margin-bottom: 9mm; }
.links { border-top: 1px solid var(--color-accent-2); padding-top: 6mm; }
.link { margin-bottom: 4mm; }
.link b { display: block; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-primary-strong); }
.link a { color: var(--color-accent); font-weight: 600; word-break: break-all; text-decoration: none; }
.foot { position: absolute; left: 32mm; right: 22mm; bottom: 12mm; font-size: 8.5pt; color: var(--color-font-strong); border-top: 1px solid var(--color-accent-2); padding-top: 3mm; }
</style></head><body>
<div class="sheet">
  <div class="bar"></div>
  <p class="eyebrow">Práctica Profesionalizante IV · Etapa 3 · Desarrollo completo</p>
  <h1>Talento Tech</h1>
  <p class="sub">IFTS N.° 29 · Tecnicatura Superior en Desarrollo de Software</p>

  <div class="grid">
    <div>
      <h4>Integrantes</h4>
      <ul>${TEAM.map(([n, r]) => `<li>${n} <span>· ${r}</span></li>`).join('')}</ul>
    </div>
    <div>
      <h4>Docentes</h4>
      <ul><li>Prof. Lic. Emir García Ontiveros</li><li>Prof. Lic. Kevin Del Bello</li></ul>
      <h4 style="margin-top:5mm">Cliente</h4>
      <p>IFTS N.° 2 DE 20 · Gobierno de la Ciudad de Buenos Aires</p>
    </div>
  </div>

  <h4>El proyecto</h4>
  <div class="desc">
    <p><strong>Plataforma web del IFTS N.° 2.</strong> Moderniza el sitio institucional del instituto (Tecnicatura Superior en Emprendimientos Gastronómicos), que estaba en Google Sites y sin forma de mantenerse.</p>
    <p>Incluye un sitio público (la carrera, ingreso, inscripciones, novedades, contacto) y un panel de administración con roles para que el personal no técnico publique avisos, horarios y mesas de examen, archive documentos y modere las publicaciones de Instagram. El contenido vencido se archiva y no se borra. Es un desarrollo propio con Next.js, Express y PostgreSQL, con pruebas automatizadas, Manual Técnico y Manual de Usuario.</p>
  </div>

  <div class="links">
    <div class="link"><b>Carpeta de Drive</b><a href="${DRIVE_URL}">${DRIVE_URL}</a></div>
    <div class="link"><b>Repositorio (rama main)</b><a href="${REPO_URL}">${REPO_URL}</a></div>
  </div>

  <div class="foot">Entrega de la Etapa 3 · ${today}</div>
</div>
</body></html>`;

writeFileSync(htmlFile, html);
const profile = mkdtempSync(path.join(tmpdir(), 'ifts2-chrome-'));
try {
  const r = spawnSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${profile}`,
      '--allow-file-access-from-files',
      '--no-pdf-header-footer',
      `--print-to-pdf=${outPdf}`,
      pathToFileURL(htmlFile).href,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  if (r.status !== 0 || !existsSync(outPdf)) {
    console.error(r.stdout, r.stderr);
    throw new Error('Chrome no pudo generar el PDF.');
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
  rmSync(htmlFile, { force: true });
}
console.log(`Carátula generada: ${path.relative(root, outPdf)}`);
