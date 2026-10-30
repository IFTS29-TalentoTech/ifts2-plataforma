/**
 * Pruebas de INTEGRACIÓN documentadas para la cátedra (docs/entrega/Evidencias-de-pruebas.md).
 *
 * Recorren la API real (Express + middleware + zod + permisos) contra PostgreSQL (`ifts2_test`):
 *  - INT-1: crear un aviso por la API -> existe en la base -> se ve en `/public/students`.
 *  - INT-2: eliminar un aviso con confirmación -> 204, desaparece de la base y queda en AuditLog;
 *    si el aviso está vigente, 409 y no se borra.
 *
 * "Con confirmación": la confirmación es un paso de la interfaz (ConfirmDialog); la API solo recibe
 * el DELETE una vez confirmado y aplica sus propias reglas (solo se elimina lo no vigente).
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs, type LoggedIn } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { DAY, fromNow } from '../helpers/academic-factories';

let t: TestApp;
let bedelia: LoggedIn;
beforeEach(async () => {
  await resetDb();
  t = await createTestApp();
  bedelia = await loginAs(t.app, 'BEDELIA');
});

describe('INT-1 · crear un aviso por la API impacta en la base y se ve en el sitio público', () => {
  it('POST /notices -> fila en PostgreSQL -> aparece en GET /public/students', async () => {
    // Paso 1: antes de crear, el sitio público no muestra avisos.
    const before = await request(t.app).get('/api/v1/public/students');
    expect(before.status).toBe(200);
    expect(before.body.notices).toEqual([]);

    // Paso 2: Bedelía crea un aviso vigente (visible desde ahora, vence en 10 días).
    const created = await request(t.app)
      .post('/api/v1/notices')
      .set('Cookie', bedelia.cookie)
      .send({
        title: 'Inscripción al turno extraordinario',
        body: 'Del 1 al 10 de diciembre en Bedelía.',
        audience: 'STUDENTS',
        urgent: true,
        visibleUntil: fromNow(10 * DAY).toISOString(),
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'ACTIVE', visibleNow: true, urgent: true });

    // Paso 3: la fila existe en la base con los datos enviados y el autor de la sesión.
    const row = await testPrisma.notice.findUnique({ where: { id: created.body.id } });
    expect(row).toMatchObject({
      title: 'Inscripción al turno extraordinario',
      audience: 'STUDENTS',
      status: 'ACTIVE',
      authorId: bedelia.user.id,
    });

    // Paso 4: la mutación quedó en la auditoría.
    expect(await testPrisma.auditLog.count({ where: { action: 'notice.create' } })).toBe(1);

    // Paso 5: el sitio público (sin sesión) lo recupera y lo muestra.
    const after = await request(t.app).get('/api/v1/public/students');
    expect(after.status).toBe(200);
    expect(after.body.notices.map((n: { title: string }) => n.title)).toEqual([
      'Inscripción al turno extraordinario',
    ]);
  });
});

describe('INT-2 · eliminar un aviso (acción confirmada): 204 y auditoría; 409 si está vigente', () => {
  it('un aviso pausado se elimina (204), desaparece de la base y queda auditado; uno vigente da 409', async () => {
    const mk = (title: string) =>
      request(t.app)
        .post('/api/v1/notices')
        .set('Cookie', bedelia.cookie)
        .send({ title, body: 'Texto' });
    const vigente = (await mk('Aviso vigente')).body;
    const aEliminar = (await mk('Aviso a eliminar')).body;
    expect(vigente.id).toBeTruthy();
    expect(aEliminar.id).toBeTruthy();

    // Un aviso vigente NO se puede eliminar: 409 y sigue existiendo.
    const rechazado = await request(t.app)
      .delete(`/api/v1/notices/${vigente.id}`)
      .set('Cookie', bedelia.cookie);
    expect(rechazado.status).toBe(409);
    expect(rechazado.body.detail).toMatch(/vigente/);
    expect(await testPrisma.notice.count({ where: { id: vigente.id } })).toBe(1);

    // Se pausa el otro aviso (deja de ser vigente) y recién ahí se puede eliminar.
    const pausado = await request(t.app)
      .post(`/api/v1/notices/${aEliminar.id}/pause`)
      .set('Cookie', bedelia.cookie);
    expect(pausado.status).toBe(200);

    const eliminado = await request(t.app)
      .delete(`/api/v1/notices/${aEliminar.id}`)
      .set('Cookie', bedelia.cookie);
    expect(eliminado.status).toBe(204);

    // La fila ya no está en la base y la baja quedó registrada con quién la hizo.
    expect(await testPrisma.notice.count({ where: { id: aEliminar.id } })).toBe(0);
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'notice.delete' } });
    expect(log).toMatchObject({ entityId: aEliminar.id, userId: bedelia.user.id });

    // El sitio público solo conserva el aviso vigente.
    const pub = await request(t.app).get('/api/v1/public/students');
    expect(pub.body.notices.map((n: { title: string }) => n.title)).toEqual(['Aviso vigente']);
  });
});
