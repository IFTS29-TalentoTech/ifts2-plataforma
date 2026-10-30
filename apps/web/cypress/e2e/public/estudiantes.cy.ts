/** E2E-08 (parte pública), RF06/RF07: Estudiantes, Inscripciones e Ingreso con el ciclo público de la semilla demo. */
for (const width of [390, 1440]) {
  describe(`Estudiantes e Ingreso (${width} px)`, () => {
    beforeEach(() => cy.viewport(width, 900));

    it('muestra solo el ciclo público vigente y la nota del archivo', () => {
      cy.visit('/estudiantes');
      cy.get('[data-testid=ciclo-vigente]').should('contain', '2026');
      cy.contains('Los períodos anteriores se conservan en el archivo').should('exist');
    });

    it('lista horarios por comisión con descarga y llamados con fechas', () => {
      cy.visit('/estudiantes');
      cy.get('[data-testid=schedule]').should('have.length.at.least', 1);
      cy.get('[data-testid=schedule] a[download]')
        .first()
        .should('have.attr', 'href')
        .and('match', /^https?:\/\//);
      cy.get('[data-testid=exam-call]').first().should('contain', '/');
    });

    it('los avisos urgentes van primero y los destacados se resaltan', () => {
      cy.visit('/estudiantes');
      cy.get('[data-testid=notice]').first().should('contain', 'Urgente');
      cy.contains('[data-testid=notice]', 'Próximo evento').should('exist');
    });

    it('los enlaces de interés abren en pestaña nueva con rel seguro', () => {
      cy.visit('/estudiantes');
      cy.get('#accesos a[target=_blank]')
        .should('have.length.at.least', 1)
        .each(($a) => {
          expect($a.attr('rel')).to.contain('noopener');
          expect($a.attr('rel')).to.contain('noreferrer');
        });
    });

    it('Inscripciones muestra los llamados con inscripción abierta', () => {
      cy.visit('/inscripciones');
      cy.get('[data-testid=exam-call]').should('contain', 'Inscripción abierta');
    });

    it('Ingreso separa convocatoria y tres pasos', () => {
      cy.visit('/ingreso');
      cy.get('[data-testid=convocatoria]').should('exist');
      cy.get('[data-testid=ingreso-paso]').should('have.length', 3);
    });
  });
}

export {};
