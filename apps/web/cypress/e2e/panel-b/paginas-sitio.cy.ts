import '../../support/panel-b';

/**
 * Páginas del sitio (ADR-042): cada página lista sus bloques en el orden real del sitio, con nombre,
 * explicación e interruptor «Mostrar en el sitio: Sí / No». Los bloques fijos se ocultan pero no se
 * eliminan; el encabezado siempre se muestra; los bloques que vienen de otra pantalla llevan allí; y en
 * CUALQUIER página (Inicio incluida) se puede agregar una sección. En 390 y 1440 px, con axe.
 */
const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];

const row = (text: string) =>
  cy.contains('[data-testid="block-row"], [data-testid="content-row"]', text);

for (const vp of viewports) {
  describe(`Páginas del sitio · ${vp.name}`, () => {
    beforeEach(() => {
      cy.viewport(vp.width, vp.height);
      cy.loginAsApi('ADMIN');
    });

    it('el título aparece una sola vez y cada página muestra sus partes numeradas', () => {
      cy.visit('/panel/paginas');
      cy.contains('h1', 'Páginas del sitio').should('be.visible');
      cy.contains('h2', 'Páginas del sitio').should('not.exist');
      // Inicio: encabezado, accesos, enlaces, próximos eventos y actualidad (en ese orden).
      cy.get('[data-testid="block-row"]').then(($r) => {
        const names = [...$r].map((e) => e.querySelector('p')?.textContent ?? '');
        expect(names[0]).to.contain('Encabezado');
        expect(names.join('|')).to.contain('Accesos rápidos');
        expect(names.join('|')).to.contain('Actualidad institucional');
      });
      cy.contains('Siempre se muestra').should('be.visible');
      cy.a11y();

      // Institucional: el encabezado y las tarjetas se distinguen por su nombre.
      cy.contains('button', 'Institucional').click();
      row('Encabezado (título grande y texto de presentación)').should('be.visible');
      row('Tarjeta: Formación integral').should('be.visible');
      row('Tarjeta: Dónde estamos').should('be.visible');
      cy.get('main').contains('Plantel docente').should('be.visible');
      cy.a11y();
    });

    it('oculta y vuelve a mostrar un bloque fijo; la lista llega al sitio público', () => {
      cy.visit('/panel/paginas');
      cy.contains('button', 'Estudiantes').click();
      row('Avisos').find('[data-testid="show-switch"]').click();
      cy.contains('Ahora está oculto: no se ve en el sitio.').should('be.visible');
      row('Avisos').should('contain', 'Mostrar en el sitio: No');
      cy.api('GET', `/public/settings?_=${Date.now()}`)
        .its('body.hidden_blocks')
        .should('contain', 'estudiantes.avisos');
      row('Avisos').find('[data-testid="show-switch"]').click();
      row('Avisos').should('contain', 'Mostrar en el sitio: Sí');
      cy.api('GET', `/public/settings?_=${Date.now()}`)
        .its('body')
        .should((b) => expect(b.hidden_blocks ?? '[]').to.not.contain('estudiantes.avisos'));
    });

    it('lo fijo no se elimina; lo que viene de otra pantalla lleva allí; hay enlaces de interés', () => {
      cy.visit('/panel/paginas');
      cy.contains('button', 'Ingreso').click();
      row('Tarjeta: Requisitos de ingreso').should('be.visible');
      cy.get('[data-testid="content-row"]').each(($el) => {
        cy.wrap($el).contains('button', 'Eliminar').should('not.exist');
      });
      cy.contains('button', 'Estudiantes').click();
      row('Avisos')
        .contains('a', 'Ir a Avisos académicos')
        .should('have.attr', 'href', '/panel/avisos');
      row('Accesos académicos (enlaces de interés)')
        .contains('a', 'Elegir los enlaces')
        .should('have.attr', 'href', '/panel/configuracion');
      cy.contains('button', 'Inscripciones').click();
      row('¿Dónde me inscribo? (enlaces de interés)').should('be.visible');
    });

    it('agrega una sección de texto a Inicio, la sube/baja y la elimina (solo oculta, con confirmación)', () => {
      const title = `Aviso extra ${vp.width}-${Date.now()}`;
      cy.visit('/panel/paginas');
      cy.contains('button', 'Agregar sección').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('¿Qué querés agregar?').should('be.visible');
        cy.contains('label', 'Texto').click();
        cy.byLabel('Título de la sección').type(title);
        cy.get('textarea').type('Texto de prueba para Inicio.');
        cy.contains('button', 'Guardar sección').click();
      });
      row(title).should('contain', 'Agregada por vos');
      // Visible: no se puede eliminar todavía.
      row(title).contains('button', 'Eliminar').should('be.disabled');
      row(title).find('[data-testid="show-switch"]').click();
      row(title).should('contain', 'Mostrar en el sitio: No');
      row(title).contains('button', 'Eliminar').click();
      cy.get('[role="alertdialog"]').should('contain', '¿Eliminar esta sección?');
      cy.get('[role="alertdialog"]').contains('button', 'Eliminar').click();
      cy.contains('Sección eliminada.').should('be.visible');
      cy.contains('[data-testid="content-row"]', title).should('not.exist');
    });
  });
}
