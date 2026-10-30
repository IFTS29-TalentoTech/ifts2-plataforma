/**
 * Capturas del formulario de contacto para el Manual de Usuario (no verifica comportamiento: eso lo hace
 * contacto.cy.ts). Salen en cypress/screenshots/public/capturas-contacto.cy.ts/ y se copian a
 * docs/capturas/publico/contacto-*.png. El envío exitoso se simula para no dejar mensajes en la base.
 */
describe('Capturas del formulario de contacto', () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
    cy.visit('/institucional#contacto');
    cy.get('#contacto').scrollIntoView();
  });

  it('errores de validación y confirmación', () => {
    cy.contains('button', 'Enviar consulta').click();
    cy.contains('Escribí tu nombre.').should('be.visible');
    cy.wait(300);
    cy.get('#contacto').screenshot('contacto-1-validacion', { overwrite: true });

    cy.intercept('POST', '/api/v1/public/contact', { statusCode: 201, body: { received: true } });
    cy.get('input[name=name]').type('Ana Pérez');
    cy.get('input[name=email]').type('ana@example.com');
    cy.get('input[name=subject]').type('Consulta por el ingreso');
    cy.get('textarea[name=message]').type(
      'Hola, quisiera saber cuándo abre la inscripción al ingreso.',
    );
    cy.get('#contacto [role=checkbox]').click();
    cy.wait(300);
    cy.get('#contacto').screenshot('contacto-2-completo', { overwrite: true });
    cy.contains('button', 'Enviar consulta').click();
    cy.get('[role=status]').should('contain', 'Recibimos tu consulta');
    cy.wait(300);
    cy.get('#contacto').screenshot('contacto-3-confirmacion', { overwrite: true });
  });
});
