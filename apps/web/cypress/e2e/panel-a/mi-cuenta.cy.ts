/**
 * "Mi cuenta": cambio de contraseña voluntario estando logueado (cualquier rol, incluido el
 * Superadministrador). Se usa un usuario creado para la prueba, para no cambiar la clave de los usuarios
 * de demostración que usan los demás specs.
 *
 * - Se llega a /panel/cuenta desde el menú de cuenta (1440 px) o desde el menú hamburguesa (390 px).
 * - Clave actual incorrecta: mensaje claro bajo el campo.
 * - Cambio correcto: aviso, la sesión actual sigue y solo la clave nueva sirve para entrar.
 */
import '../../support/panel-a';

const OLD = 'Clave-cuenta-1';
const NEW = 'Clave-cuenta-nueva-2';

for (const width of [1440, 390]) {
  describe(`Mi cuenta · ${width}px`, () => {
    beforeEach(() => {
      cy.viewport(width, 900);
      cy.clearCookies();
    });

    it('cambia la contraseña estando logueado y la anterior deja de servir', () => {
      const email = `cuenta.${width}.${Date.now()}@ifts2.local`;
      // Alta del usuario de prueba (como Superadministrador).
      cy.loginAs('admin');
      cy.api('GET', '/roles').then((r) => {
        const editor = r.body.items.find((x: { key: string }) => x.key === 'EDITOR');
        cy.api('POST', '/users', {
          name: 'Cuenta de prueba',
          email,
          roleId: editor.id,
          password: OLD,
        });
      });
      cy.clearCookies();
      cy.request('POST', '/api/v1/auth/login', { email, password: OLD, remember: false });

      if (width >= 1024) {
        cy.visit('/');
        cy.get('button[aria-label^="Cuenta de"]').click();
        cy.contains('a', 'Cambiar contraseña').click();
        cy.location('pathname').should('eq', '/panel/cuenta');
      } else {
        // En el celular se llega desde el menú hamburguesa del panel.
        cy.visit('/panel');
        cy.get('button[aria-label="Abrir menú"]').click();
        cy.get('nav[aria-label="Gestión del sitio (móvil)"]')
          .contains('a', 'Cambiar contraseña')
          .click();
        cy.location('pathname').should('eq', '/panel/cuenta');
      }
      cy.contains('h1', 'Mi cuenta');
      cy.contains(email);
      cy.a11y();

      const form = () => cy.get('form[aria-label="Cambiar contraseña"]');
      // Clave actual incorrecta.
      form().within(() => {
        cy.contains('label', 'Contraseña actual').parent().find('input').type('No-es-la-clave-9');
        cy.contains('label', 'Contraseña nueva').parent().find('input').type(NEW);
        cy.contains('label', 'Repetí la contraseña nueva').parent().find('input').type(NEW);
        cy.contains('button', 'Cambiar contraseña').click();
        cy.contains('La contraseña actual no es correcta').should('be.visible');
      });
      // Cambio correcto.
      form().within(() => {
        cy.contains('label', 'Contraseña actual').parent().find('input').clear().type(OLD);
        cy.contains('button', 'Cambiar contraseña').click();
      });
      cy.contains('Contraseña cambiada.').should('be.visible');
      // La sesión actual sigue abierta.
      cy.visit('/panel');
      cy.location('pathname').should('eq', '/panel');
      // Solo la clave nueva sirve para entrar.
      cy.request({
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email, password: OLD, remember: false },
        failOnStatusCode: false,
      })
        .its('status')
        .should('eq', 401);
      cy.request('POST', '/api/v1/auth/login', { email, password: NEW, remember: false })
        .its('status')
        .should('eq', 204);
    });
  });
}
