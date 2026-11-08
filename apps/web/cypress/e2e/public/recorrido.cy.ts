/**
 * E2E-01 (RNF04, RNF07): recorrido de las páginas públicas en 390 y 1440 px, sin desborde horizontal,
 * con un h1, landmarks, menú móvil accesible y sin violaciones serias de accesibilidad (axe).
 */
const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];
const routes = [
  '/',
  '/institucional',
  '/la-carrera',
  '/estudiantes',
  '/ingreso',
  '/inscripciones',
  '/novedades',
];

for (const vp of viewports) {
  describe(`Recorrido público (${vp.name})`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    for (const route of routes) {
      it(`${route}: un h1, landmarks, sin desborde y accesible`, () => {
        cy.visit(route);
        cy.get('main h1').should('have.length', 1).and('be.visible');
        cy.get('header').should('exist');
        cy.get('footer').should('exist');
        cy.document().then((doc) => {
          expect(doc.documentElement.lang).to.eq('es-AR');
          expect(doc.documentElement.scrollWidth).to.be.at.most(vp.width);
        });
        cy.a11y();
      });
    }

    it('el contenido viene de la API (titular corto, frase ancla y pie, sin textos fijos)', () => {
      // Q64: el titular es `hero_title` y la frase ancla (`tagline`) va como subtítulo.
      cy.request('/api/v1/public/settings').then(({ body }) => {
        cy.visit('/');
        cy.get('main h1').invoke('text').should('eq', body.hero_title);
        cy.get('main').contains(body.tagline).should('be.visible');
      });
      cy.get('footer').should('contain', 'Villa Lugano');
    });

    if (vp.width < 1024) {
      it('el menú hamburguesa se abre, expone el estado y navega', () => {
        cy.visit('/');
        cy.get('button[aria-controls="mobile-menu"]')
          .should('have.attr', 'aria-expanded', 'false')
          .click()
          .should('have.attr', 'aria-expanded', 'true');
        cy.get('#mobile-menu').contains('a', 'Estudiantes').click();
        cy.location('pathname').should('eq', '/estudiantes');
      });
    }
  });
}

export {};
