// Verificación de punta a punta de las historias H1 a H8 (+ contacto) y de la seguridad básica,
// contra la pila real (build de producción de API + web): `pnpm verify`.
//
// A diferencia de Cypress, esto pega a la API con HTTP y lee las páginas HTML de la web, así comprueba
// justo la integración: lo que el panel cambia en la API aparece en el sitio público (con la
// revalidación bajo demanda, sin esperar los 60 s de la caché). Limpia lo que crea; deja la base como estaba.
//
// Uso: node scripts/verify-flows.mjs [--out docs/evidencias/AAAA-MM-DD-flujos-y-seguridad.md] [--no-start]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { killAll, root, startStack } from './lib/stack.mjs';

const args = process.argv.slice(2);
const today = new Date().toISOString().slice(0, 10);
const outFile = args.includes('--out')
  ? args[args.indexOf('--out') + 1]
  : `docs/evidencias/${today}-flujos-y-seguridad.md`;
const PASSWORD = 'Demo-2026-ifts2';
// El administrador usa SEED_ADMIN_PASSWORD (.env.example); los demás roles la clave de la semilla demo.
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Cambiame-123!';
const stamp = Date.now().toString(36);

let WEB = process.env.WEB_URL ?? 'http://localhost:3100';
let API = process.env.API_URL ?? 'http://localhost:4000';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Cliente HTTP mínimo con la cookie de sesión de un rol. */
async function session(email, password = PASSWORD) {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, remember: false }),
  });
  if (res.status !== 204) throw new Error(`login ${email}: ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const call = async (method, url, body) => {
    const r = await fetch(`${API}/api/v1${url}`, {
      method,
      headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* no JSON */
    }
    return { status: r.status, json, text };
  };
  return {
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    put: (u, b = {}) => call('PUT', u, b),
    patch: (u, b = {}) => call('PATCH', u, b),
    del: (u) => call('DELETE', u),
  };
}

const page = async (route) => (await fetch(`${WEB}${route}`)).text();

/** Espera (máx. 6 s) a que una página pública contenga o deje de contener un texto. */
async function pageHas(route, text, expected = true) {
  for (let i = 0; i < 12; i++) {
    const html = await page(route);
    if (html.includes(text) === expected) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  const editor = await session('editor@ifts2.local');
  const bedelia = await session('bedelia@ifts2.local');
  const admin = await session('admin@ifts2.local', ADMIN_PASSWORD);

  // ---------- Seguridad ----------
  const panelRoutes = [
    '/dashboard',
    '/notices',
    '/publications',
    '/social/posts',
    '/users',
    '/audit',
    '/settings',
    '/integrations/instagram',
    '/integrations/mail',
    '/contact-messages',
    '/documents',
    '/terms',
    '/schedules',
    '/exam-calls',
    '/links',
    '/content/carrera',
    '/categories',
  ];
  const codes = await Promise.all(
    panelRoutes.map(async (p) => [p, (await fetch(`${API}/api/v1${p}`)).status]),
  );
  check(
    'Sin sesión, el panel responde 401 en todas las rutas probadas',
    codes.every(([, s]) => s === 401),
    codes.map(([p, s]) => `${p}:${s}`).join(' '),
  );
  const health = await (await fetch(`${API}/health`)).json();
  check(
    'GET /health solo expone estado y proveedor activo (sin secretos)',
    JSON.stringify(Object.keys(health).sort()) ===
      JSON.stringify(['api', 'db', 'demoMode', 'integrations', 'status', 'time']) &&
      !/secret|password|token|postgres/i.test(JSON.stringify(health)),
    JSON.stringify(health.integrations),
  );
  const hh = (await fetch(`${API}/health`)).headers;
  check(
    'Cabeceras de seguridad de la API (helmet)',
    hh.get('x-content-type-options') === 'nosniff' &&
      hh.get('content-security-policy') &&
      !hh.get('x-powered-by'),
    `csp=${Boolean(hh.get('content-security-policy'))} hsts=${hh.get('strict-transport-security') ?? '-'}`,
  );
  const wh = (await fetch(`${WEB}/`)).headers;
  check(
    'Cabeceras de seguridad de la web',
    wh.get('x-content-type-options') === 'nosniff' && !wh.get('x-powered-by'),
    `x-frame-options=${wh.get('x-frame-options') ?? '-'} csp=${Boolean(wh.get('content-security-policy'))}`,
  );
  const ck = (
    await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@ifts2.local', password: ADMIN_PASSWORD }),
    })
  ).headers
    .getSetCookie()
    .join(' ');
  check(
    'Cookie de sesión HttpOnly + SameSite=Lax',
    /httponly/i.test(ck) && /samesite=lax/i.test(ck),
    ck.replace(/=[^;]+/, '=•••').slice(0, 90),
  );

  // Secretos: se cargan valores reconocibles y se verifica que no salen en respuestas, auditoría ni logs.
  const SECRETS = [`APPSECRET-${stamp}`, `ACCESSTOKEN-${stamp}-0123456789`, `SMTPPASS-${stamp}`];
  const ig = await admin.put('/integrations/instagram', {
    mode: 'real',
    appId: '1234567890',
    appSecret: SECRETS[0],
    accessToken: SECRETS[1],
  });
  const mail = await admin.put('/integrations/mail', {
    smtpUrl: `smtp://usuario:${SECRETS[2]}@smtp.invalid:587`,
  });
  const views = [
    ig.text,
    mail.text,
    (await admin.get('/integrations/instagram')).text,
    (await admin.get('/integrations/mail')).text,
    (await admin.get('/audit?pageSize=100')).text,
    await fetch(`${API}/health`).then((r) => r.text()),
  ].join('\n');
  check(
    'Los secretos guardados no vuelven en ninguna respuesta ni en la auditoría',
    ig.status === 200 && mail.status === 200 && SECRETS.every((s) => !views.includes(s)),
    `PUT instagram=${ig.status} PUT mail=${mail.status}`,
  );
  // Restaura el estado (modo demostración, sin SMTP).
  await admin.post('/integrations/instagram/disconnect');
  await admin.put('/integrations/mail', { smtpUrl: null });
  await new Promise((r) => setTimeout(r, 400));
  let logs = '';
  try {
    logs = readFileSync(path.join(root, '.e2e-logs/api.log'), 'utf8');
  } catch {
    /* sin logs (modo --no-start) */
  }
  check(
    'Los secretos y las claves de inicio de sesión no aparecen en los logs de la API',
    logs.length > 0 && SECRETS.every((s) => !logs.includes(s)) && !logs.includes(PASSWORD),
    `${logs.length} bytes de log revisados`,
  );

  // ---------- H1 + H2: moderar una publicación de Instagram y verla en el sitio ----------
  const title = `Flujo H2 ${stamp}`;
  const manual = await editor.post('/social/manual', {
    permalink: `https://www.instagram.com/p/FLUJO${stamp}/`,
    caption: `${title} #ifts2web`,
    mediaUrl: 'https://example.invalid/flujo.jpg',
    postedAt: new Date().toISOString().slice(0, 10),
  });
  check(
    'H1 · la publicación entra al panel como PENDIENTE',
    manual.status === 201 && manual.json?.status === 'DETECTED',
  );
  check(
    'H1 · nada llega al sitio sin aprobación humana',
    !(await page('/novedades')).includes(title) && !(await page('/')).includes(title),
  );
  const approved = await editor.post(`/social/posts/${manual.json?.id}/approve`, {
    title,
    summary: 'Publicación aprobada por el flujo de verificación.',
    section: 'BOTH',
    consentConfirmed: true,
  });
  check(
    'H2 · aprobar con consentimiento crea la publicación',
    approved.status === 201,
    `status ${approved.status}`,
  );
  check(
    'H2 · aparece en /novedades al instante (revalidación bajo demanda)',
    await pageHas('/novedades', title),
  );
  check('H2 · aparece en el Inicio', await pageHas('/', title));
  const pubId = approved.json?.publication?.id;

  // H3: descartar y restaurar otra
  const m2 = await editor.post('/social/manual', {
    permalink: `https://www.instagram.com/p/FLUJOB${stamp}/`,
    caption: `Descartar ${stamp} #ifts2web`,
    mediaUrl: 'https://scontent.cdninstagram.com/img/flujo2.jpg',
    postedAt: new Date().toISOString().slice(0, 10),
  });
  const disc = await editor.post(`/social/posts/${m2.json?.id}/discard`);
  const rest = await editor.post(`/social/posts/${m2.json?.id}/restore`);
  check(
    'H3 · descartar y restaurar una publicación',
    disc.json?.status === 'DISCARDED' && rest.json?.status === 'DETECTED',
  );
  const del2 = await editor.post(`/social/posts/${m2.json?.id}/discard`);
  const del2b = await editor.del(`/social/posts/${m2.json?.id}`);
  check(
    'H3 · eliminar una descartada (manual, auditado)',
    del2.status === 200 && del2b.status === 204,
  );

  // Limpieza H2: pausar y eliminar la publicación (vuelve a pendiente), luego descartar y borrar el post.
  if (pubId) {
    await editor.post(`/publications/${pubId}/pause`);
    check('H2 · pausada deja de verse en el sitio', await pageHas('/novedades', title, false));
    const dp = await editor.del(`/publications/${pubId}`);
    await editor.post(`/social/posts/${manual.json.id}/discard`);
    await editor.del(`/social/posts/${manual.json.id}`);
    check('H2 · limpieza (eliminar es manual)', dp.status === 204);
  }

  // ---------- H4: aviso con vencimiento visible en /estudiantes ----------
  const aviso = `Aviso flujo ${stamp}`;
  const n = await bedelia.post('/notices', {
    title: aviso,
    body: 'Aviso creado por la verificación de punta a punta.',
    audience: 'STUDENTS',
    urgent: true,
    visibleUntil: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
  });
  check('H4 · crear aviso con vencimiento', n.status === 201);
  check('H4 · se ve en /estudiantes al instante', await pageHas('/estudiantes', aviso));
  await bedelia.post(`/notices/${n.json?.id}/pause`);
  check('H4 · pausado desaparece del sitio', await pageHas('/estudiantes', aviso, false));
  const dn = await bedelia.del(`/notices/${n.json?.id}`);
  check('H4 · eliminar un aviso pausado', dn.status === 204);

  // ---------- H5: llamado a examen ----------
  const terms = (await admin.get('/terms')).json?.items ?? [];
  const current = terms.find((t) => t.publicCurrent);
  const other = terms.find((t) => !t.publicCurrent && t.year === current?.year);
  const call = `Llamado flujo ${stamp}`;
  const ec = await bedelia.post('/exam-calls', {
    termId: current?.id,
    name: call,
    startsOn: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    endsOn: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
    enrollmentOpen: true,
    highlighted: true,
  });
  check('H5 · crear llamado a examen', ec.status === 201, `status ${ec.status}`);
  await bedelia.post(`/exam-calls/${ec.json?.id}/publish`);
  check('H5 · publicado se ve en /estudiantes', await pageHas('/estudiantes', call));
  await bedelia.post(`/exam-calls/${ec.json?.id}/unpublish`);
  const de = await bedelia.del(`/exam-calls/${ec.json?.id}`);
  check('H5 · despublicar y eliminar el llamado', de.status === 204);

  // ---------- H6: ciclo público ----------
  if (current && other) {
    const before = (await (await fetch(`${API}/api/v1/public/students`)).json()).term?.label;
    const sw = await admin.put(`/terms/${other.id}/public-current`);
    const labelNow = other.label;
    check(
      'H6 · cambiar el ciclo público (solo ADMIN) y el sitio lo refleja al instante',
      sw.status === 200 && (await pageHas('/estudiantes', labelNow)),
      `${before} -> ${labelNow}`,
    );
    const bedeliaTry = await bedelia.put(`/terms/${current.id}/public-current`);
    check('H6 · BEDELIA no puede cambiar el ciclo público', bedeliaTry.status === 403);
    await admin.put(`/terms/${current.id}/public-current`);
    check('H6 · se restaura el ciclo original', await pageHas('/estudiantes', current.label));
  } else {
    check('H6 · hay dos ciclos del mismo año para probar', false);
  }

  // ---------- H7 / H8: contenido institucional ----------
  const est = await page('/estudiantes');
  check(
    'H7 · /estudiantes concentra ciclo, avisos y accesos',
    /SIU|Guaran/i.test(est) && /ciclo|cuatrimestre/i.test(est),
  );
  const carrera = await page('/la-carrera');
  check(
    'H8 · La carrera muestra el plan real (sin marcadores provisorios)',
    carrera.includes('2758') &&
      carrera.includes('Correlatividades') &&
      !/\[completar\]|\[provisorio\]/.test(carrera),
  );
  const ingreso = await page('/ingreso');
  check(
    'H8 · Ingreso muestra requisito real y marca lo que falta como [a confirmar]',
    /Secundario completo/.test(ingreso) && ingreso.includes('[a confirmar con el cliente]'),
  );

  // ---------- H11: contacto ----------
  const contact = await fetch(`${API}/api/v1/public/contact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Verificación',
      email: 'verificacion@example.com',
      subject: `Consulta flujo ${stamp}`,
      message: 'Mensaje de la verificación de punta a punta.',
      consent: true,
    }),
  });
  check('H11 · el formulario de contacto recibe el mensaje', contact.status === 201);
  const inbox = (await bedelia.get('/contact-messages?pageSize=50')).json?.items ?? [];
  const mine = inbox.find((m) => m.subject === `Consulta flujo ${stamp}`);
  check('H11 · Bedelía lo ve en la bandeja', Boolean(mine));
  const bdel = mine ? await bedelia.del(`/contact-messages/${mine.id}`) : { status: 0 };
  check('Q41 · Bedelía NO puede eliminar mensajes de contacto (403)', bdel.status === 403);
  if (mine) {
    await bedelia.patch(`/contact-messages/${mine.id}`, { status: 'ANSWERED' });
    const adel = await admin.del(`/contact-messages/${mine.id}`);
    check('Q41 · ADMIN elimina un mensaje respondido', adel.status === 204);
  }
}

try {
  if (!args.includes('--no-start')) {
    const urls = await startStack();
    WEB = urls.web;
    API = urls.api;
  }
  await main();
} catch (e) {
  check('La verificación terminó sin excepciones', false, String(e));
} finally {
  killAll();
}

const failed = results.filter((r) => !r.ok);
const md = [
  `# Flujos H1 a H8 y seguridad básica — ${today}`,
  '',
  'Generado por `pnpm verify` (`scripts/verify-flows.mjs`) contra el build de producción de API + web, con la semilla demo. Cada fila es una comprobación contra el sistema real; lo creado se elimina al final.',
  '',
  `Resultado: **${results.length - failed.length} de ${results.length} comprobaciones en verde**.`,
  '',
  '| | Comprobación | Detalle |',
  '|---|---|---|',
  ...results.map(
    (r) => `| ${r.ok ? 'OK' : '**FALLA**'} | ${r.name} | ${r.detail.replace(/\|/g, '/')} |`,
  ),
  '',
].join('\n');
mkdirSync(path.dirname(path.resolve(root, outFile)), { recursive: true });
writeFileSync(path.resolve(root, outFile), md);
console.log(
  `\n${results.length - failed.length}/${results.length} en verde. Guardado en ${outFile}`,
);
process.exit(failed.length ? 1 : 0);
