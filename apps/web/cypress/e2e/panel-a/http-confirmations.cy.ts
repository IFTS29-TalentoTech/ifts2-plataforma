import '../../support/panel-b';

/** B04: transporte interceptado, autorización y persistencia en la API real. */
describe('B04: confirmación veraz de publicación', () => {
  let publication: { id: string; title: string };
  let path: string;
  beforeEach(() => {
    cy.loginAsApi('EDITOR');
    cy.api('POST', '/publications', {
      title: `Contrato HTTP ${Date.now()}`,
      summary: 'Dato ficticio',
      body: 'Prueba B04',
    }).then(({ status, body }) => {
      expect(status).to.eq(201);
      publication = body;
      path = `/publications/${body.id}`;
    });
    cy.visit('/panel/publicaciones');
    cy.contains('[role="tab"]', 'Propias del sitio').click();
  });
  afterEach(() => {
    cy.api('GET', path).then(({ body }) => {
      if (body.status === 'PUBLISHED') cy.api('POST', `${path}/pause`);
    });
    cy.api('DELETE', path).its('status').should('eq', 204);
  });
  function publish() {
    cy.contains('li', publication.title)
      .contains('button', /^Publicar/)
      .click();
    cy.get('[role="alertdialog"]').contains('button', 'Sí, publicar').click();
    cy.wait('@publish');
  }
  function stored(status: string) {
    cy.api('GET', path).its('body.status').should('eq', status);
  }
  for (const [name, body, contentType] of [
    ['HTML', '<html>Error de proxy</html>', 'text/html'],
    ['vacío', '', 'application/json'],
    ['JSON roto', '{', 'application/json'],
    ['contrato incompatible', '{}', 'application/json'],
  ]) {
    it(`200 ${name}: sin éxito, sin mutación y consulta de recuperación`, () => {
      cy.then(() => {
        cy.intercept('GET', `/api/v1${path}`).as('verify');
        cy.intercept('POST', `/api/v1${path}/publish`, {
          statusCode: 200,
          body,
          headers: { 'content-type': contentType },
        }).as('publish');
        publish();
      });
      cy.wait('@verify');
      cy.contains(
        'No pudimos confirmar el resultado. El servidor puede haber guardado los cambios.',
      ).should('be.visible');
      cy.contains('Publicación en línea').should('not.exist');
      stored('DRAFT');
    });
  }
  it('respuesta válida: confirma y persiste', () => {
    cy.then(() => {
      cy.intercept('POST', `/api/v1${path}/publish`).as('publish');
      publish();
    });
    cy.contains('Publicación en línea').should('be.visible');
    stored('PUBLISHED');
  });
  it('500: no anuncia éxito ni reintenta el POST', () => {
    cy.then(() => {
      cy.intercept('POST', `/api/v1${path}/publish`, { statusCode: 500 }).as('publish');
      publish();
    });
    cy.contains('No pudimos confirmar el resultado.').should('be.visible');
    cy.contains('Publicación en línea').should('not.exist');
    cy.get('@publish.all').should('have.length', 1);
    stored('DRAFT');
  });
  it('conexión interrumpida antes de confirmar: resultado incierto', () => {
    cy.then(() => {
      cy.intercept('POST', `/api/v1${path}/publish`, { forceNetworkError: true }).as('publish');
      publish();
    });
    cy.contains('No pudimos confirmar el resultado.').should('be.visible');
    cy.contains('Publicación en línea').should('not.exist');
    stored('DRAFT');
  });
  it('cuerpo perdido después del commit: consulta confirma sin repetir la mutación', () => {
    cy.then(() => {
      cy.intercept('GET', `/api/v1${path}`).as('verify');
      cy.intercept('POST', `/api/v1${path}/publish`, (req) => {
        req.continue((res) => {
          res.send({ statusCode: 200, body: '', headers: { 'content-type': 'application/json' } });
        });
      }).as('publish');
      publish();
    });
    cy.wait('@verify');
    cy.contains('Publicación en línea').should('be.visible');
    cy.get('@publish.all').should('have.length', 1);
    stored('PUBLISHED');
  });
});
