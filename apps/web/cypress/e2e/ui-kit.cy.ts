// Verifica el kit de UI (accesibilidad AA y diálogos con foco atrapado). Solo en desarrollo: /ui-kit.
const viewports = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
];

describe('Kit de UI', () => {
  for (const vp of viewports) {
    context(`viewport ${vp.name}`, () => {
      beforeEach(() => {
        cy.viewport(vp.width, vp.height);
        cy.visit('/ui-kit');
      });

      it('no tiene violaciones de accesibilidad serias', () => {
        cy.get('h1').contains('Kit de UI');
        cy.a11y();
        cy.screenshot(`ui-kit-${vp.name}`, { capture: 'fullPage' });
      });

      it('el diálogo de confirmación atrapa el foco, cierra con Escape y devuelve el foco', () => {
        cy.contains('button', 'Confirmar (controlado)').as('opener').click();
        cy.get('[role="alertdialog"]')
          .should('be.visible')
          .and('contain', '¿Confirmar publicación?');
        cy.a11y();
        cy.focused().should('exist').closest('[role="alertdialog"]').should('exist');
        cy.get('body').type('{esc}');
        cy.get('[role="alertdialog"]').should('not.exist');
        cy.get('@opener').should('have.focus');
      });

      it('el diálogo imperativo (useConfirm) resuelve con el botón elegido', () => {
        cy.contains('button', 'Confirmar (imperativo)').click();
        cy.get('[role="alertdialog"]').contains('button', 'Sí, eliminar').click();
        cy.contains('Aviso eliminado').should('be.visible');
      });
    });
  }
});

export {};
