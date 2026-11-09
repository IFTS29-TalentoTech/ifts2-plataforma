import '../../support/panel-b';

/**
 * Integraciones (ADR-020): el secreto nunca reaparece; guía visible; estados; desconectar.
 * E2E-13 y axe (teclado, foco en diálogos y accesibilidad) de las tres pantallas, en 390 y 1440 px.
 */
const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];
const SECRET = 'SECRETO-PRUEBA-12345';

for (const vp of viewports) {
  describe(`Integraciones y accesibilidad · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('Instagram: guía, redirectUri, guardar credenciales sin exponer el secreto y desconectar', () => {
      cy.loginAsApi('ADMIN');
      cy.api('POST', '/integrations/instagram/disconnect');
      const bodies: string[] = [];
      cy.intercept('**/integrations/instagram*', (req) => {
        req.continue((res) => {
          bodies.push(JSON.stringify(res.body));
        });
      }).as('ig');
      cy.visit('/panel/configuracion');
      cy.contains('[role="tab"]', 'Integraciones').click();
      cy.get('[data-testid="ig-status"]').should('contain', 'Sin configurar');
      cy.get('[data-testid="redirect-uri"]').should('contain', '/integrations/instagram/callback');
      cy.contains('Permisos requeridos').should('contain', 'instagram_business_basic');
      // Con "Inicio de sesión de Meta" la ayuda es la de App ID / App Secret (6 pasos).
      cy.get('[data-testid="ig-guide"]').should('have.attr', 'data-method', 'oauth');
      cy.get('[data-testid="ig-guide"] summary')
        .should('contain', 'App ID y el App Secret')
        .click();
      cy.get('[data-testid="ig-guide"] ol li').should('have.length', 6);

      cy.byLabel('App ID').type('1234567890');
      cy.byLabel('App Secret').type(SECRET);
      cy.byLabel('Hashtag de selección').clear().type('#ifts2');
      cy.contains('button', 'Guardar credenciales').click();
      cy.get('[data-testid="ig-status"]').should('contain', 'falta conectar');
      // El secreto no queda en pantalla (ni como texto ni dentro de un campo) ni viajó de vuelta por la red.
      cy.contains(SECRET).should('not.exist');
      cy.get('input').each(($i) => expect($i.val()).not.to.contain(SECRET));
      cy.get('button[aria-label="Reemplazar App Secret"]').should('be.visible');
      cy.wrap(bodies).should((all) => {
        expect(all.length).to.be.greaterThan(0);
        all.forEach((b) => expect(b).not.to.contain(SECRET));
      });
      cy.a11y();

      cy.contains('button', 'Probar conexión').click();
      cy.get('[data-testid="ig-probe"]').should('be.visible');
      cy.contains('button', 'Desconectar').click();
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('¿Desconectar Instagram?').should('be.visible');
        cy.contains('button', 'Desconectar').click();
      });
      cy.get('[data-testid="ig-status"]').should('contain', 'Sin configurar');
    });

    it('Instagram con token: se elige el método, no pide App ID ni Secret y queda conectada', () => {
      const TOKEN = 'IGAA-token-de-prueba-largo-123456';
      cy.loginAsApi('ADMIN');
      cy.api('POST', '/integrations/instagram/disconnect');
      cy.visit('/panel/configuracion');
      cy.contains('[role="tab"]', 'Integraciones').click();
      cy.get('[data-testid="ig-method"]').within(() => {
        cy.get('#ig-method-oauth').should('be.checked');
        cy.contains('label', 'Token de acceso').click();
      });
      // La ayuda cambia con la opción: ahora es la del token (5 pasos, enlace oficial), no la de OAuth.
      cy.get('[data-testid="ig-guide"]').should('have.attr', 'data-method', 'token');
      cy.get('[data-testid="ig-guide"] summary').should('contain', 'token de acceso').click();
      cy.get('[data-testid="ig-guide"] ol li').should('have.length', 5);
      cy.get('[data-testid="ig-guide"]').should('not.contain', 'redirección');
      cy.get('[data-testid="ig-guide"] a[href*="developers.facebook.com"]').should('exist');
      // Con el método token desaparece el formulario de App ID / Secret.
      cy.get('form[aria-label="Credenciales de Instagram"]').should('not.exist');
      cy.get('form[aria-label="Token de acceso de Instagram"]').within(() => {
        cy.byLabel('Token de acceso').type(TOKEN);
        cy.byLabel('Hashtag de selección').clear().type('#ifts2');
      });
      cy.contains('button', 'Guardar y conectar').click();
      cy.get('[data-testid="ig-status"]').should('contain', 'Conectada');
      // El token no queda en pantalla.
      cy.contains(TOKEN).should('not.exist');
      cy.get('input').each(($i) => expect($i.val()).not.to.contain(TOKEN));
      cy.a11y();
      cy.contains('button', 'Desconectar').click();
      cy.get('[role="alertdialog"]').within(() => cy.contains('button', 'Desconectar').click());
      cy.get('[data-testid="ig-status"]').should('contain', 'Sin configurar');
    });

    it('Correo: destinatario, estado y correo de prueba en modo demostración', () => {
      cy.loginAsApi('ADMIN');
      cy.visit('/panel/configuracion');
      cy.contains('[role="tab"]', 'Integraciones').click();
      cy.get('[data-testid="mail-status"]').should('be.visible');
      cy.contains('button', 'Enviar correo de prueba').click();
      cy.get('[data-testid="mail-probe"]').should('be.visible');
      cy.contains('Almacenamiento de archivos').should('be.visible');
    });

    it('Configuración: cambios globales piden confirmación y datos inválidos se marcan', () => {
      cy.loginAsApi('ADMIN');
      cy.visit('/panel/configuracion');
      cy.contains('button', 'Guardar cambios').should('be.disabled');
      cy.byLabel('Correo de bedelía').clear().type('no-es-un-correo');
      cy.contains('button', 'Guardar cambios').click();
      cy.contains('formato válido').should('be.visible');
      cy.byLabel('Correo de bedelía').clear().type('bedelia@ifts2.local');
      cy.contains('button', 'Guardar cambios').click();
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('Confirmar cambios globales').should('be.visible');
        cy.contains('button', 'Cancelar').click();
      });
    });

    it('E2E-13/axe: pantallas sin violaciones serias y diálogos con foco atrapado y devuelto', () => {
      cy.loginAsApi('ADMIN');
      for (const route of ['/panel/horarios', '/panel/archivo', '/panel/configuracion']) {
        cy.visit(route);
        cy.get('main h1').should('be.visible');
        cy.get('[role="status"][aria-busy="true"]').should('not.exist');
        cy.a11y();
      }
      cy.visit('/panel/archivo');
      // Cypress (Electron) no dispara el clic nativo de Enter sobre un botón: se enfoca y se hace clic; lo que se verifica con teclado real (cy.press) es el foco dentro del diálogo.
      cy.wait(1000);
      cy.contains('button', 'Archivar nuevo documento').focus().click();
      cy.get('[role="dialog"]').should('be.visible');
      for (let i = 0; i < 12; i++) {
        cy.press(Cypress.Keyboard.Keys.TAB);
        cy.focused().closest('[role="dialog"]').should('exist');
      }
      cy.a11y();
      cy.get('body').type('{esc}');
      cy.get('[role="dialog"]').should('not.exist');
      cy.focused().should('contain', 'Archivar nuevo documento');

      cy.visit('/panel/configuracion');
      // Espera a que React hidrate: el teclado se simula sobre el botón ya interactivo.
      cy.wait(1000);
      cy.contains('button', 'Gestionar usuarios').focus().click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.get('[data-testid="user-row"]').should('have.length.at.least', 1);
      cy.a11y();
      cy.get('body').type('{esc}');
      cy.focused().should('contain', 'Gestionar usuarios');

      cy.visit('/panel/horarios');
      // Espera a que React hidrate: el teclado se simula sobre el botón ya interactivo.
      cy.wait(1000);
      cy.contains('button', 'Configurar nuevo llamado').focus().click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.a11y();
    });
  });
}
