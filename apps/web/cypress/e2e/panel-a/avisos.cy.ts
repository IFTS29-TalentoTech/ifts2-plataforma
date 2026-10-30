/**
 * E2E-06 (aviso con adjunto y vigencia; vencido desaparece del sitio pero queda en el panel), E2E-07 (pausar y
 * reanudar), E2E-16 (CRUD completo con eliminación confirmada; el vigente no se elimina), E2E-17 (validaciones)
 * y E2E-13/axe en Avisos. Usuario: Bedelía (rol que gestiona avisos).
 */
import {
  cleanupE2eData,
  inDays,
  seedExpiredNotice,
  seedNotice,
  unique,
  VIEWPORTS,
} from '../../support/panel-a';

const publicTitles = () =>
  cy
    .api('GET', `/public/students?_=${Date.now()}`)
    .then((r) => (r.body.notices as Array<{ title: string }>).map((n) => n.title));

for (const vp of VIEWPORTS) {
  describe(`Avisos académicos · ${vp.name}px`, () => {
    before(() => {
      cy.loginAs('bedelia');
      cleanupE2eData();
    });
    after(() => {
      cy.loginAs('bedelia');
      cleanupE2eData();
    });
    beforeEach(() => {
      cy.viewport(vp.width, vp.height);
      cy.loginAs('bedelia');
    });

    it('E2E-06: crea un aviso con adjunto y vigencia; se ve en Estudiantes', () => {
      const title = unique('Aviso con adjunto');
      cy.visit('/panel/avisos');
      cy.contains('h1', 'Avisos académicos');
      cy.get('main h3').should('exist'); // la lista cargó: la pantalla ya está hidratada
      cy.a11y();
      cy.contains('button', 'Nuevo aviso').click();
      cy.get('[role="dialog"]').should('contain', 'Publicar nuevo aviso académico');
      cy.a11y();
      cy.contains('label', 'Título del comunicado').parent().find('input').type(title);
      cy.contains('label', 'Contenido del aviso')
        .parent()
        .find('textarea')
        .type('Texto del aviso de prueba.');
      cy.contains('label', 'Visible hasta').parent().find('input').type(inDays(20));
      cy.get('#aviso-adjunto').selectFile('cypress/fixtures/adjunto-demo.pdf');
      cy.contains('label', 'Marcar como urgente').click();
      cy.contains('button', 'Publicar aviso').click();
      cy.get('[role="alertdialog"]').should('contain', '¿Publicar el aviso?');
      cy.get('[role="alertdialog"]').contains('button', 'Sí, publicar').click();
      cy.contains('Aviso publicado').should('be.visible');
      cy.contains('li', title).within(() => {
        cy.contains('Urgente');
        cy.contains('En línea');
        cy.contains('adjunto-demo');
      });
      publicTitles().then((t) => expect(t).to.include(title));
    });

    it('E2E-15: un archivo de tipo no permitido muestra un error claro', () => {
      cy.visit('/panel/avisos');
      cy.get('main h3').should('exist'); // la lista cargó: la pantalla ya está hidratada
      cy.contains('button', 'Nuevo aviso').click();
      cy.contains('label', 'Título del comunicado')
        .parent()
        .find('input')
        .type(unique('Aviso con txt'));
      cy.contains('label', 'Contenido del aviso').parent().find('textarea').type('Texto.');
      cy.get('#aviso-adjunto').selectFile('cypress/fixtures/no-permitido.txt');
      cy.contains('button', 'Publicar aviso').click();
      cy.get('[role="alertdialog"]').contains('button', 'Sí, publicar').click();
      cy.get('[role="dialog"]').contains('Ese tipo de archivo no está permitido');
    });

    it('E2E-06: un aviso vencido no se ve en el sitio pero queda en el panel y se reactiva', () => {
      seedNotice({ title: unique('Aviso e2e relleno') }); // asegura al menos un aviso vigente
      const expiredTitle = unique('Aviso vencido');
      seedExpiredNotice(expiredTitle);
      publicTitles().then((t) => expect(t).to.not.include(expiredTitle));
      cy.visit('/panel/avisos');
      cy.contains('li', expiredTitle).contains('Vencido');
      // Filtro Vencidos.
      cy.contains('label', 'Estado').parent().find('button[role="combobox"]').click();
      cy.contains('[role="option"]', 'Vencidos').click();
      cy.contains('li', expiredTitle).contains('button', 'Reactivar').click();
      cy.get('[role="dialog"]').should('contain', 'Reactivar aviso vencido');
      cy.get('[role="dialog"] button[type="submit"]').click();
      cy.contains('Elegí la nueva fecha de fin.');
      cy.get('[role="dialog"] input[type="date"]').type(inDays(15));
      cy.get('[role="dialog"] button[type="submit"]').click();
      cy.contains('Aviso reactivado').should('be.visible');
      publicTitles().then((t) => expect(t).to.include(expiredTitle));
    });

    it('E2E-07: pausar y reanudar un aviso', () => {
      seedNotice().then((n) => {
        cy.visit('/panel/avisos');
        cy.contains('li', n.title).contains('button', 'Pausar').click();
        cy.get('[role="alertdialog"]').should('contain', '¿Pausar el aviso?');
        cy.get('[role="alertdialog"]').contains('button', 'Sí, pausar').click();
        cy.contains('li', n.title).contains('Pausado');
        publicTitles().then((t) => expect(t).to.not.include(n.title));
        cy.contains('li', n.title).contains('button', 'Reanudar').click();
        cy.get('[role="alertdialog"]').contains('button', 'Sí, reanudar').click();
        cy.contains('li', n.title).contains('En línea');
        publicTitles().then((t) => expect(t).to.include(n.title));
      });
    });

    it('E2E-16: CRUD completo; el vigente no se elimina y el vencido sí, con confirmación', () => {
      const old = unique('Aviso a eliminar');
      seedExpiredNotice(old).then((n) => {
        // La API rechaza eliminar uno vigente (409).
        seedNotice().then((live) => {
          cy.api('DELETE', `/notices/${live.id}`, undefined, false).its('status').should('eq', 409);
        });
        cy.visit('/panel/avisos');
        cy.contains('label', 'Estado').parent().find('button[role="combobox"]').click();
        cy.contains('[role="option"]', 'Vencidos').click();
        // Editar.
        cy.contains('li', old).contains('button', 'Editar').click();
        cy.get('[role="dialog"]').should('contain', 'Editar aviso académico');
        const renamed = `${old} (editado)`;
        cy.contains('label', 'Título del comunicado').parent().find('input').clear().type(renamed);
        cy.contains('button', 'Guardar cambios').click();
        cy.get('[role="alertdialog"]').contains('button', 'Sí, guardar').click();
        cy.contains('Cambios guardados').should('be.visible');
        cy.contains('li', renamed).should('be.visible');
        // Eliminar con confirmación.
        cy.contains('li', renamed).contains('button', 'Eliminar').click();
        cy.get('[role="alertdialog"]').should('contain', '¿Eliminar el aviso?');
        cy.get('[role="alertdialog"]').contains('button', 'Cancelar').click();
        cy.contains('li', renamed).should('exist'); // cancelar no elimina
        cy.contains('li', renamed).contains('button', 'Eliminar').click();
        cy.get('[role="alertdialog"]').contains('button', 'Sí, eliminar').click();
        cy.contains('Aviso eliminado').should('be.visible');
        cy.contains('li', renamed).should('not.exist');
        cy.api('GET', `/notices/${n.id}`, undefined, false).its('status').should('eq', 404);
      });
    });

    it('E2E-16: un aviso vigente no ofrece "Eliminar" en la lista', () => {
      seedNotice().then((n) => {
        cy.visit('/panel/avisos');
        cy.contains('li', n.title).within(() => {
          cy.contains('button', 'Editar');
          cy.contains('button', 'Eliminar').should('not.exist');
        });
      });
    });

    it('E2E-17: validaciones en línea con mensajes claros', () => {
      cy.visit('/panel/avisos');
      cy.get('main h3').should('exist'); // la lista cargó: la pantalla ya está hidratada
      cy.contains('button', 'Nuevo aviso').click();
      cy.contains('button', 'Publicar aviso').click();
      cy.contains('El título es obligatorio.').should('be.visible');
      cy.contains('El texto del aviso es obligatorio.').should('be.visible');
      cy.get('[role="alertdialog"]').should('not.exist');
      cy.contains('label', 'Título del comunicado')
        .parent()
        .find('input')
        .type('Aviso con fechas mal');
      cy.contains('label', 'Contenido del aviso').parent().find('textarea').type('Texto.');
      cy.contains('label', 'Visible desde').parent().find('input').type(inDays(10));
      cy.contains('label', 'Visible hasta').parent().find('input').type(inDays(5));
      cy.contains('button', 'Publicar aviso').click();
      cy.contains('La fecha de fin debe ser posterior a la fecha de inicio.').should('be.visible');
      cy.a11y();
    });

    it('E2E-13: teclado y foco en los diálogos de Avisos', () => {
      seedNotice().then((n) => {
        cy.visit('/panel/avisos');
        cy.contains('li', n.title).contains('button', 'Pausar').as('opener').click();
        cy.get('[role="alertdialog"]').should('be.visible');
        cy.focused().closest('[role="alertdialog"]').should('exist');
        cy.get('body').type('{esc}');
        cy.get('[role="alertdialog"]').should('not.exist');
        cy.get('@opener').should('have.focus');
      });
    });
  });
}
