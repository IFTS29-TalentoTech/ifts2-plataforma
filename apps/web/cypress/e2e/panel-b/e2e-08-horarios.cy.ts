import { TINY_PDF } from '../../support/panel-b';

/**
 * E2E-08 (RF06, US-13/14): horarios por comisión y llamados a examen: crear, editar, publicar,
 * despublicar y eliminar. Se corre en 390 y 1440 px. Los datos creados llevan un sufijo único y se
 * eliminan al final de cada caso.
 */
const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];

for (const vp of viewports) {
  describe(`E2E-08 Horarios y llamados · ${vp.name}`, () => {
    const suffix = `${vp.width}-${Date.now()}`;
    const commission = `Comisión Prueba ${suffix}`;
    const callName = `Turno de prueba ${suffix}`;

    beforeEach(() => {
      cy.viewport(vp.width, vp.height);
      cy.loginAsApi('BEDELIA');
    });

    it('muestra el ciclo público y las grillas del ciclo (sin violaciones de accesibilidad)', () => {
      cy.visit('/panel/horarios');
      cy.get('[data-testid="public-term"]').should('contain', '2026 · 2.º cuatrimestre');
      cy.get('[data-testid="schedule-card"]').should('have.length.at.least', 1);
      cy.contains('h2', 'Grillas de cursada').should('be.visible');
      cy.contains('h2', 'Convocatorias y mesas de examen').should('be.visible');
      cy.a11y();
    });

    it('BEDELIA no ve el cambio de ciclo público (solo ADMIN)', () => {
      cy.visit('/panel/horarios');
      cy.contains('button', 'Nuevo ciclo').should('be.visible');
      cy.contains('button', 'Cambiar ciclo lectivo público').should('not.exist');
    });

    it('carga una grilla, la publica, la despublica y la elimina con confirmación', () => {
      cy.visit('/panel/horarios');
      cy.contains('button', 'Cargar nueva grilla').click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Comisión').type(commission);
        cy.get('[data-testid="file-input"]').selectFile(
          {
            contents: Cypress.Buffer.from(TINY_PDF),
            fileName: 'grilla-prueba.pdf',
            mimeType: 'application/pdf',
          },
          { force: true },
        );
        cy.contains('button', 'Cargar horario').click();
      });
      cy.contains('[data-testid="schedule-card"]', commission).within(() => {
        cy.contains('Sin publicar').should('be.visible');
        cy.contains('grilla-prueba').should('be.visible');
        cy.contains('button', 'Publicar').click();
      });
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Publicar este horario?').should('be.visible');
        cy.contains('button', 'Publicar').click();
      });
      cy.contains('[data-testid="schedule-card"]', commission).within(() => {
        cy.contains('Publicado').should('be.visible');
        // Lo publicado no se puede eliminar: el botón ni aparece.
        cy.contains('button', 'Eliminar').should('not.exist');
        cy.contains('button', 'Despublicar').click();
      });
      cy.get('[role="alertdialog"]').contains('button', 'Despublicar').click();
      cy.contains('[data-testid="schedule-card"]', commission).within(() => {
        cy.contains('Sin publicar').should('be.visible');
        cy.contains('button', 'Eliminar').click();
      });
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Eliminar este horario?').should('be.visible');
        cy.contains('button', 'Eliminar').click();
      });
      cy.contains(commission).should('not.exist');
    });

    it('crea un llamado destacado, lo edita, lo publica y lo elimina', () => {
      cy.visit('/panel/horarios');
      cy.contains('button', 'Configurar nuevo llamado').click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Denominación del turno').type(callName);
        cy.byLabel('Apertura SIU Guaraní').type('2026-12-01');
        cy.byLabel('Cierre SIU Guaraní').type('2026-12-08');
        cy.contains('label', 'Destacar en el Inicio del sitio').click();
        cy.contains('button', 'Crear llamado').click();
      });
      cy.contains('[data-testid="exam-call-card"]', callName).within(() => {
        cy.contains('Destacado en el Inicio').should('be.visible');
        cy.contains('Sin publicar').should('be.visible');
        cy.contains('button', 'Editar llamado a examen').click();
      });
      cy.get('[role="dialog"]').within(() => {
        cy.contains('label', 'Inscripción abierta').click();
        cy.contains('button', 'Guardar cambios').click();
      });
      cy.contains('[data-testid="exam-call-card"]', callName).within(() => {
        cy.contains('Inscripción abierta').should('be.visible');
        cy.contains('button', 'Publicar').click();
      });
      cy.get('[role="alertdialog"]').contains('button', 'Publicar').click();
      cy.contains('[data-testid="exam-call-card"]', callName).contains('Publicado');
      // La API pública ya lo muestra.
      cy.request('/api/v1/public/students')
        .its('body.examCalls')
        .should((calls: { name: string }[]) => {
          expect(calls.map((c) => c.name)).to.include(callName);
        });
      cy.contains('[data-testid="exam-call-card"]', callName)
        .contains('button', 'Despublicar')
        .click();
      cy.get('[role="alertdialog"]').contains('button', 'Despublicar').click();
      cy.contains('[data-testid="exam-call-card"]', callName)
        .contains('button', 'Eliminar')
        .click();
      cy.get('[role="alertdialog"]').contains('button', 'Eliminar').click();
      cy.contains(callName).should('not.exist');
    });

    it('muestra un error claro si la fecha de fin es anterior a la de inicio', () => {
      cy.visit('/panel/horarios');
      cy.contains('button', 'Configurar nuevo llamado').click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Denominación del turno').type('Fechas invertidas');
        cy.byLabel('Apertura SIU Guaraní').type('2026-12-10');
        cy.byLabel('Cierre SIU Guaraní').type('2026-12-01');
        cy.contains('button', 'Crear llamado').click();
        cy.contains('La fecha de fin no puede ser anterior').should('be.visible');
      });
    });
  });
}
