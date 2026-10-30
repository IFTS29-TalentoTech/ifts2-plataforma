/**
 * E2E-03 (moderar y aprobar -> aparece en el sitio público), E2E-04 (descartar y restaurar), E2E-05 (falla de
 * Instagram: mensaje y carga manual) y E2E-13 (teclado/foco en diálogos) en Resumen y Publicaciones.
 * Cada prueba crea sus propios datos (publicaciones de redes de carga manual con título único) para poder
 * repetirse sin reiniciar la base. La falla de Instagram se fuerza interceptando /dashboard y /social/sync.
 */
import { inDays, seedPendingPost, unique, VIEWPORTS } from '../../support/panel-a';

for (const vp of VIEWPORTS) {
  describe(`Publicaciones · ${vp.name}px`, () => {
    beforeEach(() => {
      cy.viewport(vp.width, vp.height);
      cy.loginAs('editor');
    });

    it('E2E-03: el Editor modera, aprueba con sección y vigencia y la ve en el sitio', () => {
      const title = unique('Jornada aprobada');
      seedPendingPost(title);
      cy.visit('/panel/publicaciones');
      cy.contains('h3', title).should('be.visible');
      cy.a11y();
      cy.contains('li', title).contains('button', 'Moderar').click();
      cy.get('[role="dialog"]').should('contain', 'Moderar contenido de red social');
      cy.a11y();
      // Sin consentimiento no se puede aprobar.
      cy.contains('button', 'Aprobar y publicar en la web').click();
      cy.contains('Confirmá que existe consentimiento').should('be.visible');
      cy.get('[role="alertdialog"]').should('not.exist');
      cy.contains('label', 'Confirmo que existe consentimiento').click();
      cy.get('input[type="date"]').last().type(inDays(30));
      cy.contains('button', 'Aprobar y publicar en la web').click();
      cy.get('[role="alertdialog"]').should('contain', '¿Publicar en el sitio?');
      cy.get('[role="alertdialog"]').contains('button', 'Sí, publicar').click();
      cy.contains('Publicación aprobada').should('be.visible');
      cy.contains('h3', title).should('not.exist'); // ya no está en Pendientes
      // Aparece en el sitio público (la API aplica la vigencia al consultar).
      cy.api('GET', `/public/publications?pageSize=50&_=${Date.now()}`).then((r) => {
        const titles = (r.body.items as Array<{ title: string }>).map((i) => i.title);
        expect(titles).to.include(title);
      });
      // Y en "Aprobadas".
      cy.contains('[role="tab"]', 'Aprobadas').click();
      cy.contains('h3', title).should('be.visible');
    });

    it('E2E-04: descartar y recuperar desde Descartadas', () => {
      const title = unique('Saludo descartado');
      seedPendingPost(title);
      cy.visit('/panel/publicaciones');
      cy.contains('li', title).contains('button', 'Moderar').click();
      cy.contains('button', 'Descartar publicación').click();
      cy.get('[role="alertdialog"]').should('contain', '¿Descartar esta publicación?');
      cy.get('[role="alertdialog"]').contains('button', 'Sí, descartar').click();
      cy.contains('Publicación descartada').should('be.visible');
      cy.contains('h3', title).should('not.exist');
      cy.contains('[role="tab"]', 'Descartadas').click();
      cy.contains('li', title).contains('button', 'Ver detalle').click();
      cy.contains('button', 'Restaurar').click();
      cy.get('[role="alertdialog"]').contains('button', 'Sí, restaurar').click();
      cy.contains('Publicación restaurada').should('be.visible');
      cy.contains('[role="tab"]', 'Pendientes').click();
      cy.contains('h3', title).should('be.visible');
    });

    it('E2E-05: si Instagram falla se informa el motivo y la carga manual funciona', () => {
      cy.intercept('GET', '/api/v1/dashboard', (req) => {
        req.continue((res) => {
          res.body.instagram = {
            ...res.body.instagram,
            mode: 'real',
            status: 'error',
            ok: false,
            error: 'El acceso a Instagram venció. Volvé a conectar la cuenta.',
          };
        });
      });
      cy.intercept('POST', '/api/v1/social/sync', {
        statusCode: 502,
        headers: { 'content-type': 'application/problem+json' },
        body: {
          title: 'Bad Gateway',
          status: 502,
          detail: 'Instagram no respondió. Probá de nuevo más tarde o cargá la publicación manualmente.',
        },
      });
      cy.visit('/panel');
      cy.contains('Instagram API:').should('contain', 'Error');
      cy.get('[role="alert"]').should('contain', 'El acceso a Instagram venció');
      cy.contains('button', 'Forzar sincronización de Instagram').click();
      cy.contains('No se pudo sincronizar').should('be.visible');
      cy.contains('Instagram no respondió').should('be.visible');
      // El resto del panel sigue andando: carga manual.
      const title = unique('Carga manual');
      cy.get('[role="alert"]').contains('button', 'Cargar publicación manualmente').click();
      cy.get('[role="dialog"]').should('contain', 'Cargar publicación manualmente');
      cy.contains('button', 'Cargar publicación').click();
      cy.contains('El enlace a la publicación').should('exist'); // validación de campos vacíos
      cy.get('input[type="url"]').first().type(`https://www.instagram.com/p/manual-${Date.now()}/`);
      cy.get('textarea').type(`${title}. Texto cargado a mano. #ifts2web`);
      cy.get('input[type="url"]').last().type('https://example.invalid/manual.jpg');
      cy.contains('button', 'Cargar publicación').click();
      cy.contains('Publicación cargada').should('be.visible');
      cy.visit('/panel/publicaciones');
      cy.contains('h3', title).should('be.visible');
    });

    it('E2E-13: el diálogo de moderación atrapa el foco, cierra con Escape y devuelve el foco', () => {
      seedPendingPost(unique('Foco'));
      cy.visit('/panel/publicaciones');
      cy.contains('button', 'Moderar').first().as('opener').click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.focused().closest('[role="dialog"]').should('exist');
      cy.get('body').type('{esc}');
      cy.get('[role="dialog"]').should('not.exist');
      cy.get('@opener').should('have.focus');
    });

    it('publicaciones propias: crear borrador, publicar, pausar, reactivar y eliminar con confirmación', () => {
      const title = unique('Propia');
      cy.visit('/panel/publicaciones');
      cy.contains('[role="tab"]', 'Propias del sitio').click();
      cy.contains('button', 'Nueva publicación').click();
      cy.contains('button', 'Crear borrador').click();
      cy.contains('El título es obligatorio').should('be.visible');
      cy.contains('label', 'Título').parent().find('input').type(title);
      cy.contains('label', 'Resumen').parent().find('textarea').type('Resumen de prueba.');
      cy.contains('button', 'Crear borrador').click();
      cy.contains('Publicación creada como borrador').should('be.visible');
      cy.a11y();
      cy.contains('li', title).contains('Borrador');
      cy.contains('li', title).contains('button', 'Publicar').click();
      cy.get('[role="alertdialog"]').contains('button', 'Sí, publicar').click();
      cy.contains('li', title).contains('En línea');
      // Vigente: no se ofrece Eliminar (y la API devolvería 409).
      cy.contains('li', title).contains('button', 'Eliminar').should('not.exist');
      cy.contains('li', title).contains('button', 'Pausar').click();
      cy.get('[role="alertdialog"]').contains('button', 'Sí, pausar').click();
      cy.contains('li', title).contains('Pausada');
      cy.contains('li', title).contains('button', 'Reactivar').click();
      cy.contains('[role="dialog"] button', 'Reactivar').click();
      cy.contains('li', title).contains('En línea');
      cy.contains('li', title).contains('button', 'Pausar').click();
      cy.get('[role="alertdialog"]').contains('button', 'Sí, pausar').click();
      cy.contains('li', title).contains('button', 'Eliminar').click();
      cy.get('[role="alertdialog"]').should('contain', '¿Eliminar la publicación?');
      cy.get('[role="alertdialog"]').contains('button', 'Sí, eliminar').click();
      cy.contains('Publicación eliminada').should('be.visible');
      cy.contains('li', title).should('not.exist');
    });
  });
}
