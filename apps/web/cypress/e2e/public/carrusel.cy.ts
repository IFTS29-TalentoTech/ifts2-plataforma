/**
 * Carrusel público (RF09, ADR-036): semántica ARIA del patrón de carrusel, controles solo cuando hay
 * algo para desplazar, botones/puntos/teclado y accesibilidad (axe). Datos: las 3 diapositivas de
 * Estudiantes y la foto de La carrera que carga la semilla.
 */
const slides = '[data-testid=galeria] [role=group][aria-roledescription=diapositiva]';
const track = '[data-testid=galeria] [data-testid=carousel] > div[tabindex="0"]';

describe('Carrusel de Estudiantes · 390 px', () => {
  beforeEach(() => cy.viewport(390, 844));

  it('se anuncia como carrusel con diapositivas "n de N" y controles accesibles', () => {
    cy.visit('/estudiantes');
    cy.get('section[aria-roledescription=carrusel][aria-label="Vida en la cocina"]').should(
      'exist',
    );
    cy.get(slides).should('have.length', 3);
    cy.get(slides).eq(0).should('have.attr', 'aria-label', '1 de 3');
    cy.get(slides).eq(2).should('have.attr', 'aria-label', '3 de 3');
    // En el celular las tarjetas desbordan: aparecen botones y puntos.
    cy.get('[data-testid=carousel-controls]').should('be.visible');
    cy.get('button[aria-label="Diapositiva anterior"]').should('be.disabled');
    cy.get('button[aria-label="Diapositiva siguiente"]').should('be.enabled');
    cy.get('button[aria-current="true"]')
      .should('have.attr', 'aria-label')
      .and('contain', '1 de 3');
    cy.a11y();
  });

  it('Siguiente y Anterior desplazan y mueven el punto activo; se deshabilita en los extremos', () => {
    cy.visit('/estudiantes');
    cy.get('button[aria-label="Diapositiva siguiente"]').click();
    cy.get('button[aria-current="true"]')
      .should('have.attr', 'aria-label')
      .and('contain', '2 de 3');
    cy.get('button[aria-label="Diapositiva anterior"]').should('be.enabled');
    cy.get('button[aria-label="Ir a la diapositiva 3 de 3"]').click();
    cy.get('button[aria-label="Diapositiva siguiente"]').should('be.disabled');
    cy.get('button[aria-current="true"]')
      .should('have.attr', 'aria-label')
      .and('contain', '3 de 3');
    cy.get('button[aria-label="Diapositiva anterior"]').click();
    cy.get('button[aria-current="true"]')
      .should('have.attr', 'aria-label')
      .and('contain', '2 de 3');
  });

  it('con teclado: los botones se alcanzan con Tab y la pista se desplaza con las flechas', () => {
    cy.visit('/estudiantes');
    // Los controles aparecen cuando la página ya hidrató: enfocar antes pierde el foco al hidratar.
    cy.get('[data-testid=carousel-controls]').should('be.visible');
    cy.get(track).focus().should('have.focus');
    cy.get(track).then(($t) => expect($t[0]!.scrollLeft).to.eq(0));
    cy.press(Cypress.Keyboard.Keys.RIGHT);
    cy.get(track).should(($t) => expect($t[0]!.scrollLeft).to.be.greaterThan(0));
    // Sin trampas de foco: Tab sale de la pista hacia los controles.
    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.focused().should('have.prop', 'tagName', 'BUTTON');
  });
});

describe('Carrusel de Estudiantes · 1440 px', () => {
  beforeEach(() => cy.viewport(1440, 900));

  it('con las 3 tarjetas a la vista no hay nada para desplazar: sin botones, con semántica', () => {
    cy.visit('/estudiantes');
    cy.get(slides).should('have.length', 3);
    cy.get('[data-testid=galeria] [data-testid=carousel-controls]').should('not.exist');
    cy.get(track).should(($t) => {
      expect($t[0]!.scrollWidth).to.be.at.most($t[0]!.clientWidth + 1);
    });
    cy.a11y();
  });
});

/** US-30: filtro por categoría sobre el carrusel (la semilla trae Prácticas, Ingredientes y Platos). */
describe('Filtro por categoría de la galería', () => {
  for (const width of [390, 1440]) {
    it(`filtra, anuncia el resultado y vuelve a "Todas" (${width} px)`, () => {
      cy.viewport(width, 844);
      cy.visit('/estudiantes');
      const group = '[data-testid=galeria] [role=group][aria-label="Filtrar por categoría"]';
      cy.get(`${group} button`).should('have.length', 4);
      cy.get(`${group} button[aria-pressed=true]`).should('have.text', 'Todas');
      cy.get(slides).should('have.length', 3);
      // Esperar la hidratación: el botón responde recién cuando React lo montó.
      cy.contains(`${group} button`, 'Ingredientes').click();
      cy.get(`${group} button[aria-pressed=true]`).should('have.text', 'Ingredientes');
      cy.get(slides).should('have.length', 1);
      cy.get(slides).eq(0).should('have.attr', 'aria-label', '1 de 1');
      cy.get('[data-testid=galeria] [role=status]').should('contain', 'Mostrando 1 de 3 fotos');
      cy.a11y();
      cy.contains(`${group} button`, 'Todas').click();
      cy.get(slides).should('have.length', 3);
    });
  }
});

describe('La carrera: foto del perfil', () => {
  for (const width of [390, 1440]) {
    it(`una sola foto: carrusel sin controles (${width} px)`, () => {
      cy.viewport(width, 844);
      cy.visit('/la-carrera');
      cy.get('[data-testid=carrera-perfil] section[aria-roledescription=carrusel]').should(
        'have.attr',
        'aria-label',
        'Fotos de la carrera',
      );
      cy.get('[data-testid=carrera-perfil] [aria-roledescription=diapositiva]').should(
        'have.length',
        1,
      );
      cy.get('[data-testid=carrera-perfil] [data-testid=carousel-controls]').should('not.exist');
      cy.a11y();
    });
  }
});
