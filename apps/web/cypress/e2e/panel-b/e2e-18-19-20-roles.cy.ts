import { DEMO_USERS } from '../../support/panel-b';

/**
 * RF11 · Roles y permisos configurables (US-36). 390 y 1440 px.
 * - E2E-18: el Superadministrador crea un rol acotado y se lo asigna a un usuario; ese usuario ve solo
 *   lo permitido y recibe 403 en el resto. Un ADMIN no ve "Roles y permisos".
 * - E2E-19: un rol con usuarios no se elimina (mensaje claro); el último Superadministrador no se puede
 *   quitar; el cambio de permisos rige sin volver a iniciar sesión.
 * - E2E-20: un ADMIN crea otro ADMIN; su selector no ofrece Superadministrador; forzarlo por la API da 403.
 *
 * Requiere la semilla demo. Los roles y usuarios que crea llevan nombres únicos por corrida.
 */
const COOKIE = 'ifts2_session';
const PASSWORD = 'Clave-E2E-roles-1';

const viewports = [
  { name: 'móvil 390', width: 390, height: 844 },
  { name: 'escritorio 1440', width: 1440, height: 900 },
];

type RoleRow = { id: string; key: string; name: string };

/** Inicia sesión por API (sin cy.session) y devuelve el valor de la cookie, para alternar identidades. */
function loginCookie(email: string, password: string) {
  cy.clearCookies();
  cy.request('POST', '/api/v1/auth/login', { email, password, remember: false });
  return cy.getCookie(COOKIE).then((c) => c!.value);
}
function useCookie(value: string) {
  cy.clearCookies();
  cy.setCookie(COOKIE, value);
}

for (const vp of viewports) {
  describe(`Roles y permisos · ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));
    const tag = `${vp.width}-${Date.now()}`;

    it('E2E-18: rol acotado creado desde la pantalla; quien lo tiene ve solo lo tildado', () => {
      const roleName = `Comunicación sin archivo ${tag}`;
      const email = `rol18.${tag}@ifts2.local`;
      cy.loginAsApi('SUPERADMIN');
      cy.visit('/panel/roles');
      cy.contains('h1', 'Roles y permisos');
      cy.a11y();
      cy.contains('button', 'Nuevo rol').click();
      cy.get('[role="dialog"]').within(() => {
        cy.byLabel('Nombre').type(roleName);
        cy.contains('label', 'Resumen: Ver').click();
        cy.contains('label', 'Publicaciones: Gestionar').click();
        cy.contains('2 de');
        cy.contains('button', 'Crear rol').click();
      });
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('sin volver a iniciar sesión');
        cy.contains('button', 'Guardar').click();
      });
      cy.contains('[data-testid="role-row"]', roleName).should('contain', '2');

      // Usuario con ese rol.
      cy.api('GET', '/roles').then((r) => {
        const role = r.body.items.find((x: RoleRow) => x.name === roleName);
        cy.api('POST', '/users', { name: 'Rol 18', email, roleId: role.id, password: PASSWORD })
          .its('status')
          .should('eq', 201);
      });

      loginCookie(email, PASSWORD);
      cy.visit('/panel/publicaciones');
      cy.contains('h1', 'Publicaciones');
      cy.visit('/panel/avisos');
      cy.contains('Tu rol no tiene acceso a esta sección');
      cy.api('GET', '/notices').its('status').should('eq', 403);
      cy.api('GET', '/users').its('status').should('eq', 403);

      // Un ADMIN no ve la pantalla ni puede usar la API de roles.
      cy.clearCookies();
      cy.loginAsApi('ADMIN');
      cy.visit('/panel/roles');
      cy.contains('Tu rol no tiene acceso a esta sección');
      cy.api('POST', '/roles', { name: `Intento ${tag}` })
        .its('status')
        .should('eq', 403);
      if (vp.width >= 1024) cy.get('aside').should('not.contain', 'Roles y permisos');
    });

    it('E2E-19: rol con usuarios no se elimina, último Superadministrador y permisos al instante', () => {
      const roleName = `Docentes invitados ${tag}`;
      const email = `rol19.${tag}@ifts2.local`;
      let roleId = '';
      let superCookie = '';
      loginCookie(DEMO_USERS.SUPERADMIN.email, DEMO_USERS.SUPERADMIN.password).then((v) => {
        superCookie = v;
      });
      cy.api('POST', '/roles', { name: roleName, permissions: ['dashboard:read'] }).then((r) => {
        expect(r.status).to.eq(201);
        roleId = r.body.id;
        cy.api('POST', '/users', { name: 'Rol 19', email, roleId, password: PASSWORD });
      });

      // Eliminar un rol con usuarios: mensaje claro y nada se borra.
      cy.visit('/panel/roles');
      cy.contains('[data-testid="role-row"]', roleName).contains('button', 'Eliminar').click();
      cy.get('[role="alertdialog"]').within(() => {
        cy.contains('Reasigná a los usuarios antes de eliminar el rol.');
        cy.contains('button', 'Entendido').click();
      });
      cy.contains('[data-testid="role-row"]', roleName).should('exist');

      // El último Superadministrador no se puede quitar (409).
      cy.api('GET', '/auth/me').then((me) => {
        cy.api('GET', '/roles').then((roles) => {
          const admin = roles.body.items.find((x: RoleRow) => x.key === 'ADMIN');
          cy.api('PATCH', `/users/${me.body.id}`, { roleId: admin.id })
            .its('status')
            .should('eq', 409);
        });
      });

      // Cambiar permisos rige sin volver a iniciar sesión: el usuario conserva SU cookie.
      let userCookie = '';
      loginCookie(email, PASSWORD).then((v) => {
        userCookie = v;
      });
      cy.api('GET', '/notices').its('status').should('eq', 403);
      cy.then(() => useCookie(superCookie));
      cy.then(() =>
        cy.api('PUT', `/roles/${roleId}/permissions`, {
          permissions: ['dashboard:read', 'notices:manage'],
        }),
      )
        .its('status')
        .should('eq', 200);
      cy.then(() => useCookie(userCookie));
      cy.api('GET', '/notices').its('status').should('eq', 200);
      cy.visit('/panel/avisos');
      cy.contains('h1', 'Avisos académicos');
    });

    it('E2E-20: un ADMIN crea otro ADMIN y no puede asignar Superadministrador', () => {
      const email = `dir20.${tag}@ifts2.local`;
      cy.loginAsApi('ADMIN');
      cy.visit('/panel/configuracion');
      cy.contains('button', 'Administrar usuarios y roles').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('Solo ves los roles cuyos permisos también tenés vos');
        cy.byLabel('Nombre y apellido').type('Otra Dirección');
        cy.byLabel('Correo electrónico').type(email);
        cy.byLabel(/^Rol$/).click();
      });
      cy.get('[role="listbox"]').should('not.contain', 'Superadministrador');
      cy.contains('[role="option"]', 'Rectoría / Dirección').click();
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Crear usuario').click();
        cy.contains('[data-testid="user-row"]', email).should('contain', 'Activo');
      });
      cy.a11y();

      cy.api('GET', '/roles').then((roles) => {
        const sa = roles.body.items.find((x: RoleRow) => x.key === 'SUPERADMIN');
        cy.api('POST', '/users', { name: 'Intento', email: `x.${email}`, roleId: sa.id })
          .its('status')
          .should('eq', 403);
      });
    });
  });
}
