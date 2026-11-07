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

/**
 * Recorre las imágenes del sitio dentro de `selector`, las acerca a la vista (hay carga diferida) y
 * comprueba que cargaron. Solo cuenta las del propio origen (rutas /img/... y /_next/image): otras
 * specs cargan publicaciones de prueba con portadas a direcciones externas inexistentes
 * (example.invalid), que no son parte de este contrato y tardan en fallar.
 */
const imagesLoaded = (selector: string, min: number) => {
  const own = (_: number, el: HTMLElement) =>
    new URL((el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src, location.href)
      .origin === location.origin;
  cy.get(selector).should(($imgs) => {
    expect($imgs.filter(own).length).to.be.at.least(min);
  });
  cy.get(selector).each(($img) => {
    if (!own(0, $img[0]!)) return;
    cy.wrap($img).scrollIntoView();
    // 20 s: la primera vez que se pide cada imagen next/image la optimiza (sharp) y tarda en frío.
    cy.wrap($img, { timeout: 20000 }).should(loaded);
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
      cy.get('[data-testid=galeria] [aria-roledescription=diapositiva]').should('have.length', 3);
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
