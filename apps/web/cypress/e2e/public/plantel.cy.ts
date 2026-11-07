/**
 * Plantel docente público (RF10, US-29): la sección aparece en Institucional con los docentes
 * visibles de la semilla de demostración (ficticios), no muestra a los ocultos y es accesible.
 */
for (const width of [390, 1440]) {
  describe(`Plantel docente en Institucional (${width} px)`, () => {
    beforeEach(() => cy.viewport(width, 900));

    it('muestra a las personas visibles con sus materias y sin las ocultas', () => {
      cy.visit('/institucional');
      // La página es ISR (60 s): si la compilación de la suite la generó antes de que hubiera
      // plantel, la primera visita trae la copia vieja y dispara la regeneración; se recarga una vez.
      cy.get('body').then(($b) => {
        if (!$b.find('section#plantel').length) {
          cy.wait(2000);
          cy.reload();
        }
      });
      cy.get('section#plantel h2').should('contain', 'Plantel docente');
      cy.get('[data-testid=plantel-docente]').should('have.length', 5);
      cy.contains('[data-testid=plantel-docente]', 'Docente de ejemplo 3')
        .should('contain', 'Elementos de Química')
        .and('contain', 'Nutrición');
      cy.contains('[data-testid=plantel-docente]', '(oculto)').should('not.exist');
      cy.a11y();
    });
  });
}

describe('Plantel docente: API pública', () => {
  it('solo entrega a las personas visibles y ningún dato de gestión', () => {
    cy.request('/api/v1/public/teachers').then((r) => {
      expect(r.body.items).to.have.length(5);
      expect(r.body.items[0]).to.have.all.keys('id', 'name', 'role', 'subjects', 'photoSrc');
    });
  });
});

export {};
