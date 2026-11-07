import '../../support/panel-b';

/**
 * Galerías editables (RF09, ADR-036): el EDITOR sube, edita, reordena y elimina una diapositiva con la
 * interfaz real (eliminar pide confirmación); quien no tiene `gallery:manage` no ve la opción y la API
 * responde 403. En 390 y 1440 px, con axe.
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

const students = '[data-testid="gallery-STUDENTS"]';

for (const vp of viewports) {
  describe(`Galerías · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('el EDITOR sube, edita, reordena y elimina una diapositiva (con confirmación)', () => {
      const title = `Prueba ${vp.width}-${Date.now()}`;
      cy.loginAsApi('EDITOR');
      cy.visit('/panel/galerias');
      cy.contains('h1', 'Galerías').should('be.visible');
      // Las 3 de la semilla (provisorias) para Estudiantes y 1 para La carrera.
      cy.get(`${students} [data-testid="gallery-row"]`).should('have.length', 3);
      cy.get('[data-testid="gallery-CAREER"] [data-testid="gallery-row"]').should('have.length', 1);
      cy.a11y();

      // Alta: la foto es obligatoria.
      cy.get(`${students} button[aria-label^="Agregar diapositiva"]`).click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Guardar diapositiva').click();
        cy.contains('Elegí la foto de la diapositiva.').should('be.visible');
        cy.get('[data-testid="file-input"]').selectFile(png(), { force: true });
        cy.byLabel('Título (opcional)').type(title);
        cy.byLabel('Descripción (opcional)').type('Texto de prueba');
        cy.contains('button', 'Guardar diapositiva').click();
      });
      cy.get(`${students} [data-testid="gallery-row"]`).should('have.length', 4);
      cy.contains(`${students} [data-testid="gallery-row"]`, title).should(
        'contain',
        'Posición 4 de 4',
      );

      // Edición de los textos.
      cy.contains(`${students} [data-testid="gallery-row"]`, title)
        .contains('button', 'Editar')
        .click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Título (opcional)').clear().type(`${title} (editada)`);
        cy.contains('button', 'Guardar diapositiva').click();
      });
      cy.contains(`${students} [data-testid="gallery-row"]`, `${title} (editada)`).should('exist');

      // Orden: "Subir" la nueva (última) la pasa a la posición 3.
      cy.contains(`${students} [data-testid="gallery-row"]`, `${title} (editada)`)
        .contains('button', 'Subir')
        .click();
      cy.contains(`${students} [data-testid="gallery-row"]`, `${title} (editada)`).should(
        'contain',
        'Posición 3 de 4',
      );

      // Eliminación: pide confirmación y queda como al principio.
      cy.contains(`${students} [data-testid="gallery-row"]`, `${title} (editada)`)
        .contains('button', 'Eliminar')
        .click();
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Eliminar esta diapositiva?').should('be.visible');
        cy.contains('button', 'Cancelar').click();
      });
      cy.get(`${students} [data-testid="gallery-row"]`).should('have.length', 4);
      cy.contains(`${students} [data-testid="gallery-row"]`, `${title} (editada)`)
        .contains('button', 'Eliminar')
        .click();
      cy.get('[role="alertdialog"]').within(() => cy.contains('button', 'Eliminar').click());
      cy.get(`${students} [data-testid="gallery-row"]`).should('have.length', 3);
    });

    it('rechaza archivos que no son imagen con un mensaje claro', () => {
      cy.loginAsApi('EDITOR');
      cy.visit('/panel/galerias');
      cy.get(`${students} button[aria-label^="Agregar diapositiva"]`).click();
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
      cy.get(`${students} [data-testid="gallery-row"]`).should('have.length', 3);
    });

    it('BEDELIA no ve Galerías y la API responde 403', () => {
      cy.loginAsApi('BEDELIA');
      cy.visit('/panel/galerias');
      cy.contains('Tu rol no tiene acceso a esta sección').should('be.visible');
      cy.get(`${students}`).should('not.exist');
      cy.api('GET', '/gallery').its('status').should('eq', 403);
      cy.api('DELETE', '/gallery/6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111')
        .its('status')
        .should('eq', 403);
    });
  });
}
