/**
 * Fotos y logo del Figma (ADR-035, provisorias): se ven en las cinco pantallas, ninguna imagen
 * queda rota y la galería "Vida en la cocina" muestra sus tarjetas con texto. Las rutas salen de los
 * ajustes (semilla): el spec no escribe ninguna ruta a mano.
 */
const loaded = ($img: JQuery<HTMLElement>) => {
  const el = $img[0] as HTMLImageElement;
  expect(el.complete, 'la imagen terminó de cargar').to.eq(true);
  expect(el.naturalWidth, 'la imagen no está rota').to.be.greaterThan(0);
};

/** Recorre las imágenes de `main`, las acerca a la vista (hay carga diferida) y comprueba que cargaron. */
const imagesLoaded = (selector: string, min: number) => {
  cy.get(selector).should('have.length.at.least', min);
  cy.get(selector).each(($img) => {
    cy.wrap($img).scrollIntoView();
    cy.wrap($img).should(loaded);
  });
};

for (const vp of [
  { name: '390 px', width: 390, height: 844 },
  { name: '1440 px', width: 1440, height: 900 },
]) {
  describe(`Imágenes del Figma · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('Inicio: logo y dos fotos del encabezado cargadas', () => {
      cy.visit('/');
      cy.get('header img').should(loaded);
      cy.get('section').first().find('img').should('have.length', 2);
      imagesLoaded('section:first-of-type img', 2);
    });

    it('La carrera: foto junto al perfil profesional', () => {
      cy.visit('/la-carrera');
      cy.get('[data-testid=carrera-perfil]').should('be.visible');
      imagesLoaded('[data-testid=carrera-perfil] img', 1);
    });

    it('Estudiantes: galería "Vida en la cocina" con tres tarjetas de foto y texto', () => {
      cy.visit('/estudiantes');
      cy.get('[data-testid=galeria] li').should('have.length', 3);
      cy.get('[data-testid=galeria] figcaption').each(($c) => {
        expect($c.text().trim().length).to.be.greaterThan(5);
      });
      imagesLoaded('[data-testid=galeria] img', 3);
    });

    it('Ingreso: foto en el encabezado', () => {
      cy.visit('/ingreso');
      imagesLoaded('section:first-of-type img', 1);
    });

    it('Novedades: cada tarjeta muestra foto o un bloque neutro, sin imágenes rotas', () => {
      cy.visit('/novedades');
      cy.get('[data-testid=novedades] li').should('have.length.at.least', 1);
      imagesLoaded('[data-testid=novedades] img', 1);
    });
  });
}
