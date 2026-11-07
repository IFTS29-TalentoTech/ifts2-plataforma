/**
 * Cabecera según sesión y menú de cuenta (A16). Solo escritorio: a 390 px el menú de navegación es
 * el hamburguesa (cubierto por smoke.cy.ts y login.cy.ts).
 *
 * - Sin sesión: "Iniciar sesión" y sin "Administración".
 * - Con sesión (también en el sitio público): "Administración" y el menú de cuenta con nombre, rol,
 *   Escape que devuelve el foco y "Cerrar sesión".
 */
import '../../support/panel-a';

describe('Menú de cuenta · 1440px', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.clearCookies();
  });

  it('sin sesión la cabecera ofrece Iniciar sesión y no Administración', () => {
    cy.visit('/');
    const nav = 'nav[aria-label="Principal"]';
    cy.get(nav).contains('a', 'Iniciar sesión').should('be.visible');
    cy.get(nav).contains('a', 'Administración').should('not.exist');
  });

  it('con sesión, el menú muestra nombre y rol, se cierra con Escape y cierra la sesión', () => {
    cy.loginAs('editor');
    cy.visit('/');
    cy.get('nav[aria-label="Principal"]').contains('a', 'Administración').should('be.visible');

    cy.get('button[aria-label^="Cuenta de"]').as('menu').click();
    cy.get('@menu').should('have.attr', 'aria-expanded', 'true');
    cy.contains('Comunicación').should('be.visible');
    cy.contains('a', 'Ir al panel').should('be.visible');

    cy.get('body').type('{esc}');
    cy.get('@menu').should('have.attr', 'aria-expanded', 'false').and('have.focus');

    cy.get('@menu').click();
    cy.contains('button', 'Cerrar sesión').click();
    cy.location('pathname').should('eq', '/panel/login');
    cy.visit('/');
    cy.get('nav[aria-label="Principal"]').contains('a', 'Iniciar sesión').should('be.visible');
  });
});
