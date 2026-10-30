/**
 * Genera las capturas del Manual de Usuario (sitio público) desde la app real con datos demo.
 * No verifica comportamiento: eso lo hacen los otros specs. Salida: cypress/screenshots/public/capturas.cy.ts/
 * y se copian a docs/capturas/publico/ (ver README de features/public).
 */
const pages: Array<[string, string]> = [
  ['inicio', '/'],
  ['institucional', '/institucional'],
  ['la-carrera', '/la-carrera'],
  ['estudiantes', '/estudiantes'],
  ['ingreso', '/ingreso'],
  ['inscripciones', '/inscripciones'],
  ['novedades', '/novedades'],
];
const sizes: Array<[number, number]> = [
  [1440, 900],
  [390, 844],
];

describe('Capturas del sitio público', () => {
  for (const [w, h] of sizes) {
    for (const [name, path] of pages) {
      it(`${name} ${w}`, () => {
        cy.viewport(w, h);
        cy.visit(path);
        cy.get('main h1').should('be.visible');
        // La cabecera es "sticky": en capturas de página completa se repetiría a mitad de la imagen.
        cy.get('header').invoke('css', 'position', 'static');
        cy.screenshot(`${name}-${w}`, { capture: 'fullPage', overwrite: true });
      });
    }
  }
  it('menú móvil abierto', () => {
    cy.viewport(390, 844);
    cy.visit('/');
    cy.get('button[aria-controls="mobile-menu"]').click();
    cy.screenshot('menu-movil-390', { capture: 'viewport', overwrite: true });
  });
});

export {};
