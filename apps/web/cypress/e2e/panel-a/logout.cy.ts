import { openAccountMenu, VIEWPORTS } from '../../support/panel-a';

for (const vp of VIEWPORTS) {
  describe(`Cierre de sesión confiable (A09) · ${vp.name}px`, () => {
    beforeEach(() => {
      cy.viewport(vp.width, vp.height);
      cy.loginAs('editor');
      cy.visit('/panel');
      cy.openPanelNav();
    });

    for (const failure of ['red', 'HTTP 500'] as const) {
      it(`${failure}: informa el fallo, permanece en el panel y permite reintentar`, () => {
        // El navegador puede reintentar conexiones cortadas antes de que fetch rechace.
        // Se simula la caída completa hasta el reintento explícito de la persona.
        let failing = true;
        cy.intercept('POST', '/api/v1/auth/logout', (req) => {
          if (!failing) return req.continue();
          if (failure === 'red') return req.destroy();
          req.reply({
            statusCode: 500,
            headers: { 'content-type': 'application/problem+json' },
            body: { status: 500, code: 'internal', detail: 'Error interno.' },
          });
        }).as('failedLogout');
        openAccountMenu();
        cy.contains('button', 'Cerrar sesión').filter(':visible').click();
        cy.wait('@failedLogout');
        cy.get('[role="alert"]:visible')
          .should('contain', 'No pudimos confirmar el cierre de sesión.')
          .and('contain', failure === 'red' ? 'Revisá tu conexión' : 'Intentá de nuevo');
        cy.location('pathname').should('eq', '/panel');
        cy.getCookie('ifts2_session').should('exist');
        cy.api('GET', '/auth/me').its('status').should('eq', 200);
        openAccountMenu();
        cy.contains('button', 'Cerrar sesión').filter(':visible').should('be.enabled');
        cy.a11y();

        cy.then(() => {
          failing = false;
        });
        cy.intercept('POST', '/api/v1/auth/logout').as('retryLogout');
        openAccountMenu();
        cy.contains('button', 'Cerrar sesión').filter(':visible').click();
        cy.wait('@retryLogout').its('response.statusCode').should('eq', 204);
        cy.location('pathname').should('eq', '/panel/login');
        cy.getCookie('ifts2_session').should('not.exist');
        cy.api('GET', '/auth/me', undefined, false).its('status').should('eq', 401);
      });
    }

    it('deshabilita el botón mientras espera la confirmación y redirige tras el 204', () => {
      cy.intercept('POST', '/api/v1/auth/logout', (req) => {
        req.continue((res) => {
          res.setDelay(1000);
        });
      }).as('logout');
      openAccountMenu();
      cy.contains('button', 'Cerrar sesión').filter(':visible').click();
      openAccountMenu();
      cy.contains('button', 'Cerrar sesión')
        .filter(':visible')
        .should('be.disabled')
        .and('have.attr', 'aria-busy', 'true');
      cy.location('pathname').should('eq', '/panel');
      cy.wait('@logout').its('response.statusCode').should('eq', 204);
      cy.location('pathname').should('eq', '/panel/login');
    });
  });
}
