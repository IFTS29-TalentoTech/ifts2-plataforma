import '../../support/panel-b';

/**
 * Ventana "Usuarios y roles" (US-26, RF11), 390 y 1440 px:
 * - el rol se cambia con un formulario y una confirmación (no al tocar el desplegable);
 * - sobre el propio usuario no se ofrecen acciones;
 * - el Superadministrador tiene el acceso a "Roles y permisos";
 * - en la tarjeta de Configuración, tocar a una persona abre su menú de acciones.
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
      cy.contains('button', 'Gestionar usuarios').click();
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
      // Con muchos roles la lista tiene scroll y sus flechas pueden tapar una opción: se elige con
      // el teclado (escribir el comienzo del nombre y Enter), como en una lista larga real.
      cy.get('[role="listbox"]').should('be.visible');
      cy.focused().type('Bedel');
      cy.focused().should('contain', 'Bedelía Académica').type('{enter}');
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

    it('tarjeta de Configuración: tocar a una persona abre su menú; la propia no tiene menú', () => {
      cy.loginAsApi('SUPERADMIN');
      cy.visit('/panel/configuracion');
      cy.contains('h2', 'Usuarios del panel');
      cy.contains('a', 'Roles y permisos').should('have.attr', 'href', '/panel/roles');
      // Mi ficha: sin botón (no hay acciones sobre uno mismo).
      cy.contains('[data-testid="card-user"]', '· vos').find('button').should('not.exist');
      // La editora de demostración: su ficha abre el menú con las acciones.
      cy.contains('[data-testid="card-user"] button', 'Editora de prueba').click();
      cy.get('[role="menu"]').within(() => {
        cy.contains('editor@ifts2.local');
        cy.contains('[role="menuitem"]', 'Restablecer contraseña');
        cy.contains('[role="menuitem"]', 'Desactivar');
        cy.contains('[role="menuitem"]', 'Cambiar rol').click();
      });
      cy.contains('[role="dialog"]', 'Rol actual').within(() => {
        cy.contains('Comunicación');
        cy.contains('button', 'Cancelar').click();
      });
      cy.get('[role="dialog"]').should('not.exist');
      cy.a11y();
    });
  });
}
