/**
 * A14: la tarjeta "Ingreso" del Resumen dice solo lo que el sistema puede comprobar.
 * Con la semilla demo, la página de Ingreso tiene datos "[a confirmar con el cliente]"; la tarjeta
 * lo avisa, presenta el año como estimado y ya no afirma una "ficha de preinscripción activa".
 */
import { VIEWPORTS } from '../../support/panel-a';

for (const vp of VIEWPORTS) {
  describe(`Resumen · tarjeta Ingreso · ${vp.name}px`, () => {
    beforeEach(() => {
      cy.viewport(vp.width, vp.height);
      cy.loginAs('editor');
    });

    it('con datos reales: avisa lo pendiente y presenta el año como estimado', () => {
      cy.visit('/panel');
      cy.get('[data-testid=stat-ingreso]').as('card');
      cy.get('@card').should('contain', 'A confirmar');
      cy.get('@card').should('contain', 'tiene datos a confirmar');
      cy.get('@card').should('contain', 'El año es estimado');
      cy.contains('preinscripción activa').should('not.exist');
      cy.a11y();
    });

    it('sin contenido publicado: lo dice en lugar de inventar una convocatoria', () => {
      cy.intercept('GET', '/api/v1/dashboard', (req) => {
        // Sin ETag: si la API responde 304 (cuerpo vacío) no hay JSON que modificar.
        delete req.headers['if-none-match'];
        req.continue((res) => {
          // Y que el navegador no guarde esta respuesta alterada para la prueba siguiente.
          delete res.headers.etag;
          res.headers['cache-control'] = 'no-store';
          res.body.ingresoContent = { visibleSections: 0, pendingConfirmation: false };
        });
      });
      cy.visit('/panel');
      cy.get('[data-testid=stat-ingreso]')
        .should('contain', 'Sin publicar')
        .and('contain', 'La página de Ingreso no tiene contenido publicado.');
    });
  });
}

export {};
