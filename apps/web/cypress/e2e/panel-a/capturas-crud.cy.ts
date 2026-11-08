/**
 * CRUD demostrable para la cátedra (Etapa 3, punto 4): recorre Crear, Leer, Actualizar y Eliminar (o
 * desactivar) de avisos, publicaciones propias, documentos y usuarios CON LA INTERFAZ REAL, y deja una
 * captura por paso en docs/capturas/panel/crud-*-1440.png. Además es una prueba: falla si alguna operación
 * no funciona. Todo lo que crea lo elimina al final (la eliminación es parte de lo que se demuestra).
 * Se ejecuta a 1440 px:
 *   pnpm --filter @ifts2/web exec cypress run --spec cypress/e2e/panel-a/capturas-crud.cy.ts
 */
import { inDays, unique } from '../../support/panel-a';

/** Campo de formulario (input, textarea o botón de select) por el texto de su etiqueta. */
const field = (label: string | RegExp) =>
  cy
    .contains('label', label)
    .invoke('attr', 'for')
    .then((id) => cy.get(`[id="${id}"]`));

describe('CRUD con la interfaz real · 1440px', () => {
  beforeEach(() => cy.viewport(1440, 900));

  it('Avisos: crear, leer, actualizar y eliminar (con confirmación)', () => {
    const title = unique('Aviso CRUD');
    cy.loginAs('bedelia');
    cy.visit('/panel/avisos');
    cy.get('main h3').should('exist');

    // C · Crear
    cy.contains('button', 'Nuevo aviso').click();
    cy.contains('label', 'Título del comunicado').parent().find('input').type(title);
    cy.contains('label', 'Contenido del aviso')
      .parent()
      .find('textarea')
      .type('Se abre la inscripción al turno extraordinario. Consultá en Bedelía.');
    cy.contains('label', 'Visible hasta').parent().find('input').type(inDays(15));
    cy.captura('crud-avisos-1-crear');
    cy.contains('button', 'Publicar aviso').click();
    cy.get('[role="alertdialog"]').contains('button', 'Sí, publicar').click();
    cy.contains('Aviso publicado').should('be.visible');

    // R · Leer (la lista del panel y el sitio público)
    cy.contains('li', title).should('be.visible').scrollIntoView();
    cy.captura('crud-avisos-2-leer');
    cy.api('GET', `/public/students?_=${Date.now()}`)
      .its('body.notices')
      .should('satisfy', (n: Array<{ title: string }>) => n.some((x) => x.title === title));

    // U · Actualizar
    cy.contains('li', title).contains('button', 'Editar').click();
    const renamed = `${title} (actualizado)`;
    cy.contains('label', 'Título del comunicado').parent().find('input').clear().type(renamed);
    cy.captura('crud-avisos-3-actualizar');
    cy.contains('button', 'Guardar cambios').click();
    cy.get('[role="alertdialog"]').contains('button', 'Sí, guardar').click();
    cy.contains('Cambios guardados').should('be.visible');
    cy.contains('li', renamed).should('be.visible');

    // D · Eliminar: un aviso vigente no ofrece "Eliminar"; se pausa y recién ahí se puede.
    cy.contains('li', renamed).contains('button', 'Eliminar').should('not.exist');
    cy.contains('li', renamed).contains('button', 'Pausar').click();
    cy.get('[role="alertdialog"]').contains('button', 'Sí, pausar').click();
    cy.contains('li', renamed).contains('Pausado');
    cy.contains('li', renamed).contains('button', 'Eliminar').click();
    cy.get('[role="alertdialog"]').should('contain', '¿Eliminar el aviso?');
    cy.captura('crud-avisos-4-eliminar-confirmar');
    cy.get('[role="alertdialog"]').contains('button', 'Sí, eliminar').click();
    cy.contains('Aviso eliminado').should('be.visible');
    cy.contains('li', renamed).should('not.exist');
  });

  it('Publicaciones propias: crear, leer, actualizar y eliminar (con confirmación)', () => {
    const title = unique('Publicación CRUD');
    cy.loginAs('editor');
    cy.visit('/panel/publicaciones');
    cy.contains('[role="tab"]', 'Propias del sitio').click();

    // C · Crear (primero se ve la validación de campos obligatorios)
    cy.contains('button', 'Nueva publicación').click();
    cy.contains('button', 'Crear borrador').click();
    cy.contains('El título es obligatorio').should('be.visible');
    cy.contains('label', 'Título').parent().find('input').type(title);
    cy.contains('label', 'Resumen')
      .parent()
      .find('textarea')
      .type('Resumen de la jornada para el sitio.');
    cy.captura('crud-pub-1-crear');
    cy.contains('button', 'Crear borrador').click();
    cy.contains('Publicación creada como borrador').should('be.visible');

    // R · Leer
    cy.contains('li', title).contains('Borrador');
    cy.captura('crud-pub-2-leer');

    // U · Actualizar
    cy.contains('li', title).contains('button', 'Editar').click();
    const renamed = `${title} (actualizada)`;
    cy.contains('label', 'Título').parent().find('input').clear().type(renamed);
    cy.captura('crud-pub-3-actualizar');
    cy.contains('button', 'Guardar cambios').click();
    cy.contains('Cambios guardados').should('be.visible');
    cy.contains('li', renamed).should('be.visible');

    // D · Eliminar (un borrador no está vigente)
    cy.contains('li', renamed).contains('button', 'Eliminar').click();
    cy.get('[role="alertdialog"]').should('contain', '¿Eliminar la publicación?');
    cy.captura('crud-pub-4-eliminar-confirmar');
    cy.get('[role="alertdialog"]').contains('button', 'Sí, eliminar').click();
    cy.contains('Publicación eliminada').should('be.visible');
    cy.contains('li', renamed).should('not.exist');
  });

  it('Documentos: crear, leer, actualizar (restaurar) y eliminar definitivamente (con confirmación)', () => {
    const title = unique('Documento CRUD');
    cy.loginAs('bedelia');
    cy.visit('/panel/archivo');
    cy.contains('h1', 'Archivo y documentación histórica').should('be.visible');

    // C · Crear (se sube un PDF y se archiva ahora)
    cy.contains('button', 'Archivar nuevo documento').click();
    cy.get('[role="dialog"]').within(() => {
      cy.get('[data-testid="file-input"]').selectFile('cypress/fixtures/adjunto-demo.pdf', {
        force: true,
      });
      field('Título').type(title);
      field('Ciclo lectivo (año)').type('2025');
    });
    cy.captura('crud-doc-1-crear');
    cy.contains('[role="dialog"] button', 'Guardar documento').click();

    // R · Leer (búsqueda y detalle). Se espera a que cierre el diálogo y termine de recargar la lista:
    // si no, el campo de búsqueda se vuelve a montar mientras Cypress escribe (error "detached").
    cy.get('[role="dialog"]').should('not.exist');
    cy.get('[role="status"][aria-busy="true"]').should('not.exist');
    field('Buscar').type(title);
    cy.get('[data-testid="doc-row"]').filter(':visible').should('have.length', 1);
    cy.captura('crud-doc-2-leer');
    cy.get('[data-testid="doc-row"]').filter(':visible').contains('button', 'Ver detalle').click();
    cy.contains('Dónde se usa').should('be.visible');
    cy.captura('crud-doc-3-detalle');

    // U · Actualizar el estado: restaurar (vuelve a estar vigente) y volver a archivar por API
    cy.contains('[role="dialog"] button', 'Restaurar').click();
    cy.get('[role="alertdialog"]').should('contain', '¿Restaurar este documento?');
    cy.captura('crud-doc-4-restaurar-confirmar');
    cy.get('[role="alertdialog"]').contains('button', 'Restaurar').click();
    cy.contains('Documento restaurado.').should('be.visible');
    cy.api('GET', `/documents?status=ACTIVE&q=${encodeURIComponent(title)}`).then((r) => {
      expect(r.body.items).to.have.length(1);
      cy.api('POST', `/documents/${r.body.items[0].id}/archive`, { force: true });
    });

    // D · Eliminar definitivamente (solo archivados y sin referencias)
    cy.reload();
    cy.contains('h1', 'Archivo y documentación histórica').should('be.visible');
    cy.get('[role="status"][aria-busy="true"]').should('not.exist');
    field('Buscar').type(title);
    cy.get('[data-testid="doc-row"]').filter(':visible').contains('button', 'Ver detalle').click();
    cy.contains('[role="dialog"] button', 'Eliminar definitivamente').click();
    cy.get('[role="alertdialog"]').should('contain', '¿Eliminar definitivamente?');
    cy.captura('crud-doc-5-eliminar-confirmar');
    cy.get('[role="alertdialog"]').contains('button', 'Eliminar definitivamente').click();
    cy.get('[data-testid="doc-row"]').should('not.exist');
  });

  it('Usuarios: crear, leer, actualizar el rol y desactivar (con confirmación)', () => {
    const email = `crud.${Date.now().toString(36)}@ifts2.local`;
    cy.loginAs('admin');
    cy.visit('/panel/configuracion');
    cy.contains('button', 'Gestionar usuarios').click();

    // C · Crear: campos obligatorios y correo duplicado
    cy.get('[role="dialog"]').within(() => {
      cy.contains('button', 'Crear usuario').click();
      cy.contains('obligatorio').should('be.visible');
      field('Nombre y apellido').type('Usuaria de Demostración');
      field('Correo electrónico').type(email);
      cy.captura('crud-usr-1-crear');
      cy.contains('button', 'Crear usuario').click();
      cy.get('[data-testid="temp-password"]').should('contain', 'no se vuelve a mostrar');
      cy.contains('[data-testid="user-row"]', email).should('be.visible');
      field('Nombre y apellido').type('Otra persona');
      field('Correo electrónico').type(email);
      cy.contains('button', 'Crear usuario').click();
      cy.contains('Ya existe un usuario con ese correo').should('be.visible');
    });
    cy.captura('crud-usr-2-leer-y-duplicado');

    // U · Actualizar el rol: formulario "Cambiar rol" y confirmación (no se guarda al elegir).
    cy.contains('[data-testid="user-row"]', email).contains('button', 'Cambiar rol').click();
    cy.contains('[role="dialog"]', 'Rol actual').within(() => {
      cy.contains('label', 'Nuevo rol')
        .invoke('attr', 'for')
        .then((id) => cy.get(`[id="${id}"]`).click());
    });
    // Lista de roles con scroll: se elige con el teclado (comienzo del nombre y Enter).
    cy.get('[role="listbox"]').should('be.visible');
    cy.focused().type('Comunic');
    cy.focused().should('contain', 'Comunicación').type('{enter}');
    cy.contains('[role="dialog"]', 'Rol actual').contains('button', 'Guardar').click();
    cy.get('[role="alertdialog"]').should('contain', '¿Cambiar el rol?');
    cy.get('[role="alertdialog"]').contains('button', 'Cambiar rol').click();
    cy.contains('[data-testid="user-row"]', email).contains('Comunicación');
    cy.captura('crud-usr-3-actualizar-rol');

    // D · Desactivar (los usuarios no se borran: se conserva la auditoría)
    cy.contains('[data-testid="user-row"]', email).contains('button', 'Desactivar').click();
    cy.get('[role="alertdialog"]').should('contain', '¿Desactivar este usuario?');
    cy.captura('crud-usr-4-desactivar-confirmar');
    cy.get('[role="alertdialog"]').contains('button', 'Desactivar').click();
    cy.contains('[data-testid="user-row"]', email).contains('Desactivado');
    cy.captura('crud-usr-5-desactivado');
  });
});
