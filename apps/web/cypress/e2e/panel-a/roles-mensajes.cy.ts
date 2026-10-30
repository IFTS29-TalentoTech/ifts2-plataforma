/**
 * E2E-11 (Bedelía no ve ni accede a redes; Comunicación no ve avisos ni mensajes) y bandeja de mensajes de
 * contacto (RF08): marcar leído/respondido y eliminar (solo ADMIN y respondidos, con confirmación).
 */
import { unique, VIEWPORTS } from '../../support/panel-a';

for (const vp of VIEWPORTS) {
  describe(`Roles y mensajes · ${vp.name}px`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('E2E-11: Bedelía no ve Publicaciones ni bloques de redes, y la API responde 403', () => {
      cy.loginAs('bedelia');
      cy.visit('/panel');
      cy.contains('h1', 'Panel de control');
      cy.contains('Avisos activos').should('be.visible');
      cy.contains('Instagram API').should('not.exist');
      cy.contains('Redes sociales').should('not.exist');
      cy.contains('Publicaciones de redes por moderar').should('not.exist');
      cy.openPanelNav();
      cy.get('a[href="/panel/publicaciones"]').should('not.exist');
      cy.get('a[href="/panel/avisos"]').should('exist');
      cy.get('a[href="/panel/mensajes"]').should('exist');
      cy.visit('/panel/publicaciones');
      cy.contains('Tu rol no tiene acceso a esta sección').should('be.visible');
      cy.a11y();
      cy.api('GET', '/social/posts', undefined, false).its('status').should('eq', 403);
    });

    it('Comunicación (Editor) no ve Avisos ni Mensajes', () => {
      cy.loginAs('editor');
      cy.visit('/panel');
      cy.contains('Avisos activos').should('not.exist');
      cy.contains('Cartelera institucional activa').should('not.exist');
      cy.contains('Moderar').should('exist');
      cy.openPanelNav();
      cy.get('a[href="/panel/avisos"]').should('not.exist');
      cy.get('a[href="/panel/mensajes"]').should('not.exist');
      cy.visit('/panel/mensajes');
      cy.contains('Tu rol no tiene acceso a esta sección').should('be.visible');
    });

    it('Mensajes: marcar leído y respondido (Bedelía); no puede eliminar', () => {
      const subject = unique('Consulta');
      cy.task('panelA:createContactMessage', subject);
      cy.loginAs('bedelia');
      cy.visit('/panel/mensajes');
      cy.contains('h1', 'Mensajes de contacto');
      cy.a11y();
      cy.contains('li', subject).contains('Nuevo');
      cy.contains('li', subject).contains('button', 'Marcar como leído').click();
      cy.contains('li', subject).contains('Leído');
      cy.contains('li', subject).contains('button', 'Marcar como respondido').click();
      cy.contains('li', subject).contains('Respondido');
      cy.contains('li', subject).contains('button', 'Eliminar').should('not.exist');
    });

    it('Mensajes: el Administrador elimina uno respondido con confirmación', () => {
      const subject = unique('Consulta a eliminar');
      cy.task('panelA:createContactMessage', subject);
      cy.loginAs('admin');
      cy.visit('/panel/mensajes');
      cy.contains('li', subject).contains('button', 'Eliminar').should('not.exist'); // todavía no respondido
      cy.contains('li', subject).contains('button', 'Marcar como respondido').click();
      cy.contains('li', subject).contains('button', 'Eliminar').click();
      cy.get('[role="alertdialog"]').should('contain', '¿Eliminar el mensaje?');
      cy.get('[role="alertdialog"]').contains('button', 'Sí, eliminar').click();
      cy.contains('Mensaje eliminado').should('be.visible');
      cy.contains('li', subject).should('not.exist');
    });

    it('el Administrador ve todas las secciones del Resumen', () => {
      cy.loginAs('admin');
      cy.visit('/panel');
      cy.contains('Instagram API').should('be.visible');
      cy.contains('Avisos activos').should('be.visible');
      cy.contains('Cartelera institucional activa').should('be.visible');
      cy.contains('Acciones rápidas').should('be.visible');
      cy.a11y();
    });
  });
}
