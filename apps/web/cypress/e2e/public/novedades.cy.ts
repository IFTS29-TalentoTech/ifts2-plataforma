/** RF04/RF03: Novedades con filtros, archivo, detalle y 404 amable. */
for (const width of [390, 1440]) {
  describe(`Novedades (${width} px)`, () => {
    beforeEach(() => cy.viewport(width, 900));

    it('lista tarjetas y filtra por categoría', () => {
      cy.visit('/novedades');
      cy.get('[data-testid=novedades] li').should('have.length.at.least', 2);
      cy.get('#f-cat option').should('have.length.at.least', 2);
      // Los filtros se aplican al cambiar (A17): hay que esperar a que React hidrate el desplegable
      // (adjunta `__reactProps$…` al nodo) o el cambio se pierde antes de tener manejador.
      cy.get('#f-cat').should(($el) => {
        expect(Object.keys($el[0]).some((k) => k.startsWith('__reactProps'))).to.eq(true);
      });
      cy.get('#f-cat').select('Evento');
      cy.location('search').should('contain', 'category=');
      cy.get('[data-testid=novedades] li').should('have.length.at.least', 1);
      cy.get('[data-testid=novedades] li').each(($li) => {
        expect($li.text()).to.contain('Evento');
      });
    });

    it('filtra por año y muestra el estado vacío con salida', () => {
      cy.visit('/novedades?year=2001');
      cy.contains('No encontramos novedades').should('be.visible');
      cy.contains('a', 'Quitar los filtros').click();
      cy.location('search').should('eq', '');
    });

    it('vista de archivo', () => {
      cy.visit('/novedades');
      cy.contains('a', 'Ver el archivo de novedades').click();
      cy.location('search').should('contain', 'archived=true');
      cy.get('main h1').should('contain', 'Novedades');
      cy.contains('a', 'Volver a las novedades vigentes').should('be.visible');
    });

    it('abre el detalle y vuelve', () => {
      cy.visit('/novedades');
      cy.get('[data-testid=novedades] a').first().click();
      cy.location('pathname').should('match', /^\/novedades\/.+/);
      cy.get('main h1').should('be.visible');
      // Next 15 agrega el <title> de las páginas dinámicas un instante después del contenido: se espera
      // a que esté antes de revisar la accesibilidad (si no, axe marca "document-title" según la velocidad).
      cy.title().should('not.be.empty');
      cy.a11y();
      cy.contains('a', 'Volver a novedades').click();
      cy.location('pathname').should('eq', '/novedades');
    });

    it('un id inexistente muestra un 404 amable', () => {
      cy.visit('/novedades/00000000-0000-0000-0000-000000000000', { failOnStatusCode: false });
      cy.contains('No encontramos esta publicación').should('be.visible');
      cy.contains('a', 'Ver novedades').should('be.visible');
      cy.a11y();
    });

    it('ignora parámetros inválidos sin romperse', () => {
      cy.visit('/novedades?year=abc&category=xx&page=-3');
      cy.get('main h1').should('contain', 'Novedades');
      cy.get('[data-testid=novedades] li').should('have.length.at.least', 1);
    });
  });
}

export {};
