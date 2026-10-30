/**
 * Soporte de las pruebas E2E del Panel B (Horarios, Archivo, Configuración).
 *
 * `cy.loginAsApi(rol)` inicia sesión llamando a la API (cookie httpOnly) para no depender de la pantalla de
 * login. La cookie queda en el navegador de Cypress porque la web reenvía `/api/v1/*` al mismo origen.
 * `cy.api(...)` hace pedidos directos a la API con la sesión actual (preparar o limpiar datos).
 * Se importa desde cada spec: `import '../../support/panel-b';`
 */

export type PanelRole = 'ADMIN' | 'BEDELIA' | 'EDITOR';

export const DEMO_USERS: Record<PanelRole, { email: string; password: string }> = {
  ADMIN: { email: 'admin@ifts2.local', password: 'Cambiame-123!' },
  BEDELIA: { email: 'bedelia@ifts2.local', password: 'Demo-2026-ifts2' },
  EDITOR: { email: 'editor@ifts2.local', password: 'Demo-2026-ifts2' },
};

/** PDF mínimo válido (la API valida la firma real del archivo). */
export const TINY_PDF =
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';

declare global {
  namespace Cypress {
    interface Chainable {
      /** Inicia sesión por API como ese rol (semilla demo). */
      loginAsApi(role: PanelRole): Chainable<void>;
      /** Campo de formulario por el texto de su etiqueta visible (input, textarea o botón de select). */
      byLabel(label: string | RegExp): Chainable<JQuery<HTMLElement>>;
      /** Pedido a la API con la sesión actual; devuelve la respuesta (no falla por 4xx). */
      api(
        method: string,
        path: string,
        body?: Cypress.RequestBody,
      ): Chainable<Cypress.Response<any>>;
    }
  }
}

Cypress.Commands.add('loginAsApi', (role: PanelRole) => {
  cy.session(
    `api-${role}`,
    () => {
      cy.request({
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { ...DEMO_USERS[role], remember: false },
      });
    },
    { cacheAcrossSpecs: false },
  );
});

Cypress.Commands.add('api', (method: string, path: string, body?: Cypress.RequestBody) =>
  cy.request({ method, url: `/api/v1${path}`, body, failOnStatusCode: false }),
);

Cypress.Commands.add('byLabel', (label: string | RegExp) =>
  cy
    .contains('label', label)
    .invoke('attr', 'for')
    .then((id) => cy.get(`[id="${id}"]`)),
);
