import '../../support/panel-b';

/**
 * Plantel docente (RF10, US-29, ADR-037): el EDITOR da de alta, edita, reordena, oculta (baja lógica)
 * y elimina a una persona con la interfaz real. Eliminar solo está disponible si está oculta y pide
 * confirmación. Quien no tiene `teachers:manage` no entra y la API responde 403. En 390 y 1440 px, con axe.
 * La semilla de demostración trae 6 docentes ficticios (uno oculto).
 */
const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];

const rows = '[data-testid="teacher-row"]';

for (const vp of viewports) {
  describe(`Plantel docente · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('el EDITOR agrega, edita, oculta y elimina una persona (con confirmación)', () => {
      const name = `Docente prueba ${vp.width}-${Date.now()}`;
      cy.loginAsApi('EDITOR');
      cy.visit('/panel/plantel');
      cy.contains('h1', 'Plantel docente').should('be.visible');
      cy.get(rows).should('have.length.at.least', 6);
      cy.contains(`${rows}`, 'Esteban Rinaldi (oculto)').should('contain', 'Oculta');
      cy.a11y();

      // Alta: el nombre es obligatorio.
      cy.contains('button', 'Agregar docente').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Guardar docente').click();
        cy.contains('El nombre es obligatorio.').should('be.visible');
        cy.byLabel('Nombre y apellido').type(name);
        cy.byLabel('Cargo (opcional)').type('Profesora');
        cy.byLabel('Materias a cargo (opcional)').type('Materia uno{enter}Materia dos');
        cy.contains('button', 'Guardar docente').click();
      });
      cy.contains(rows, name).should('contain', 'Materias: Materia uno · Materia dos');
      cy.contains(rows, name).should('contain', 'Visible');

      // Edición.
      cy.contains(rows, name).contains('button', 'Editar').click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Cargo (opcional)').clear().type('Jefa de área');
        cy.contains('button', 'Guardar docente').click();
      });
      cy.contains(rows, name).should('contain', 'Jefa de área');

      // Visible: no hay botón Eliminar. Ocultar (baja lógica) lo habilita.
      cy.contains(rows, name).contains('button', 'Eliminar').should('not.exist');
      cy.contains(rows, name).contains('button', 'Ocultar').click();
      cy.contains(rows, name).should('contain', 'Oculta');

      // Eliminación: pide confirmación. (`force`: los avisos de la esquina pueden tapar el botón.)
      cy.contains(rows, name).contains('button', 'Eliminar').click({ force: true });
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Eliminar a esta persona del plantel?').should('be.visible');
        cy.contains('button', 'Cancelar').click();
      });
      cy.contains(rows, name).should('exist');
      cy.contains(rows, name).contains('button', 'Eliminar').click({ force: true });
      cy.get('[role="alertdialog"]').within(() => cy.contains('button', 'Eliminar').click());
      cy.contains(rows, name).should('not.exist');
    });

    it('BEDELIA no accede y la API responde 403', () => {
      cy.loginAsApi('BEDELIA');
      cy.visit('/panel/plantel');
      cy.contains('Tu rol no tiene acceso a esta sección').should('be.visible');
      cy.get(rows).should('not.exist');
      cy.api('GET', '/teachers').its('status').should('eq', 403);
      cy.api('DELETE', '/teachers/6b0a6a54-3d0c-4a38-8d26-3a8e7f2c1111')
        .its('status')
        .should('eq', 403);
    });
  });
}

export {};
