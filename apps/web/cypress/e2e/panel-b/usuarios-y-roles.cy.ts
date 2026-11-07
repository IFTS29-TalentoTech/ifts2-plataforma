import '../../support/panel-b';

/**
 * Ventana "Usuarios y roles" (US-26, RF11), 390 y 1440 px:
 * - el rol se cambia con un formulario y una confirmación (no al tocar el desplegable);
 * - sobre el propio usuario no se ofrecen acciones;
 * - el Superadministrador tiene el acceso a "Roles y permisos".
 */
const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];

for (const vp of viewports) {
  describe(`Usuarios y roles · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('cambia el rol con confirmación y no ofrece acciones sobre el propio usuario', () => {
      const email = `rol.${vp.width}.${Date.now()}@ifts2.local`;
      cy.loginAsApi('SUPERADMIN');
      cy.api('GET', '/roles').then((r) => {
        const editor = r.body.items.find((x: { key: string }) => x.key === 'EDITOR');
        cy.api('POST', '/users', {
          name: 'Persona de prueba',
          email,
          roleId: editor.id,
          password: 'Clave-usuarios-1',
        });
      });
      cy.visit('/panel/configuracion');
      cy.contains('button', 'Administrar usuarios y roles').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('a', 'Ver qué puede hacer cada rol').should(
          'have.attr',
          'href',
          '/panel/roles',
        );
        // Mi usuario: marcado "(vos)" y sin botones.
        cy.contains('[data-testid="user-row"]', 'admin@ifts2.local').within(() => {
          cy.contains('(vos)');
          cy.contains('Es tu usuario');
          cy.get('button').should('not.exist');
        });
        cy.contains('[data-testid="user-row"]', email).contains('button', 'Cambiar rol').click();
      });
      cy.a11y();

      cy.contains('[role="dialog"]', 'Rol actual').within(() => {
        cy.contains('label', 'Nuevo rol')
          .invoke('attr', 'for')
          .then((id) => cy.get(`[id="${id}"]`).click());
      });
      // force: con muchos roles en la base (los specs de roles crean uno por corrida) la opción
      // puede quedar recortada por el desplegable y Cypress no la considera visible.
      cy.contains('[role="option"]', 'Bedelía Académica').click({ force: true });
      cy.contains('[role="dialog"]', 'Rol actual').contains('button', 'Guardar').click();
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Cambiar el rol?');
        cy.contains('Pasa de Comunicación a Bedelía Académica');
        cy.contains('button', 'Cambiar rol').click();
      });
      cy.contains('[data-testid="user-row"]', email).should('contain', 'Bedelía Académica');
      cy.api('GET', `/users?q=${encodeURIComponent(email)}`)
        .its('body.items.0.role')
        .should('eq', 'BEDELIA');
    });
  });
}
