import '../../support/panel-b';

/**
 * Galerías con nombre (RF09, ADR-036, ADR-041): el EDITOR crea una galería, le sube fotos, las edita,
 * las reordena y las elimina (con confirmación); el ADMIN la agrega a una página como sección y se ve en
 * el sitio. Quien no tiene `gallery:manage` no ve la pantalla y la API responde 403. En 390 y 1440 px,
 * con axe. La semilla trae "Vida en la cocina" (3 fotos, en Estudiantes) y "Fotos de La carrera" (1).
 */
const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];

// PNG de 1x1 píxel (la API valida la firma real y lo convierte a WebP).
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const png = () => ({
  contents: Cypress.Buffer.from(PNG_1X1, 'base64'),
  fileName: 'foto.png',
  mimeType: 'image/png',
});

const card = (name: string) => `[data-testid="gallery-card"][aria-label="Galería ${name}"]`;
const row = '[data-testid="gallery-row"]';
const seeded = 'Vida en la cocina';

for (const vp of viewports) {
  describe(`Galerías · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('el EDITOR crea una galería, sube, edita, reordena y elimina fotos y la galería (con confirmación)', () => {
      const name = `Galería ${vp.width}-${Date.now()}`;
      const title = `Foto ${vp.width}-${Date.now()}`;
      cy.loginAsApi('EDITOR');
      cy.visit('/panel/galerias');
      cy.contains('h1', 'Galerías').should('be.visible');
      // Las de la semilla (provisorias): una con 3 fotos y otra con 1.
      cy.get(`${card(seeded)} ${row}`).should('have.length', 3);
      cy.get(`${card('Fotos de La carrera')} ${row}`).should('have.length', 1);
      cy.get(`${card(seeded)} [data-testid="gallery-pages"]`).should('contain', 'Estudiantes');
      cy.a11y();

      // Crear la galería: el nombre es obligatorio.
      cy.contains('button', 'Crear galería').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Guardar').click();
        cy.contains('Escribí un nombre para la galería.').should('be.visible');
        cy.byLabel('Nombre de la galería').type(name);
        cy.contains('button', 'Guardar').click();
      });
      cy.contains(card(name), 'Todavía no se muestra en ninguna página').should('exist');

      // Agregar una foto: el archivo es obligatorio.
      cy.get(`${card(name)} button[aria-label^="Agregar foto"]`).click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Guardar foto').click();
        cy.contains('Elegí la foto.').should('be.visible');
        cy.get('[data-testid="file-input"]').selectFile(png(), { force: true });
        cy.byLabel('Título (opcional)').type(title);
        cy.byLabel('Descripción (opcional)').type('Texto de prueba');
        cy.contains('button', 'Guardar foto').click();
      });
      cy.contains(`${card(name)} ${row}`, title).should('contain', 'Foto 1 de 1');

      // Una segunda foto y orden: "Subir" la nueva la pasa a la posición 1.
      cy.get(`${card(name)} button[aria-label^="Agregar foto"]`).click();
      cy.get('[role="dialog"]').within(() => {
        cy.get('[data-testid="file-input"]').selectFile(png(), { force: true });
        cy.byLabel('Título (opcional)').type('Segunda');
        cy.contains('button', 'Guardar foto').click();
      });
      cy.contains(`${card(name)} ${row}`, 'Segunda').should('contain', 'Foto 2 de 2');
      cy.contains(`${card(name)} ${row}`, 'Segunda')
        .contains('button', 'Subir')
        .click();
      cy.contains(`${card(name)} ${row}`, 'Segunda').should('contain', 'Foto 1 de 2');

      // Edición de los textos.
      cy.contains(`${card(name)} ${row}`, title)
        .contains('button', 'Editar')
        .click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Título (opcional)').clear().type(`${title} (editada)`);
        cy.contains('button', 'Guardar foto').click();
      });
      cy.contains(`${card(name)} ${row}`, `${title} (editada)`).should('exist');

      // Eliminar una foto: pide confirmación.
      cy.contains(`${card(name)} ${row}`, 'Segunda')
        .contains('button', 'Eliminar')
        .click();
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Eliminar esta foto?').should('be.visible');
        cy.contains('button', 'Cancelar').click();
      });
      cy.get(`${card(name)} ${row}`).should('have.length', 2);
      cy.contains(`${card(name)} ${row}`, 'Segunda')
        .contains('button', 'Eliminar')
        .click();
      cy.get('[role="alertdialog"]').within(() => cy.contains('button', 'Eliminar').click());
      cy.get(`${card(name)} ${row}`).should('have.length', 1);

      // Cambiar el nombre.
      cy.get(`${card(name)} button[aria-label^="Cambiar nombre"]`).click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Nombre de la galería').clear().type(`${name} B`);
        cy.contains('button', 'Guardar').click();
      });
      cy.get(card(`${name} B`)).should('exist');

      // Eliminar la galería: pide confirmación.
      cy.get(`${card(`${name} B`)} button[aria-label^="Eliminar galería"]`).click();
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Eliminar esta galería?').should('be.visible');
        cy.contains('button', 'Eliminar galería').click();
      });
      cy.get(card(`${name} B`)).should('not.exist');
      cy.get(card(seeded)).should('exist');
    });

    it('una galería que se muestra en una página no se puede eliminar hasta quitarla de ahí', () => {
      cy.loginAsApi('EDITOR');
      cy.visit('/panel/galerias');
      cy.get(`${card(seeded)} button[aria-label^="Eliminar galería"]`).click();
      cy.get('[role="alertdialog"]').contains('button', 'Eliminar galería').click();
      // La API la rechaza (409) porque está en Estudiantes: la galería y sus fotos siguen ahí.
      cy.get(card(seeded)).should('exist');
      cy.get(`${card(seeded)} ${row}`).should('have.length', 3);
      cy.api('GET', '/gallery')
        .its('body.galleries')
        .should('satisfy', (g: { name: string }[]) => g.some((x) => x.name === seeded));
    });

    it('rechaza archivos que no son imagen con un mensaje claro', () => {
      cy.loginAsApi('EDITOR');
      cy.visit('/panel/galerias');
      cy.get(`${card(seeded)} button[aria-label^="Agregar foto"]`).click();
      cy.get('[role="dialog"]').within(() => {
        cy.get('[data-testid="file-input"]').selectFile(
          {
            contents: Cypress.Buffer.from('%PDF-1.4 x'),
            fileName: 'doc.pdf',
            mimeType: 'application/pdf',
          },
          { force: true },
        );
        cy.contains('Subí una imagen (JPG, PNG o WebP).').should('be.visible');
        cy.contains('button', 'Cancelar').click();
      });
      cy.get(`${card(seeded)} ${row}`).should('have.length', 3);
    });

    it('BEDELIA no ve Galerías y la API responde 403', () => {
      cy.loginAsApi('BEDELIA');
      cy.visit('/panel/galerias');
      cy.contains('Tu rol no tiene acceso a esta sección').should('be.visible');
      cy.get('[data-testid="gallery-card"]').should('not.exist');
      cy.api('GET', '/gallery').its('status').should('eq', 403);
      cy.api('DELETE', '/gallery/6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111')
        .its('status')
        .should('eq', 403);
    });
  });
}

/** El ADMIN agrega una galería a una página como sección y se ve en el sitio; quitarla no borra la galería. */
describe('Galerías en las páginas del sitio', () => {
  it('Páginas del sitio: agrega una galería a Inscripciones, se ve en el sitio y se quita', () => {
    cy.viewport(1440, 900);
    const sectionTitle = `Fotos ${Date.now()}`;
    cy.loginAsApi('ADMIN');
    cy.visit('/panel/paginas');
    cy.contains('h1', 'Páginas del sitio').should('be.visible');
    cy.contains('button', 'Inscripciones').click();
    cy.contains('button', 'Agregar sección').click();
    cy.get('[role="dialog"]').within(() => {
      cy.contains('label', 'Galería de fotos').click();
      cy.byLabel('Título de la sección').type(sectionTitle);
      cy.byLabel('¿Qué galería querés mostrar?').click();
    });
    cy.contains('[role="option"]', seeded).click();
    cy.get('[role="dialog"]').contains('button', 'Guardar sección').click();
    cy.contains('[data-testid="content-row"]', sectionTitle)
      .should('contain', 'Galería de fotos')
      .and('contain', seeded);

    // Se ve en el sitio (el contenido público se cachea 60 s: se consulta la API sin caché).
    cy.api('GET', `/public/content/inscripciones?_=${Date.now()}`)
      .its('body.galleries')
      .should('satisfy', (g: { title: string }[]) => g.some((x) => x.title === sectionTitle));

    // Quitar la sección: está visible, así que primero se oculta.
    cy.contains('[data-testid="content-row"]', sectionTitle)
      .find('[data-testid="show-switch"]')
      .click();
    cy.contains('[data-testid="content-row"]', sectionTitle).should(
      'contain',
      'Mostrar en el sitio: No',
    );
    cy.contains('[data-testid="content-row"]', sectionTitle).contains('button', 'Eliminar').click();
    cy.get('[role="alertdialog"]').should('contain', 'La galería y sus fotos no se borran');
    cy.get('[role="alertdialog"]').contains('button', 'Eliminar').click();
    cy.contains('[data-testid="content-row"]', sectionTitle).should('not.exist');
    // La galería sigue existiendo con sus fotos.
    cy.api('GET', '/gallery')
      .its('body.galleries')
      .should('satisfy', (g: { name: string; items: unknown[] }[]) =>
        g.some((x) => x.name === seeded && x.items.length === 3),
      );
  });

  it('Estudiantes muestra "Vida en la cocina" desde su sección de galería', () => {
    cy.viewport(1440, 900);
    cy.visit('/estudiantes');
    cy.get('[data-testid=galeria] [aria-roledescription=diapositiva]').should('have.length', 3);
    cy.contains('h2', seeded).should('be.visible');
  });
});

/** RF09/US-30: la categoría se edita desde el panel, sugiere las ya usadas y se muestra en la fila. */
describe('Galerías · categoría', () => {
  it('el EDITOR cambia la categoría de una foto y el campo sugiere las existentes', () => {
    cy.viewport(1440, 900);
    cy.loginAsApi('EDITOR');
    cy.visit('/panel/galerias');
    cy.get(`${card(seeded)} ${row}`).should('have.length.at.least', 3);
    cy.contains(`${card(seeded)} ${row}`, 'Categoría: Platos').should('exist');
    cy.contains(`${card(seeded)} ${row}`, 'Categoría: Platos')
      .contains('button', 'Editar')
      .click();
    cy.get('[role="dialog"]').within(() => {
      cy.byLabel('Categoría (opcional)').should('have.value', 'Platos');
      cy.get('datalist#gallery-categories option').should('have.length.at.least', 3);
      cy.byLabel('Categoría (opcional)').clear().type('Platos finales');
      cy.contains('button', 'Guardar foto').click();
    });
    cy.contains(`${card(seeded)} ${row}`, 'Categoría: Platos finales').should('exist');
    // Se restaura para no alterar a las otras pruebas.
    cy.contains(`${card(seeded)} ${row}`, 'Categoría: Platos finales')
      .contains('button', 'Editar')
      .click();
    cy.get('[role="dialog"]').within(() => {
      cy.byLabel('Categoría (opcional)').clear().type('Platos');
      cy.contains('button', 'Guardar foto').click();
    });
    cy.contains(`${card(seeded)} ${row}`, 'Categoría: Platos ·').should('exist');
  });
});
