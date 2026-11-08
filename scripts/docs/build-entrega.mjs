// Genera el PDF único de la entrega: docs/entrega/IFTS2-Etapa-3-Documentacion.pdf  (`pnpm docs:pdf`).
//
// Pasos: (1) regenera el DER y las tablas desde prisma/schema.prisma (prisma-to-docs.mjs), (2) convierte los
// Markdown de docs/entrega/ a un único HTML con estilos (variables de color de apps/web/src/styles/tokens.css),
// (3) imprime ese HTML a PDF con Chrome headless (los diagramas Mermaid se dibujan en el navegador) y
// (4) completa los números de página del índice buscando cada título en el PDF (con `pdftotext`, si está).
//
// Requisitos: Google Chrome (CHROME_PATH para otra ruta), `pnpm install` (marked y mermaid son devDependencies).
// Uso: node scripts/docs/build-entrega.mjs [--no-regen] [--solo=Manual-Tecnico|Manual-de-Usuario]
// Con --solo genera un PDF aparte de un único manual (docs/entrega/<manual>.pdf); `pnpm docs:pdf:all` genera los tres.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const entrega = path.join(root, 'docs', 'entrega');
const solo = process.argv.find((a) => a.startsWith('--solo='))?.slice('--solo='.length);
const outPdf = path.join(entrega, solo ? `${solo}.pdf` : 'IFTS2-Etapa-3-Documentacion.pdf');
const htmlFile = path.join(entrega, solo ? '.build-solo.html' : '.build.html'); // junto a los .md: las imágenes se resuelven con las mismas rutas relativas

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

if (!process.argv.includes('--no-regen')) {
  execFileSync('node', [path.join(root, 'scripts', 'docs', 'prisma-to-docs.mjs')], {
    stdio: 'inherit',
  });
}

// ------------------------------------------------------------------ contenido
const ALL_PARTS = [
  { file: 'Enlaces.md', eyebrow: null },
  { file: 'Manual-Tecnico.md', eyebrow: 'Parte I' },
  { file: 'Manual-de-Usuario.md', eyebrow: 'Parte II' },
  { file: 'Evidencias-de-pruebas.md', eyebrow: 'Parte III' },
];
// En modo --solo se imprime un único manual, sin «Parte I/II» en los títulos.
const PARTS = solo
  ? ALL_PARTS.filter((p) => p.file === `${solo}.md`).map((p) => ({ ...p, eyebrow: null }))
  : ALL_PARTS;
if (!PARTS.length) {
  console.error(`--solo=${solo} no coincide con ningún Markdown de docs/entrega/.`);
  process.exit(1);
}
const SOLO_TITLES = {
  'Manual-Tecnico': 'Manual Técnico',
  'Manual-de-Usuario': 'Manual de Usuario',
};

const slugs = new Map();
const slugify = (text) => {
  let base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const n = slugs.get(base) ?? 0;
  slugs.set(base, n + 1);
  return n ? `${base}-${n}` : base;
};

const toc = []; // { level, text, id, part }
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

function renderPart(part) {
  const md = readFileSync(path.join(entrega, part.file), 'utf8');
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const html = this.parser.parseInline(tokens);
    const text = plain(html);
    const id = slugify(text);
    if (depth <= 2) toc.push({ level: depth, text, id, part: part.eyebrow });
    return `<h${depth} id="${id}">${html}</h${depth}>\n`;
  };
  renderer.code = ({ text, lang }) =>
    lang === 'mermaid'
      ? `<pre class="mermaid">${esc(text)}</pre>\n`
      : `<pre><code>${esc(text)}</code></pre>\n`;
  renderer.image = ({ href, text }) =>
    `<figure><img src="${href}" alt="${esc(text ?? '')}"><figcaption>${esc(text ?? '')}</figcaption></figure>`;
  marked.use({ gfm: true, renderer });
  let html = marked.parse(md);
  // Una imagen dentro de una celda de tabla no lleva figure/caption (queda chica y alineada).
  html = html.replace(
    /<td>([\s\S]*?)<\/td>/g,
    (_m, inner) =>
      `<td>${inner.replace(/<figure><img ([^>]*?)><figcaption>[^<]*<\/figcaption><\/figure>/g, '<img class="cell" $1>')}</td>`,
  );
  const eyebrow = part.eyebrow ? `<div class="eyebrow">${part.eyebrow}</div>\n` : '';
  return `<section class="part">\n${eyebrow}${html}</section>\n`;
}

// ------------------------------------------------------------------ portada e índice
const tokensCss = readFileSync(
  path.join(root, 'apps', 'web', 'src', 'styles', 'tokens.css'),
  'utf8',
);
const today = new Date().toLocaleDateString('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const cover = `
<section class="cover">
  <div class="cover-bar"></div>
  <p class="cover-eyebrow">Práctica Profesionalizante IV · Etapa 3 · Desarrollo completo</p>
  <h1 class="cover-title">Plataforma web del IFTS N.°&nbsp;2</h1>
  <p class="cover-sub">${solo ? (SOLO_TITLES[solo] ?? solo) : 'Documentación de la entrega: Manual Técnico, Manual de Usuario, evidencias de pruebas y CRUD'}</p>
  <div class="cover-grid">
    <div><h4>Equipo</h4><p><strong>Talento Tech</strong> (IFTS N.° 29)</p>
      <ul><li>Santiago Cuda</li><li>Adrián Madroñal</li><li>Martín Juan</li><li>Nicolás Rolón</li><li>Gastón Zampar</li></ul></div>
    <div><h4>Materia</h4><p>Práctica Profesionalizante IV<br>Tecnicatura Superior en Desarrollo de Software</p>
      <h4>Docentes</h4><ul><li>Prof. Lic. Emir García Ontiveros</li><li>Prof. Lic. Kevin Del Bello</li></ul></div>
  </div>
  <p class="cover-foot">${esc(today)} · Cliente: IFTS N.° 2 DE 20, Gobierno de la Ciudad de Buenos Aires</p>
</section>`;

function tocHtml(pages) {
  const rows = toc
    .map((t) => {
      const label = t.part && t.level === 1 ? `${t.part} · ${t.text}` : t.text;
      const n = pages?.get(t.id) ?? '';
      return `<li class="l${t.level}"><a href="#${t.id}"><span>${esc(label)}</span><span class="pg">${n}</span></a></li>`;
    })
    .join('\n');
  return `<section class="toc"><h1 class="no-toc">Índice</h1><ul>${rows}</ul><div class="toc-end">FINDELINDICE</div></section>`;
}

const CSS = `
${tokensCss}
@page { size: A4; margin: 18mm 16mm 20mm 16mm; @bottom-center { content: counter(page); font: 9pt var(--font-sans); color: var(--color-font-strong); } @bottom-left { content: "IFTS N.° 2 · Etapa 3"; font: 8pt var(--font-sans); color: var(--color-font-strong); } }
@page :first { margin: 0; @bottom-center { content: none; } @bottom-left { content: none; } }
* { box-sizing: border-box; }
html { font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif; font-size: 10pt; line-height: 1.5; color: var(--color-accent-3); background: var(--color-surface); }
body { margin: 0; }
h1, h2, h3, h4 { font-family: var(--font-display); color: var(--color-accent-3); line-height: 1.25; break-after: avoid; }
h1 { font-size: 22pt; border-bottom: 3px solid var(--color-primary); padding-bottom: 6pt; margin: 0 0 12pt; }
h2 { font-size: 15pt; margin: 20pt 0 6pt; color: var(--color-accent); border-bottom: 1px solid var(--color-accent-2); padding-bottom: 3pt; }
h3 { font-size: 12pt; margin: 14pt 0 4pt; color: var(--color-accent); }
h4 { font-size: 10.5pt; margin: 10pt 0 3pt; }
p { margin: 0 0 7pt; orphans: 3; widows: 3; }
a { color: var(--color-accent); text-decoration: none; }
code { font-family: Consolas, 'Courier New', monospace; font-size: 8.6pt; background: var(--color-base); padding: 0.5pt 3pt; border-radius: 3px; color: var(--color-accent); }
pre { background: var(--color-accent-3); color: var(--color-base); padding: 8pt 10pt; border-radius: 6px; font-size: 8pt; line-height: 1.4; white-space: pre-wrap; word-break: break-word; break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: inherit; }
pre.mermaid { background: var(--color-surface); color: inherit; border: 1px solid var(--color-accent-2); text-align: center; white-space: normal; margin: 8pt 0 12pt; }
pre.mermaid svg { max-width: 100%; height: auto; max-height: 215mm; }
blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 4px solid var(--color-primary); background: var(--color-warning-back); border-radius: 0 6px 6px 0; break-inside: avoid; }
blockquote p:last-child { margin: 0; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 8.6pt; line-height: 1.38; }
th { background: var(--color-accent); color: #fff; text-align: left; padding: 4pt 6pt; font-weight: 700; }
td { padding: 4pt 6pt; border-bottom: 1px solid var(--color-accent-2); vertical-align: top; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
tbody tr:nth-child(even) td { background: var(--color-base); }
ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
li { margin: 1.5pt 0; }
hr { border: 0; border-top: 1px solid var(--color-accent-2); margin: 12pt 0; }
figure { margin: 8pt 0 12pt; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; max-height: 195mm; width: auto; height: auto; border: 1px solid var(--color-accent-2); border-radius: 6px; box-shadow: var(--shadow-card); }
figure img[src*="-390"] { max-height: 150mm; }
figcaption { display: none; }
img.cell { max-width: 100%; max-height: 62mm; width: auto; border: 1px solid var(--color-accent-2); border-radius: 4px; display: block; margin: 2pt 0; }
.part { break-before: page; }
.eyebrow { font: 700 9pt var(--font-sans); letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-primary-strong); margin-bottom: 4pt; }
.cover { height: 297mm; width: 210mm; position: relative; background: var(--color-base); padding: 38mm 24mm 20mm 24mm; break-after: page; overflow: hidden; }
.cover-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14mm; background: var(--color-primary); }
.cover-bar::after { content: ""; position: absolute; left: 14mm; top: 0; bottom: 0; width: 3mm; background: var(--color-accent-3); }
.cover-eyebrow { font: 700 10pt var(--font-sans); letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-primary-strong); margin: 0 0 10mm; }
.cover-title { font-size: 34pt; border: 0; line-height: 1.1; padding: 0; margin: 0 0 8mm; color: var(--color-accent-3); }
.cover-sub { font-size: 14pt; color: var(--color-accent); max-width: 150mm; margin-bottom: 26mm; }
.cover-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14mm; }
.cover-grid h4 { text-transform: uppercase; letter-spacing: 0.08em; font-size: 8.5pt; color: var(--color-primary-strong); margin: 0 0 3pt; }
.cover-grid ul { list-style: none; padding: 0; margin: 0 0 8pt; }
.cover-grid li { margin: 0; font-size: 11pt; }
.cover-grid p { font-size: 11pt; margin-bottom: 8pt; }
.cover-foot { position: absolute; left: 24mm; right: 20mm; bottom: 16mm; font-size: 9pt; color: var(--color-font-strong); border-top: 1px solid var(--color-accent-2); padding-top: 6pt; }
.toc { break-before: page; break-after: page; }
.toc ul { list-style: none; padding: 0; }
.toc li { margin: 0; }
.toc a { display: flex; gap: 8pt; padding: 2pt 0; color: var(--color-accent-3); border-bottom: 1px dotted var(--color-accent-2); }
.toc a span:first-child { flex: 1; }
.toc .pg { min-width: 16pt; text-align: right; color: var(--color-font-strong); font-variant-numeric: tabular-nums; }
.toc .l1 a { font-weight: 800; margin-top: 8pt; color: var(--color-accent); }
.toc-end { font-size: 1pt; color: #fff; }
.toc .l2 { padding-left: 12pt; font-size: 9.4pt; }
`;

const MERMAID_JS = pathToFileURL(
  path.join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
).href;

function pageHtml(body, pages) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>IFTS N.° 2 — Etapa 3: documentación</title>
<style>${CSS}</style>
<script src="${MERMAID_JS}"></script>
<script>
  mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'loose',
    themeVariables: { fontFamily: 'Segoe UI, system-ui, sans-serif', fontSize: '13px', primaryColor: '#E0DFD5', primaryBorderColor: '#6F5142', primaryTextColor: '#291711', lineColor: '#6F5142', secondaryColor: '#F6F6F3', tertiaryColor: '#FFFFFF' },
    flowchart: { useMaxWidth: true, htmlLabels: true }, sequence: { useMaxWidth: true } });
  // Se dibujan de a uno con ids propios (con startOnLoad dos diagramas podían compartir id y pisarse).
  window.addEventListener('load', async () => {
    const blocks = [...document.querySelectorAll('pre.mermaid')];
    for (let i = 0; i < blocks.length; i++) {
      try { blocks[i].innerHTML = (await mermaid.render('mmd' + i, blocks[i].textContent)).svg; }
      catch (e) { blocks[i].textContent = '[diagrama no disponible: ' + e.message + ']'; }
    }
  });
</script></head><body>
${cover}
${tocHtml(pages)}
${body}
</body></html>`;
}

// ------------------------------------------------------------------ impresión
function printPdf() {
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
        '--virtual-time-budget=60000',
        `--print-to-pdf=${outPdf}`,
        pathToFileURL(htmlFile).href,
      ],
      { encoding: 'utf8', timeout: 240_000 },
    );
    if (r.status !== 0 || !existsSync(outPdf)) {
      console.error(r.stdout, r.stderr);
      throw new Error('Chrome no pudo generar el PDF.');
    }
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/** Lee el texto de cada página con pdftotext (si está instalado) para numerar el índice. */
function pageTexts() {
  const r = spawnSync('pdftotext', ['-enc', 'UTF-8', '-layout', outPdf, '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout.split('\f');
}

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // quita los acentos (pdftotext puede devolverlos descompuestos)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();

const body = PARTS.map(renderPart).join('\n');
writeFileSync(htmlFile, pageHtml(body, null));
printPdf();

const texts = pageTexts();
if (texts) {
  const pages = new Map();
  const from0 = texts.findIndex((t) => t.includes('FINDELINDICE')) + 1;
  let from = Math.max(from0, 2);
  for (const t of toc) {
    const needle = norm(t.text).slice(0, 50);
    let found = -1;
    for (let i = from; i < texts.length; i++) {
      const hit = texts[i].split(String.fromCharCode(10)).some((ln) => {
        const n = norm(ln);
        return n.startsWith(needle) && n.length <= needle.length + 4;
      });
      if (hit) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      pages.set(t.id, found + 1);
      from = found;
    }
  }
  writeFileSync(htmlFile, pageHtml(body, pages));
  printPdf();
} else {
  console.warn(
    'pdftotext no está disponible: el índice queda sin números de página (con enlaces).',
  );
}

if (!process.env.KEEP_HTML) rmSync(htmlFile, { force: true });
const finalTexts = pageTexts();
console.log(
  `PDF generado: ${path.relative(root, outPdf)}${finalTexts ? ` (${finalTexts.length - 1} páginas)` : ''}`,
);
