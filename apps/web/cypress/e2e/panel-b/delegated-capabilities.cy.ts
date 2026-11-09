import '../../support/panel-b';

type Capability =
  | 'users:manage'
  | 'content:manage'
  | 'links:manage'
  | 'integrations:manage'
  | 'terms:manage'
  | 'terms:setPublic'
  | 'examCalls:manage'
  | 'social:moderate';
const cases: { permissions: Capability[]; path: string; nav: string; marker: string }[] = [
  {
    permissions: ['users:manage'],
    path: '/panel/configuracion',
    nav: 'Configuración',
    marker: 'Gestionar usuarios',
  },
  {
    permissions: ['content:manage'],
    path: '/panel/paginas',
    nav: 'Páginas del sitio',
    marker: 'Agregar sección',
  },
  {
    permissions: ['links:manage'],
    path: '/panel/configuracion',
    nav: 'Configuración',
    marker: 'Nuevo enlace',
  },
  {
    permissions: ['integrations:manage'],
    path: '/panel/configuracion',
    nav: 'Configuración',
    marker: 'Guardar correo',
  },
  {
    permissions: ['terms:manage'],
    path: '/panel/horarios',
    nav: 'Horarios',
    marker: 'Nuevo ciclo',
  },
  {
    permissions: ['terms:setPublic'],
    path: '/panel/horarios',
    nav: 'Horarios',
    marker: 'Cambiar ciclo lectivo público',
  },
  {
    permissions: ['examCalls:manage'],
    path: '/panel/horarios',
    nav: 'Horarios',
    marker: 'Configurar nuevo llamado',
  },
  {
    permissions: ['social:moderate'],
    path: '/panel/publicaciones',
    nav: 'Publicaciones',
    marker: 'Cargar publicación manualmente',
  },
  {
    permissions: ['content:manage', 'links:manage'],
    path: '/panel/paginas',
    nav: 'Páginas del sitio',
    marker: 'Agregar sección',
  },
  {
    permissions: ['users:manage', 'content:manage'],
    path: '/panel/paginas',
    nav: 'Páginas del sitio',
    marker: 'Agregar sección',
  },
];

for (const testCase of cases) {
  describe(`B01: ${testCase.permissions.join(' + ')}`, () => {
    const permissions = testCase.permissions;
    let roleId: string;
    let roleName: string;
    let suffix: string;
    let publicTermId: string | undefined;
    let targetTerm: { id: string; label: string };
    beforeEach(() => {
      cy.viewport(1440, 1000);
      suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      roleName = `Delegado ${suffix}`;
      cy.loginAsApi('SUPERADMIN');
      // Las capacidades se tildan desde el panel real del Superadministrador.
      cy.visit('/panel/roles');
      cy.contains('button', 'Nuevo rol').click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Nombre').type(roleName);
        const labels: Record<Capability, string> = {
          'users:manage': 'Usuarios: Gestionar',
          'content:manage': 'Textos de páginas: Gestionar',
          'links:manage': 'Enlaces de interés: Gestionar',
          'integrations:manage': 'Integraciones: Gestionar',
          'terms:manage': 'Ciclos lectivos: Crear y editar',
          'terms:setPublic': 'Ciclos lectivos: Elegir el ciclo público',
          'examCalls:manage': 'Llamados a examen: Gestionar',
          'social:moderate': 'Redes sociales: Moderar',
        };
        for (const permission of permissions) cy.contains('label', labels[permission]).click();
        cy.contains('button', 'Crear rol').click();
      });
      cy.get('[role="alertdialog"]').contains('button', 'Guardar').click();
      cy.get('[role="dialog"]').should('not.exist');
      cy.api('GET', '/roles').then(({ body }) => {
        const role = body.items.find((item: { name: string }) => item.name === roleName);
        expect(role.permissions).to.have.members(permissions);
        roleId = role.id;
        cy.api('POST', '/users', {
          name: roleName,
          email: `delegado-${suffix}@prueba.local`,
          password: 'Prueba-12345',
          roleId,
        })
          .its('status')
          .should('eq', 201);
      });
      if (permissions.includes('terms:setPublic')) {
        cy.api('GET', '/terms?pageSize=100').then(({ body }) => {
          publicTermId = body.items.find(
            (term: { publicCurrent: boolean }) => term.publicCurrent,
          )?.id;
          const used = new Set(body.items.map((term: { year: number }) => term.year));
          let year = 2040;
          while (used.has(year)) year++;
          cy.api('POST', '/terms', { year, kind: 'FIRST' }).then(({ body: term }) => {
            targetTerm = term;
          });
        });
      }
      cy.clearCookies();
      cy.then(() =>
        cy.request('POST', '/api/v1/auth/login', {
          email: `delegado-${suffix}@prueba.local`,
          password: 'Prueba-12345',
        }),
      );
      cy.api('GET', '/auth/me').its('body.permissions').should('have.members', permissions);
    });
    afterEach(() => {
      if (publicTermId) {
        cy.loginAsApi('SUPERADMIN');
        cy.api('PUT', `/terms/${publicTermId}/public-current`).its('status').should('eq', 200);
        publicTermId = undefined;
      }
    });

    it('navega, abre la URL directa, ejecuta su capacidad y conserva las restricciones', () => {
      cy.visit('/panel');
      cy.location('pathname').should('eq', testCase.path);
      cy.visit(testCase.path);
      cy.get('aside').contains('a', testCase.nav).should('be.visible').click();
      cy.contains('button', testCase.marker).should('be.visible');
      cy.contains('label', 'Nombre de la institución').should('not.exist');
      cy.contains('button', 'Guardar cambios').should('not.exist');
      if (!permissions.includes('users:manage'))
        cy.contains('button', 'Gestionar usuarios').should('not.exist');
      if (!permissions.includes('terms:manage'))
        cy.contains('button', 'Nuevo ciclo').should('not.exist');
      if (permissions.includes('examCalls:manage')) {
        cy.contains('h2', 'Grillas de cursada').should('not.exist');
        cy.contains('button', 'Configurar nuevo llamado').click();
        cy.get('[role="dialog"]').within(() => {
          cy.byLabel('Denominación del turno').type(`Llamado delegado ${suffix}`);
          cy.byLabel('Apertura SIU Guaraní').type('2026-12-01');
          cy.byLabel('Cierre SIU Guaraní').type('2026-12-08');
          cy.get('input[type="file"]').should('not.exist');
          cy.contains('button', 'Crear llamado').click();
        });
        cy.contains('[data-testid="exam-call-card"]', `Llamado delegado ${suffix}`).should(
          'be.visible',
        );
        cy.api('GET', '/exam-calls?pageSize=100')
          .its('body.items')
          .should((items: { name: string }[]) => {
            expect(items.some((item) => item.name === `Llamado delegado ${suffix}`)).to.eq(true);
          });
      }
      if (permissions.includes('users:manage')) {
        // Los usuarios se gestionan en Configuración; Páginas del sitio es otra pantalla (ADR-041).
        if (testCase.path !== '/panel/configuracion') cy.visit('/panel/configuracion');
        cy.contains('button', 'Gestionar usuarios').click();
        cy.get('[role="dialog"]').within(() => {
          cy.byLabel('Nombre y apellido').type(`Cuenta ficticia ${suffix}`);
          cy.byLabel('Correo electrónico').type(`creada-${suffix}@prueba.local`);
          cy.byLabel('Rol').click();
        });
        cy.contains('[role="option"]', roleName).click();
        cy.get('[role="dialog"]').contains('button', 'Crear usuario').click();
        cy.contains('[data-testid="user-row"]', `creada-${suffix}@prueba.local`).should(
          'be.visible',
        );
        cy.api('GET', `/users?q=creada-${suffix}`)
          .its('body.items.0.email')
          .should('eq', `creada-${suffix}@prueba.local`);
      }
      if (permissions.includes('content:manage')) {
        cy.visit('/panel/paginas');
        cy.contains('button', 'Agregar sección').click();
        cy.get('[role="dialog"]').within(() => {
          cy.byLabel('Título de la sección').type(`Texto delegado ${suffix}`);
          cy.get('textarea').type('Contenido ficticio');
          cy.contains('button', 'Guardar sección').click();
        });
        cy.contains(`Texto delegado ${suffix}`).should('be.visible');
      }
      if (permissions.includes('links:manage')) {
        cy.visit('/panel/configuracion');
        cy.contains('button', 'Nuevo enlace').click();
        cy.get('[role="dialog"]').within(() => {
          cy.byLabel('Título').type(`Enlace delegado ${suffix}`);
          cy.byLabel('Dirección web').type('https://prueba.local/ficticio');
          cy.contains('button', 'Guardar enlace').click();
        });
        cy.contains(`Enlace delegado ${suffix}`).should('be.visible');
      }
      if (permissions.includes('integrations:manage')) {
        cy.byLabel('Destinatario del formulario de contacto')
          .clear()
          .type(`correo-${suffix}@prueba.local`);
        cy.contains('button', 'Guardar correo').click();
        cy.contains('Configuración de correo guardada.').should('be.visible');
        cy.api('GET', '/integrations/mail')
          .its('body.contactToEmail')
          .should('eq', `correo-${suffix}@prueba.local`);
      }
      if (permissions.includes('terms:manage')) {
        cy.api('GET', '/terms?pageSize=100').then(({ body }) => {
          const used = new Set(body.items.map((term: { year: number }) => term.year));
          let year = 2040;
          while (used.has(year)) year++;
          cy.contains('button', 'Nuevo ciclo').click();
          cy.get('[role="dialog"]').within(() => {
            cy.byLabel('Año lectivo').clear().type(String(year));
            cy.contains('button', 'Crear ciclo').click();
          });
          cy.contains(`Ciclo ${year}`).should('be.visible');
        });
      }
      if (permissions.includes('terms:setPublic')) {
        cy.contains('button', 'Cambiar ciclo lectivo público').click();
        cy.get('[role="dialog"]').find('[role="combobox"]').click();
        cy.then(() => cy.contains('[role="option"]', targetTerm.label).click());
        cy.get('[role="dialog"]').contains('button', 'Continuar').click();
        cy.get('[role="alertdialog"]').contains('button', 'Sí, cambiar ciclo').click();
        cy.then(() => cy.get('[data-testid="public-term"]').should('contain', targetTerm.label));
      }
      if (permissions.includes('social:moderate')) {
        cy.contains('[role="tab"]', 'Propias del sitio').should('not.exist');
        cy.api('POST', '/social/manual', {
          permalink: `https://www.instagram.com/p/b01-${suffix}/`,
          caption: `Moderación delegada ${suffix}`,
          mediaUrl: 'https://example.invalid/foto.jpg',
          postedAt: '2026-11-07',
        });
        cy.reload();
        cy.contains('li', `Moderación delegada ${suffix}`).contains('button', 'Moderar').click();
        cy.contains('button', 'Descartar publicación').click();
        cy.get('[role="alertdialog"]').contains('button', 'Sí, descartar').click();
        cy.contains('Publicación descartada').should('be.visible');
        cy.api('GET', '/publications').its('status').should('eq', 403);
      }
      cy.api('PUT', '/settings', { institution_name: 'No autorizado' })
        .its('status')
        .should('eq', 403);
      cy.api('POST', '/schedules', {}).its('status').should('eq', 403);
      cy.api('POST', '/publications', {}).its('status').should('eq', 403);
      if (!permissions.includes('terms:manage'))
        cy.api('POST', '/terms', {}).its('status').should('eq', 403);
      cy.reload();
      cy.api('GET', '/auth/me').its('body.permissions').should('have.members', permissions);
    });
  });
}

describe('B01: actualización de una sesión existente y capacidades recíprocas', () => {
  it('el próximo pedido recibe los permisos nuevos sin volver a iniciar sesión', () => {
    let roleId: string;
    let adminCookie: string;
    const suffix = Date.now();
    cy.request('POST', '/api/v1/auth/login', {
      email: 'admin@ifts2.local',
      password: 'Cambiame-123!',
    }).then((response) => {
      adminCookie = (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    });
    cy.api('POST', '/roles', { name: `Sesión B01 ${suffix}`, permissions: ['users:manage'] }).then(
      ({ body }) => {
        roleId = body.id;
        cy.api('POST', '/users', {
          name: 'Sesión ficticia',
          email: `sesion-${suffix}@prueba.local`,
          password: 'Prueba-12345',
          roleId,
        });
      },
    );
    cy.clearCookies();
    cy.request('POST', '/api/v1/auth/login', {
      email: `sesion-${suffix}@prueba.local`,
      password: 'Prueba-12345',
    });
    cy.visit('/panel/configuracion');
    cy.contains('button', 'Gestionar usuarios').should('be.visible');
    cy.then(() =>
      cy.request({
        method: 'PUT',
        url: `/api/v1/roles/${roleId}/permissions`,
        headers: { Cookie: adminCookie },
        body: { permissions: ['content:manage'] },
      }),
    )
      .its('status')
      .should('eq', 200);
    cy.api('GET', '/auth/me').its('body.permissions').should('deep.eq', ['content:manage']);
    cy.api('GET', '/users').its('status').should('eq', 403);
    cy.visit('/panel/paginas');
    cy.contains('button', 'Agregar sección').should('be.visible');
    cy.visit('/panel/configuracion');
    cy.contains('button', 'Gestionar usuarios').should('not.exist');
  });
  it('publications:manage no concede moderación ni eliminación', () => {
    const suffix = Date.now();
    cy.loginAsApi('SUPERADMIN');
    cy.api('POST', '/roles', {
      name: `Solo propias ${suffix}`,
      permissions: ['publications:manage'],
    }).then(({ body }) => {
      cy.api('POST', '/users', {
        name: 'Autor ficticio',
        email: `autor-${suffix}@prueba.local`,
        password: 'Prueba-12345',
        roleId: body.id,
      });
    });
    cy.clearCookies();
    cy.request('POST', '/api/v1/auth/login', {
      email: `autor-${suffix}@prueba.local`,
      password: 'Prueba-12345',
    });
    cy.visit('/panel/publicaciones');
    cy.contains('[role="tab"]', 'Propias del sitio').should('be.visible');
    cy.contains('[role="tab"]', 'De redes sociales').should('not.exist');
    cy.contains('button', /^Eliminar/).should('not.exist');
    cy.api('GET', '/social/posts').its('status').should('eq', 403);
    cy.api('POST', '/publications', { title: `Borrador propio ${suffix}`, summary: 'Ficticio' })
      .its('status')
      .should('eq', 201);
    cy.reload();
    cy.contains('li', `Borrador propio ${suffix}`)
      .contains('button', /^Eliminar/)
      .should('not.exist');
  });
});
