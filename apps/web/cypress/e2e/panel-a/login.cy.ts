/**
 * E2E-02 (login correcto, incorrecto con mensaje genérico y bloqueo tras 5 intentos) + cambio obligatorio de
 * contraseña, cierre de sesión y sesión vencida. Panel parte A.
 *
 * Los fallos de login y el bloqueo (429) se simulan con cy.intercept: el límite real de la API es por IP y por
 * correo (5 intentos fallidos / 15 min) y dejaría bloqueado a todo el resto de la suite. El comportamiento
 * real del límite lo cubren las pruebas de la API (apps/api/test/api/auth.test.ts).
 */
import { unique, VIEWPORTS } from '../../support/panel-a';

const problem = (status: number, title: string, detail: string) => ({
  statusCode: status,
  headers: { 'content-type': 'application/problem+json' },
  body: { type: 'about:blank', title, status, detail },
});

for (const vp of VIEWPORTS) {
  describe(`Login del panel · ${vp.name}px`, () => {
    beforeEach(() => {
      cy.viewport(vp.width, vp.height);
      cy.clearCookies();
    });

    it('sin sesión, /panel redirige al login y la pantalla es accesible', () => {
      cy.visit('/panel');
      cy.location('pathname').should('eq', '/panel/login');
      cy.contains('h1', 'Panel de Gestión Académica').should('be.visible');
      cy.get('label').contains('Correo institucional');
      cy.get('label').contains('Contraseña');
      cy.contains('Recordar sesión en este equipo');
      cy.a11y();
    });

    it('login correcto: entra al Resumen', () => {
      cy.visit('/panel/login');
      cy.get('input[name="email"]').type('editor@ifts2.local');
      cy.get('input[name="password"]').type('Demo-2026-ifts2');
      cy.contains('button', 'Ingresar al panel').click();
      cy.location('pathname').should('eq', '/panel');
      cy.contains('h1', 'Panel de control').should('be.visible');
    });

    it('login incorrecto: mensaje genérico (no revela si el correo existe)', () => {
      cy.intercept(
        'POST',
        '/api/v1/auth/login',
        problem(401, 'No autorizado', 'Correo o contraseña incorrectos.'),
      ).as('login');
      cy.visit('/panel/login');
      cy.get('input[name="email"]').type('nadie@ifts2.local');
      cy.get('input[name="password"]').type('clave-equivocada1');
      cy.contains('button', 'Ingresar al panel').click();
      cy.get('[role="alert"]').should('contain', 'Correo o contraseña incorrectos.');
      cy.location('pathname').should('eq', '/panel/login');
      cy.a11y();
    });

    it('bloqueo tras 5 intentos fallidos: mensaje claro con el plazo', () => {
      let calls = 0;
      cy.intercept('POST', '/api/v1/auth/login', (req) => {
        calls += 1;
        req.reply(
          calls <= 5
            ? problem(401, 'No autorizado', 'Correo o contraseña incorrectos.')
            : problem(429, 'Demasiadas solicitudes', 'Demasiados intentos.'),
        );
      });
      cy.visit('/panel/login');
      cy.get('input[name="email"]').type('editor@ifts2.local');
      cy.get('input[name="password"]').type('mala-clave-123');
      for (let i = 0; i < 6; i++) cy.contains('button', 'Ingresar al panel').click();
      cy.get('[role="alert"]')
        .should('contain', 'Demasiados intentos fallidos')
        .and('contain', '15 minutos');
      cy.a11y();
    });

    it('"¿Olvidaste tu clave?" explica que la restablece un administrador', () => {
      cy.visit('/panel/login');
      cy.contains('button', '¿Olvidaste tu clave?').as('forgot').click();
      cy.get('@forgot').should('have.attr', 'aria-expanded', 'true');
      cy.contains('la restablece un administrador').should('be.visible');
    });

    it('validación del formulario: campos vacíos muestran el mensaje de la API', () => {
      cy.visit('/panel/login');
      cy.contains('button', 'Ingresar al panel').click();
      cy.get('[role="alert"]').should('exist');
      cy.location('pathname').should('eq', '/panel/login');
    });

    it('cierre de sesión desde el shell', () => {
      cy.loginAs('editor');
      cy.visit('/panel');
      cy.openPanelNav();
      cy.contains('button', 'Cerrar sesión').filter(':visible').click();
      cy.location('pathname').should('eq', '/panel/login');
      cy.visit('/panel');
      cy.location('pathname').should('eq', '/panel/login');
    });

    it('sesión vencida (401 en una pantalla) lleva al login con aviso', () => {
      cy.loginAs('editor');
      cy.visit('/panel');
      cy.contains('h1', 'Panel de control');
      // La sesión se invalida en el servidor (como al vencer): la próxima acción recibe un 401 real.
      cy.api('POST', '/auth/logout');
      cy.contains('button', 'Forzar sincronización de Instagram').click();
      cy.location('pathname').should('eq', '/panel/login');
      cy.location('search').should('contain', 'expired=1');
      cy.contains('Tu sesión venció').should('be.visible');
    });

    it('cambio obligatorio de contraseña tras un restablecimiento', () => {
      const email = `${unique('cambio').replace(/\s/g, '')}@ifts2.local`;
      let temp = '';
      cy.loginAs('admin');
      cy.api('POST', '/users', { name: 'Usuario E2E', email, role: 'EDITOR' }).then((r) => {
        temp = r.body.temporaryPassword as string;
        expect(temp).to.be.a('string');
      });
      cy.clearCookies();
      cy.visit('/panel/login');
      cy.get('input[name="email"]').type(email);
      cy.then(() => cy.get('input[name="password"]').type(temp, { log: false }));
      cy.contains('button', 'Ingresar al panel').click();
      cy.location('pathname', { timeout: 60000 }).should('eq', '/panel/login/cambiar-clave'); // margen: primera compilación en frío
      cy.contains('h1', 'Elegí una contraseña nueva');
      cy.a11y();
      // No se puede saltear: /panel vuelve a esta pantalla.
      cy.visit('/panel');
      cy.location('pathname', { timeout: 60000 }).should('eq', '/panel/login/cambiar-clave'); // margen: primera compilación en frío
      // Validaciones: no coinciden / muy corta.
      cy.then(() => cy.get('input[autocomplete="current-password"]').type(temp, { log: false }));
      cy.get('input[autocomplete="new-password"]').first().type('NuevaClave2026');
      cy.get('input[autocomplete="new-password"]').last().type('otraCosa');
      cy.contains('button', 'Guardar y entrar al panel').click();
      cy.contains('Las contraseñas no coinciden.').should('be.visible');
      cy.get('input[autocomplete="new-password"]').first().clear().type('corta1');
      cy.get('input[autocomplete="new-password"]').last().clear().type('corta1');
      cy.contains('button', 'Guardar y entrar al panel').click();
      cy.contains('al menos 10 caracteres').should('be.visible');
      // Correcto.
      cy.get('input[autocomplete="new-password"]').first().clear().type('NuevaClave2026');
      cy.get('input[autocomplete="new-password"]').last().clear().type('NuevaClave2026');
      cy.contains('button', 'Guardar y entrar al panel').click();
      cy.location('pathname').should('eq', '/panel');
      cy.contains('h1', 'Panel de control');
    });
  });
}
