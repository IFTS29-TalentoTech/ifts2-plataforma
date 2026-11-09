import '../../support/panel-b';

/**
 * Ajustes de cada página (Páginas del sitio): el ADMIN edita el titular de Inicio y
 * sube sus imágenes como archivo (no escribe rutas) dentro de la ventana "Ajustes de la página"; el
 * logo se sube desde "Datos institucionales" y aparece en el encabezado del login. Quitar una imagen
 * pide confirmación. En 390 y 1440 px, con axe.
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
  fileName: 'logo.png',
  mimeType: 'image/png',
});

// Estas pruebas cambian el logo, la imagen y el titular de Inicio: al terminar se devuelve cada ajuste a su
// valor original para no alterar a los demás specs (que comparten la base de pruebas).
const TOUCHED = ['logo_url', 'hero_image_1', 'hero_title'] as const;
let original: Record<string, string> = {};

before(() => {
  cy.loginAsApi('ADMIN');
  cy.api('GET', '/settings').then((r) => {
    original = Object.fromEntries(TOUCHED.map((k) => [k, (r.body[k] as string | null) ?? '']));
  });
});

after(() => {
  cy.loginAsApi('ADMIN');
  cy.api('PUT', '/settings', original);
});

for (const vp of viewports) {
  describe(`Ajustes de la página · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('la pantalla general ya no pide rutas de imágenes ni el titular de Inicio', () => {
      cy.loginAsApi('ADMIN');
      cy.visit('/panel/configuracion');
      cy.contains('h1', 'Configuración del sitio y sede').should('be.visible');
      cy.contains('Encabezado de Inicio e imágenes').should('not.exist');
      cy.contains('label', 'Inicio: imagen principal').should('not.exist');
      cy.contains('Logo del encabezado').should('be.visible');
      // Solo dos pestañas, en este orden; páginas y galerías tienen su pantalla propia.
      cy.get('[role="tab"]').then(($t) => {
        expect([...$t].map((t) => t.textContent)).to.deep.eq([
          'Integraciones',
          'Enlaces de interés',
        ]);
      });
      cy.contains('a', 'Editar páginas del sitio').should('have.attr', 'href', '/panel/paginas');
      cy.a11y();
    });

    it('edita el titular y sube una imagen de Inicio dentro de su ventana', () => {
      const title = `Titular ${vp.width}-${Date.now()}`;
      cy.loginAsApi('ADMIN');
      cy.visit('/panel/paginas');
      cy.contains('button', 'Inicio').click();
      cy.contains('[data-testid="block-row"]', 'Encabezado')
        .contains('button', 'Cambiar textos e imágenes')
        .click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('Ajustes de la página: Inicio').should('be.visible');
        cy.contains('Imagen principal').should('be.visible');
        cy.byLabel('Titular').clear().type(title);
        cy.get('[data-testid="file-input"]').first().selectFile(png(), { force: true });
      });
      cy.contains('Imagen principal: imagen actualizada.').should('be.visible');
      cy.get('[role="dialog"]').contains('button', 'Guardar textos').click();
      cy.contains(`Ajustes de Inicio guardados.`).should('be.visible');
      cy.api('GET', `/public/settings?_=${Date.now()}`).then((r) => {
        expect(r.body.hero_title).to.eq(title);
        // Se subió un archivo: la API devuelve una URL, no la ruta provisoria de la semilla.
        expect(r.body.hero_image_1).to.not.match(/^\/img\/provisorio\//);
      });
    });

    it('sube el logo, se ve en el login y se puede quitar con confirmación', () => {
      cy.loginAsApi('ADMIN');
      cy.visit('/panel/configuracion');
      cy.get('[data-testid="file-input"]').first().selectFile(png(), { force: true });
      cy.contains('Logo del encabezado: imagen actualizada.').should('be.visible');
      cy.api('GET', `/public/settings?_=${Date.now()}`)
        .its('body.logo_url')
        .should('match', /^https?:\/\//);
      cy.get('button[aria-label="Quitar: Logo del encabezado"]').click();
      cy.get('[role="alertdialog"]').should('contain', '¿Quitar esta imagen?');
      cy.get('[role="alertdialog"]').contains('button', 'Quitar').click();
      cy.contains('Imagen quitada.').should('be.visible');
      cy.api('GET', `/public/settings?_=${Date.now()}`)
        .its('body')
        .should('not.have.property', 'logo_url');
    });
  });
}
