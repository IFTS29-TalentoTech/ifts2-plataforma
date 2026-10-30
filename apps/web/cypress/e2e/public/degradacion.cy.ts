/**
 * RNF03: con la API caída las páginas siguen en pie y muestran un estado de error claro.
 * Requiere una web levantada con API_ORIGIN apuntando a un puerto sin API; se pasa su URL en
 * DEGRADED_URL (variable de entorno leida en cypress.config.ts; ver README de features/public). Sin esa variable, se omite.
 */
const url = Cypress.expose('DEGRADED_URL') as string | undefined;
const routes = [
  '/',
  '/institucional',
  '/la-carrera',
  '/estudiantes',
  '/ingreso',
  '/inscripciones',
  '/novedades',
];

(url ? describe : describe.skip)('Degradación sin API', () => {
  for (const route of routes) {
    it(`${route} muestra su h1 y no se rompe`, () => {
      cy.visit(`${url}${route}`);
      cy.get('main h1').should('be.visible');
      cy.get('header').should('exist');
      cy.get('footer').should('exist');
      cy.a11y();
    });
  }
  it('Estudiantes explica el problema en lenguaje claro', () => {
    cy.visit(`${url}/estudiantes`);
    cy.get('[role=alert]').should('contain', 'No pudimos cargar');
  });
});

export {};
