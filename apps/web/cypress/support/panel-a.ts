/// <reference types="cypress" />
/**
 * Comandos y utilidades de las pruebas E2E del panel (parte A). Se importan desde cada spec:
 *   import '../../support/panel-a';
 *
 * - `cy.loginAs('editor')`: inicia sesión por API (cookie httpOnly en el navegador de Cypress) y la cachea con
 *   cy.session. NO cuenta para el límite de intentos fallidos (los logins correctos no se cuentan).
 * - `cy.api(...)`: pedidos autenticados a la API a través de la web (`/api/v1`), con la cookie ya iniciada.
 * - `cy.openPanelNav()`: en móvil abre el menú hamburguesa; en escritorio no hace nada.
 * - `cy.captura(nombre)`: captura la pantalla y la copia a docs/capturas/panel/<nombre>-<ancho>.png (Manual de Usuario).
 */
// El servidor de desarrollo compila cada ruta la primera vez: se da más margen que los 4 s por defecto.
Cypress.config('defaultCommandTimeout', 15000);

export type Who = 'admin' | 'bedelia' | 'editor';

const CREDENTIALS: Record<Who, { email: string; password: string }> = {
  admin: {
    // Valores de la semilla de DESARROLLO (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD de .env.example).
    email: 'admin@ifts2.local',
    password: 'Cambiame-123!',
  },
  bedelia: { email: 'bedelia@ifts2.local', password: 'Demo-2026-ifts2' },
  editor: { email: 'editor@ifts2.local', password: 'Demo-2026-ifts2' },
};

declare global {
  namespace Cypress {
    interface Chainable {
      loginAs(who: Who): Chainable<void>;
      api<T = any>(
        method: string,
        url: string,
        body?: unknown,
        failOnStatusCode?: boolean,
      ): Chainable<Response<T>>;
      openPanelNav(): Chainable<void>;
      captura(nombre: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('loginAs', (who: Who) => {
  cy.session(
    `panel-a:${who}`,
    () => {
      cy.request('POST', '/api/v1/auth/login', { ...CREDENTIALS[who], remember: false })
        .its('status')
        .should('eq', 204);
    },
    {
      validate() {
        cy.request({ url: '/api/v1/auth/me', failOnStatusCode: false })
          .its('status')
          .should('eq', 200);
      },
    },
  );
});

Cypress.Commands.add(
  'api',
  (method: string, url: string, body?: unknown, failOnStatusCode = true) =>
    cy.request({
      method,
      url: `/api/v1${url}`,
      body: body as Cypress.RequestBody,
      failOnStatusCode,
    }),
);

Cypress.Commands.add('openPanelNav', () => {
  cy.window().then((win) => {
    if (win.innerWidth < 1024) {
      cy.get('button[aria-controls="mobile-menu"]').then(($b) => {
        if ($b.attr('aria-expanded') !== 'true') cy.wrap($b).click();
      });
    }
  });
});

Cypress.Commands.add('captura', (nombre: string) => {
  // Se espera a que no haya esqueletos de carga en pantalla.
  cy.get('[aria-busy="true"]').should('not.exist');
  // El ancho real sale de la ventana de la aplicación (cy.viewport no cambia la configuración).
  cy.window().then((win) => {
    const file = `${nombre}-${win.innerWidth < 1024 ? 390 : 1440}`;
    cy.screenshot(file, { overwrite: true, capture: 'viewport' });
    // Cypress guarda en screenshots/<archivo del spec>/<nombre>.png
    const specFile = Cypress.spec.relative.split(/[\\/]/).pop();
    cy.task('panelA:moveCapture', { from: `${specFile}/${file}.png`, to: `${file}.png` });
  });
});

/** Texto único por ejecución para no chocar con datos de corridas anteriores. */
export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** Hoy + `days` días, como yyyy-mm-dd (UTC alcanza para pruebas con márgenes de varios días). */
export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Crea por API una publicación de redes pendiente (carga manual) y devuelve `{ id, title }`. */
export function seedPendingPost(title: string) {
  return cy
    .api('POST', '/social/manual', {
      permalink: `https://www.instagram.com/p/e2e-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}/`,
      caption: `${title}. Texto de prueba del equipo. #ifts2web`,
      mediaUrl: 'https://example.invalid/e2e/foto.jpg',
      postedAt: inDays(0),
    })
    .then((r) => ({ id: r.body.id as string, title }));
}

/** Crea por API un aviso y devuelve su id. */
export function seedNotice(over: Record<string, unknown> = {}) {
  return cy
    .api('POST', '/notices', {
      title: unique('Aviso e2e'),
      body: 'Texto de prueba del aviso.',
      audience: 'ALL',
      urgent: false,
      highlighted: false,
      visibleFrom: inDays(-1),
      visibleUntil: inDays(30),
      ...over,
    })
    .then((r) => r.body as { id: string; title: string });
}

/** Aviso ya vencido (enero 2026): se crea vigente y se vence directo en la base (ver panelA:expireNotice). */
export function seedExpiredNotice(title: string) {
  return seedNotice({ title }).then((n) => cy.task('panelA:expireNotice', n.id).then(() => n));
}

/**
 * Limpieza de los datos que crean estas pruebas, para que las listas (paginadas) no crezcan entre corridas.
 * Solo toca lo que llevan marcas de prueba en el título/enlace. Usa los endpoints reales (pausar y eliminar).
 */
export function cleanupE2eData() {
  const noticeRe =
    /^(Aviso e2e|Aviso con adjunto|Aviso con txt|Aviso vencido|Aviso a eliminar|placeholder|Reunión informativa de ingreso|Inscripción al turno extraordinario$)/;
  cy.api('GET', '/notices?status=ALL&pageSize=100').then((r) => {
    for (const n of r.body.items as Array<{ id: string; title: string; viewStatus: string }>) {
      if (!noticeRe.test(n.title)) continue;
      if (n.viewStatus === 'ACTIVE') cy.api('POST', `/notices/${n.id}/pause`, undefined, false);
      cy.api('DELETE', `/notices/${n.id}`, undefined, false);
    }
  });
}

export function cleanupE2eSocial() {
  const isE2e = (p: string) => /\/p\/(e2e|manual)-/.test(p);
  for (const status of ['DETECTED', 'DISCARDED']) {
    cy.api('GET', `/social/posts?status=${status}&pageSize=100`).then((r) => {
      for (const p of r.body.items as Array<{ id: string; permalink: string }>) {
        if (!isE2e(p.permalink)) continue;
        if (status === 'DETECTED')
          cy.api('POST', `/social/posts/${p.id}/discard`, undefined, false);
        cy.api('DELETE', `/social/posts/${p.id}`, undefined, false);
      }
    });
  }
}

export const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
];
