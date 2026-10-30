/** E2E-14 (RF08, RNF08): formulario de contacto. Éxito real una vez; error y límite con respuestas simuladas. */
const fill = () => {
  cy.get('input[name=name]').type('Ana Prueba');
  cy.get('input[name=email]').type('ana@example.com');
  cy.get('input[name=subject]').type('Consulta de prueba');
  cy.get('textarea[name=message]').type('Hola, quiero consultar por el ingreso.');
};
const consent = () => cy.get('#contacto [role=checkbox]').click();
const submit = () => cy.contains('button', 'Enviar consulta').click();

for (const width of [390, 1440]) {
  describe(`Contacto (${width} px)`, () => {
    beforeEach(() => {
      cy.viewport(width, 900);
      cy.visit('/institucional#contacto');
    });

    it('el consentimiento es obligatorio y no se envía sin él', () => {
      cy.intercept('POST', '/api/v1/public/contact', cy.spy().as('post'));
      fill();
      submit();
      cy.contains('aceptar el aviso de uso de datos personales').should('be.visible');
      cy.get('@post').should('not.have.been.called');
    });

    it('valida campos vacíos con mensajes claros', () => {
      submit();
      cy.contains('Escribí tu nombre.').should('be.visible');
      cy.contains('Escribí tu consulta.').should('be.visible');
    });

    it('envía con consentimiento y muestra la confirmación', () => {
      cy.intercept('POST', '/api/v1/public/contact', (req) => {
        expect(req.body.consent).to.eq(true);
        expect(req.body.website).to.eq('');
        req.reply({ statusCode: 201, body: { received: true } });
      }).as('send');
      fill();
      consent();
      submit();
      cy.wait('@send');
      cy.get('[role=status]').should('contain', 'Recibimos tu consulta');
    });

    it('muestra un error claro si el servidor falla y conserva el texto', () => {
      cy.intercept('POST', '/api/v1/public/contact', { statusCode: 500, body: {} });
      fill();
      consent();
      submit();
      cy.get('[role=alert]').should('contain', 'Algo salió mal');
      cy.get('textarea[name=message]').should('contain.value', 'quiero consultar');
    });

    it('informa el límite de frecuencia (429)', () => {
      cy.intercept('POST', '/api/v1/public/contact', { statusCode: 429, body: {} });
      fill();
      consent();
      submit();
      cy.get('[role=alert]').should('contain', 'Esperá un rato');
    });

    it('el campo señuelo no es accesible para personas', () => {
      cy.get('input[name=website]').should('have.attr', 'tabindex', '-1');
      cy.get('input[name=website]').closest('[aria-hidden=true]').should('exist');
    });
  });
}

describe('Contacto contra la API real', () => {
  it('guarda el mensaje (201)', () => {
    cy.visit('/institucional#contacto');
    fill();
    consent();
    submit();
    cy.get('[role=status]', { timeout: 10000 }).should('contain', 'Recibimos tu consulta');
  });
});

export {};
