const viewports: Array<{ name: string; width: number; height: number }> = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];

const publicRoutes = [
  '/',
  '/institucional',
  '/la-carrera',
  '/estudiantes',
  '/ingreso',
  '/inscripciones',
  '/novedades',
];

describe('Smoke: sitio público y panel (placeholders)', () => {
  for (const vp of viewports) {
    context(vp.name, () => {
      beforeEach(() => cy.viewport(vp.width, vp.height));

      it('recorre las rutas públicas sin errores y sin violaciones de accesibilidad', () => {
        for (const route of publicRoutes) {
          cy.visit(route);
          cy.get('main h1').should('be.visible');
          cy.a11y();
        }
      });

      it('el menú público separa Ingreso e Inscripciones y tiene Administración', () => {
        cy.visit('/');
        if (vp.width < 1024) cy.get('button[aria-controls="mobile-menu"]').click();
        const nav = vp.width < 1024 ? '#mobile-menu' : 'nav[aria-label="Principal"]';
        cy.get(nav).within(() => {
          cy.contains('a', 'Ingreso').should('be.visible');
          cy.contains('a', 'Inscripciones').should('be.visible');
          cy.contains('a', 'Administración').should('be.visible');
        });
      });

      it('/panel sin sesión redirige al login', () => {
        cy.visit('/panel/publicaciones');
        cy.location('pathname').should('eq', '/panel/login');
        cy.get('main h1').should('be.visible');
        cy.a11y();
      });
    });
  }
});

export {};
