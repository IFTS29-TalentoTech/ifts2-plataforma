import '../../support/panel-b';

/**
 * Capturas para el Manual de Usuario (prefijo `b-`), desde la app real con datos de demostración.
 * Salen en cypress/screenshots/capturas-manual.cy.ts/ y se copian a docs/capturas/panel/
 * (ver apps/web/src/features/panel-b/README.md, "Capturas").
 */
const viewports = [
  { tag: '1440', width: 1440, height: 900 },
  { tag: '390', width: 390, height: 844 },
];

for (const vp of viewports) {
  describe(`Capturas Panel B · ${vp.tag}`, () => {
    beforeEach(() => {
      cy.viewport(vp.width, vp.height);
      cy.loginAsApi('ADMIN');
    });
    const shot = (name: string) => {
      cy.wait(400);
      cy.screenshot(`b-${name}-${vp.tag}`, { overwrite: true });
    };
    /** Las fotos cargan perezosamente: se espera a que las de la pantalla estén dibujadas antes de capturar. */
    const imagesLoaded = () => {
      cy.get('main img').each(($img) => {
        cy.wrap($img).scrollIntoView();
        cy.wrap($img).should(($i) =>
          expect(($i[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0),
        );
      });
      cy.get('main').scrollTo('top', { ensureScrollable: false });
    };
    const loaded = () => cy.get('[role="status"][aria-busy="true"]').should('not.exist');

    it('Horarios', () => {
      cy.visit('/panel/horarios');
      cy.get('[data-testid="schedule-card"]').should('exist');
      loaded();
      shot('horarios');
      cy.contains('button', 'Cargar nueva grilla').click();
      shot('horarios-cargar-grilla');
      cy.get('body').type('{esc}');
      cy.contains('button', 'Configurar nuevo llamado').click();
      shot('horarios-nuevo-llamado');
      cy.get('body').type('{esc}');
      cy.get('[data-testid="schedule-card"]')
        .first()
        .contains('button', /Publicar|Despublicar/)
        .click();
      shot('horarios-confirmar-publicacion');
      cy.contains('button', 'Cancelar').click();
      cy.contains('button', 'Cambiar ciclo lectivo público').click();
      cy.get('[role="dialog"]').contains('button', 'Continuar').click();
      shot('horarios-cambiar-ciclo-confirmar');
      cy.contains('button', 'Cancelar').click();
    });

    it('Archivo', () => {
      cy.visit('/panel/archivo');
      cy.get(vp.width < 768 ? '[data-testid="doc-card"]' : '[data-testid="doc-row"]').should(
        'exist',
      );
      loaded();
      shot('archivo');
      cy.get(vp.width < 768 ? '[data-testid="doc-card"]' : '[data-testid="doc-row"]')
        .filter(':visible')
        .first()
        .contains('button', 'Ver detalle')
        .click();
      cy.contains('Dónde se usa').should('be.visible');
      shot('archivo-detalle');
      cy.contains('[role="dialog"] button', 'Restaurar').click();
      shot('archivo-confirmar-restaurar');
      cy.contains('[role="alertdialog"] button', 'Cancelar').click();
      cy.contains('button', 'Archivar nuevo documento').click();
      shot('archivo-subir');
    });

    it('Configuración e integraciones', () => {
      cy.visit('/panel/configuracion');
      cy.contains('h1', 'Configuración del sitio y sede').should('be.visible');
      cy.get('[data-testid="cfg-public-term"]').should('not.contain', 'Cargando');
      loaded();
      shot('configuracion');
      cy.byLabel('Teléfono institucional').type('0');
      cy.contains('button', 'Guardar cambios').click();
      shot('configuracion-confirmar-cambios');
      cy.contains('button', 'Cancelar').click();
      cy.contains('button', 'Gestionar usuarios').click();
      cy.get('[data-testid="user-row"]').should('exist');
      shot('configuracion-usuarios');
      cy.get('body').type('{esc}');
      shot('configuracion-contenido');
      cy.contains('[role="tab"]', 'Enlaces de interés').click();
      cy.get('[data-testid="link-row"]').should('exist');
      shot('configuracion-enlaces');
      cy.contains('[role="tab"]', 'Integraciones').click();
      cy.get('[data-testid="ig-status"]').should('be.visible');
      shot('integraciones-instagram');
      cy.get('[data-testid="ig-guide"] summary').click();
      shot('integraciones-guia');
      cy.get('[data-testid="mail-status"]').scrollIntoView();
      shot('integraciones-correo');
    });

    it('Roles y permisos (Superadministrador)', () => {
      cy.loginAsApi('SUPERADMIN');
      cy.visit('/panel/roles');
      cy.contains('h1', 'Roles y permisos').should('be.visible');
      loaded();
      shot('roles');
    });

    it('Galerías y plantel docente', () => {
      cy.visit('/panel/galerias');
      cy.contains('h1', 'Galerías').should('be.visible');
      loaded();
      imagesLoaded();
      shot('galerias');
      cy.visit('/panel/plantel');
      cy.contains('h1', 'Plantel docente').should('be.visible');
      loaded();
      imagesLoaded();
      shot('plantel');
    });

    it('Páginas del sitio', () => {
      cy.visit('/panel/paginas');
      cy.contains('h1', 'Páginas del sitio').should('be.visible');
      cy.contains('button', 'Estudiantes').click();
      cy.contains('[data-testid="content-row"]', 'Vida en la cocina').should('be.visible');
      loaded();
      shot('paginas');
    });
  });
}
