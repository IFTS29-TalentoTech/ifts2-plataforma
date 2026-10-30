import { TINY_PDF } from '../../support/panel-b';

/**
 * E2E-09 (cambiar ciclo público), E2E-10 (archivo), E2E-12 (usuarios), E2E-15 (archivos no permitidos
 * o excedidos), E2E-11 en lo que toca al Panel B (permisos). 390 y 1440 px.
 */
const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];

for (const vp of viewports) {
  describe(`Panel B · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('E2E-09: el administrador cambia el ciclo público con confirmación y el sitio muestra solo el nuevo', () => {
      cy.loginAsApi('ADMIN');
      cy.api('GET', '/terms').then((r) => {
        const original = r.body.items.find((t: { publicCurrent: boolean }) => t.publicCurrent);
        const other = r.body.items.find((t: { publicCurrent: boolean }) => !t.publicCurrent);
        cy.visit('/panel/horarios');
        cy.contains('button', 'Cambiar ciclo lectivo público').click();
        cy.get('[role="dialog"]').within(() => {
          cy.byLabel('Nuevo ciclo público').click();
        });
        cy.get('[role="option"]').contains(other.label).click();
        cy.get('[role="dialog"]').contains('button', 'Continuar').click();
        cy.get('[role="alertdialog"]').within(() => {
          cy.contains('¿Cambiar el ciclo público?').should('be.visible');
          cy.contains('quedan guardados en el Archivo').should('be.visible');
          cy.contains('button', 'Sí, cambiar ciclo').click();
        });
        cy.get('[data-testid="public-term"]').should('contain', other.label);
        cy.request('/api/v1/public/students').its('body.term.label').should('eq', other.label);
        // Restaura el estado para el resto de las pruebas.
        cy.api('PUT', `/terms/${original.id}/public-current`).its('status').should('eq', 200);
        cy.request('/api/v1/public/students').its('body.term.label').should('eq', original.label);
      });
    });

    it('E2E-10: archivo: búsqueda por año, ver detalle y restaurar', () => {
      cy.loginAsApi('BEDELIA');
      cy.visit('/panel/archivo');
      cy.contains('h1', 'Archivo y documentación histórica').should('be.visible');
      cy.byLabel('Buscar').type('2024');
      cy.get(vp.width < 768 ? '[data-testid="doc-card"]' : '[data-testid="doc-row"]')
        .filter(':visible')
        .should('have.length.at.least', 1)
        .first()
        .as('first');
      cy.get('@first').contains('button', 'Ver detalle').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('Detalle del documento archivado').should('be.visible');
        cy.contains('Dónde se usa').should('be.visible');
        cy.contains('button', 'Descargar copia').should('be.visible');
        cy.contains('button', 'Restaurar').click();
      });
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Restaurar este documento?').should('be.visible');
        cy.contains('button', 'Restaurar').click();
      });
      cy.contains('Documento restaurado.').should('be.visible');
      // Pasó a vigente: ya no figura entre los archivados con ese año; se vuelve a archivar para limpiar.
      cy.api('GET', '/documents?status=ACTIVE&q=2024').then((r) => {
        expect(r.body.items.length).to.be.greaterThan(0);
        r.body.items.forEach((d: { id: string }) =>
          cy.api('POST', `/documents/${d.id}/archive`, { force: true }),
        );
      });
    });

    it('E2E-15: un archivo no permitido o demasiado grande muestra un error claro', () => {
      cy.loginAsApi('BEDELIA');
      cy.visit('/panel/archivo');
      cy.contains('button', 'Archivar nuevo documento').click();
      cy.get('[role="dialog"]').within(() => {
        cy.get('[data-testid="file-input"]').selectFile(
          {
            contents: Cypress.Buffer.from('MZ binario'),
            fileName: 'programa.exe',
            mimeType: 'application/x-msdownload',
          },
          { force: true },
        );
        cy.contains('Ese tipo de archivo no está permitido').should('be.visible');
        cy.contains('button', 'Guardar documento').click();
        cy.contains('Ese tipo de archivo no está permitido').should('be.visible');
        cy.get('[data-testid="file-input"]').selectFile(
          {
            contents: Cypress.Buffer.from(TINY_PDF.padEnd(11 * 1024 * 1024, ' ')),
            fileName: 'enorme.pdf',
            mimeType: 'application/pdf',
          },
          { force: true },
        );
        cy.contains('el máximo es 10,0 MB').should('be.visible');
      });
      cy.a11y();
    });

    it('E2E-12: el administrador crea un usuario con rol y lo desactiva; el desactivado no puede entrar', () => {
      cy.loginAsApi('ADMIN');
      const email = `prueba.${vp.width}.${Date.now()}@ifts2.local`;
      cy.visit('/panel/configuracion');
      cy.contains('button', 'Administrar usuarios y roles').click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Nombre y apellido').type('Usuaria de Prueba');
        cy.byLabel('Correo electrónico').type(email);
        cy.contains('button', 'Crear usuario').click();
        cy.get('[data-testid="temp-password"]').should('contain', 'no se vuelve a mostrar');
        cy.get('[data-testid="temp-password"] code').invoke('text').as('temp');
        // Correo duplicado: mensaje claro bajo el campo.
        cy.byLabel('Nombre y apellido').type('Otra');
        cy.byLabel('Correo electrónico').type(email);
        cy.contains('button', 'Crear usuario').click();
        cy.contains('Ya existe un usuario con ese correo').should('be.visible');
        cy.contains('[data-testid="user-row"]', email).contains('button', 'Desactivar').click();
      });
      cy.get('[role="alertdialog"]').contains('button', 'Desactivar').click();
      cy.get('[role="dialog"]').contains('[data-testid="user-row"]', email).contains('Desactivado');
      cy.get<string>('@temp').then((temp) => {
        cy.request({
          method: 'POST',
          url: '/api/v1/auth/login',
          body: { email, password: temp, remember: false },
          failOnStatusCode: false,
        })
          .its('status')
          .should('eq', 401);
      });
    });

    it('permisos: BEDELIA no ve Configuración; EDITOR no ve Horarios ni Archivo', () => {
      cy.loginAsApi('BEDELIA');
      cy.visit('/panel/configuracion');
      cy.contains('No tenés permiso').should('be.visible');
      cy.contains('Integraciones').should('not.exist');
      cy.api('GET', '/integrations/instagram').its('status').should('eq', 403);
      cy.loginAsApi('EDITOR');
      cy.visit('/panel/horarios');
      cy.contains('No tenés permiso').should('be.visible');
      cy.visit('/panel/archivo');
      cy.contains('No tenés permiso').should('be.visible');
    });
  });
}
