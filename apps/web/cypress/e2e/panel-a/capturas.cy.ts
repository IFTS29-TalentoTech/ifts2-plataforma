/**
 * Capturas del panel (parte A) para el Manual de Usuario: se generan desde la aplicación real con los datos de
 * demostración, en 1440 px y 390 px, y se copian a docs/capturas/panel/<nombre>-<ancho>.png.
 * Ejecutar con la web y la API levantadas y la base con SEED_MODE=demo:
 *   pnpm --filter @ifts2/web exec cypress run --spec cypress/e2e/panel-a/capturas.cy.ts
 * No es una prueba de comportamiento: solo recorre las pantallas y los diálogos importantes.
 */
import {
  cleanupE2eData,
  cleanupE2eSocial,
  seedNotice,
  seedPendingPost,
  VIEWPORTS,
} from '../../support/panel-a';

/** Espera a que la lista cargó (pantalla hidratada) antes de interactuar. */
const ready = () => cy.get('main h3, main li, main [role="status"]').should('exist');

for (const vp of VIEWPORTS) {
  describe(`Capturas del panel · ${vp.name}px`, () => {
    before(() => {
      cy.loginAs('editor');
      cleanupE2eSocial();
      cy.loginAs('bedelia');
      cleanupE2eData();
    });
    beforeEach(() => cy.viewport(vp.width, vp.height));

    it('login', () => {
      cy.clearCookies();
      cy.visit('/panel/login');
      cy.contains('h1', 'Panel de Gestión Académica');
      cy.captura('01-login');
      cy.contains('button', '¿Olvidaste tu clave?').click();
      cy.captura('02-login-olvido-de-clave');
      cy.intercept('POST', '/api/v1/auth/login', {
        statusCode: 401,
        headers: { 'content-type': 'application/problem+json' },
        body: { title: 'No autorizado', status: 401, detail: 'Correo o contraseña incorrectos.' },
      });
      cy.get('input[name="email"]').type('usuario@ejemplo.com');
      cy.get('input[name="password"]').type('clave-incorrecta');
      cy.contains('button', 'Ingresar al panel').click();
      cy.contains('Correo o contraseña incorrectos.');
      cy.captura('03-login-error');
    });

    it('comunicación (Editor): resumen y publicaciones', () => {
      cy.loginAs('editor');
      seedPendingPost('Jornada gastronómica en sede Lugano');
      seedPendingPost('Feliz Día del Trabajador Gastronómico');
      cy.visit('/panel');
      cy.contains('h1', 'Panel de control');
      cy.contains('Moderar').should('exist');
      cy.captura('10-resumen');
      cy.contains('li', 'Jornada').contains('button', 'Moderar').click();
      cy.get('[role="dialog"]').contains('Moderar contenido de red social');
      cy.captura('11-resumen-moderar-publicacion');
      cy.get('body').type('{esc}');

      cy.visit('/panel/publicaciones');
      ready();
      cy.contains('h3', 'Jornada').should('exist');
      cy.captura('12-publicaciones-pendientes');
      cy.contains('li', 'Jornada').contains('button', 'Moderar').click();
      cy.get('[role="dialog"]').contains('Moderar contenido de red social');
      cy.captura('13-publicaciones-moderar-y-aprobar');
      cy.contains('button', 'Aprobar y publicar en la web').click();
      cy.contains('Confirmá que existe consentimiento');
      cy.captura('14-publicaciones-consentimiento-obligatorio');
      cy.contains('label', 'Confirmo que existe consentimiento').click();
      cy.contains('button', 'Aprobar y publicar en la web').click();
      cy.get('[role="alertdialog"]').contains('¿Publicar en el sitio?');
      cy.captura('15-publicaciones-confirmar-publicacion');
      cy.get('body').type('{esc}');
      cy.contains('button', 'Descartar publicación').click();
      cy.get('[role="alertdialog"]').contains('¿Descartar esta publicación?');
      cy.captura('16-publicaciones-confirmar-descarte');
      cy.get('body').type('{esc}');
      cy.get('body').type('{esc}');

      cy.contains('button', 'Cargar publicación manualmente').click();
      cy.get('[role="dialog"]').contains('Cargar publicación manualmente');
      cy.captura('17-publicaciones-carga-manual');
      cy.get('body').type('{esc}');

      cy.contains('[role="tab"]', 'Propias del sitio').click();
      cy.contains('button', 'Nueva publicación').should('exist');
      cy.get('main h3').should('exist');
      cy.captura('18-publicaciones-propias');
      cy.contains('button', 'Nueva publicación').click();
      cy.get('[role="dialog"]').contains('Nueva publicación');
      cy.captura('19-publicaciones-formulario-propia');
    });

    it('bedelía: resumen, avisos y mensajes', () => {
      cy.loginAs('bedelia');
      seedNotice({ title: 'Reunión informativa de ingreso 2027', urgent: true });
      cy.visit('/panel');
      cy.contains('h1', 'Panel de control');
      cy.contains('Cartelera institucional activa');
      cy.get('main h3, main li').should('exist');
      cy.captura('20-resumen-bedelia');
      cy.contains('button', 'Crear nuevo aviso formal').click();
      cy.get('[role="dialog"]').contains('Publicar nuevo aviso académico');
      cy.captura('21-resumen-crear-aviso');
      cy.get('body').type('{esc}');

      cy.visit('/panel/avisos');
      ready();
      cy.contains('h3', 'Reunión informativa de ingreso 2027').should('exist');
      cy.captura('22-avisos');
      cy.contains('button', 'Nuevo aviso').click();
      cy.get('[role="dialog"]').contains('Publicar nuevo aviso académico');
      cy.contains('button', 'Publicar aviso').click();
      cy.contains('El título es obligatorio.');
      cy.captura('23-avisos-formulario-validacion');
      cy.contains('label', 'Título del comunicado')
        .parent()
        .find('input')
        .type('Inscripción al turno extraordinario');
      cy.contains('label', 'Contenido del aviso')
        .parent()
        .find('textarea')
        .type('Abierta la inscripción a través de SIU Guaraní.');
      cy.get('#aviso-adjunto').selectFile('cypress/fixtures/adjunto-demo.pdf');
      cy.captura('24-avisos-formulario-con-adjunto');
      cy.contains('button', 'Publicar aviso').click();
      cy.get('[role="alertdialog"]').contains('¿Publicar el aviso?');
      cy.captura('25-avisos-confirmar-publicacion');
      cy.get('body').type('{esc}');
      cy.get('body').type('{esc}');
      cy.contains('li', 'Reunión informativa de ingreso 2027').contains('button', 'Pausar').click();
      cy.get('[role="alertdialog"]').contains('¿Pausar el aviso?');
      cy.captura('26-avisos-confirmar-pausa');
      cy.get('[role="alertdialog"]').contains('button', 'Sí, pausar').click();
      cy.contains('li', 'Reunión informativa de ingreso 2027').contains('Pausado');
      cy.contains('li', 'Reunión informativa de ingreso 2027')
        .contains('button', 'Eliminar')
        .click();
      cy.get('[role="alertdialog"]').contains('¿Eliminar el aviso?');
      cy.captura('27-avisos-confirmar-eliminar');
      cy.get('body').type('{esc}');

      cy.task('panelA:createContactMessage', 'Consulta sobre el ingreso 2027');
      cy.visit('/panel/mensajes');
      cy.contains('h3', 'Consulta sobre el ingreso 2027').should('exist');
      cy.captura('28-mensajes');
    });

    it('menú del panel y pantalla sin permiso', () => {
      cy.loginAs('bedelia');
      cy.visit('/panel/publicaciones');
      cy.contains('Tu rol no tiene acceso a esta sección');
      if (vp.width < 1024) {
        cy.openPanelNav();
        cy.contains('Gestión del sitio');
        cy.captura('29-menu-administrativo-movil');
      } else {
        cy.captura('29-sin-permiso');
      }
    });

    after(() => {
      cy.loginAs('editor');
      cleanupE2eSocial();
      cy.loginAs('bedelia');
      cleanupE2eData();
    });
  });
}
