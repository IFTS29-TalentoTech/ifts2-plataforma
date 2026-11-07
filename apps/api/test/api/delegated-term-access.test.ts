import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app';
import { cookieFrom, loginWith } from '../helpers/auth';
import { resetDb } from '../helpers/db';
import { createRole, createTerm, createUser } from '../helpers/factories';

beforeEach(resetDb);
describe('B01: lectura de ciclos para operar una capacidad académica independiente', () => {
  for (const permission of [
    'examCalls:manage',
    'schedules:manage',
    'terms:setPublic',
    'settings:manage',
  ]) {
    it(`${permission} lee ciclos, pero no obtiene permisos de escritura adicionales`, async () => {
      const { app } = await createTestApp();
      const role = await createRole({ permissions: [permission] });
      const { user, password } = await createUser({ roleId: role.id });
      const cookie = cookieFrom(await loginWith(app, user.email, password));
      const term = await createTerm();
      expect((await request(app).get('/api/v1/terms').set('Cookie', cookie)).status).toBe(200);
      expect(
        (await request(app).get(`/api/v1/terms/${term.id}`).set('Cookie', cookie)).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .post('/api/v1/terms')
            .set('Cookie', cookie)
            .send({ year: 2032, kind: 'FIRST' })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .patch(`/api/v1/terms/${term.id}`)
            .set('Cookie', cookie)
            .send({ startsOn: '2032-01-01' })
        ).status,
      ).toBe(403);
      if (permission !== 'terms:setPublic') {
        expect(
          (await request(app).put(`/api/v1/terms/${term.id}/public-current`).set('Cookie', cookie))
            .status,
        ).toBe(403);
      }
    });
  }
  it('sin una capacidad académica ni de ajustes: 403; anónimo: 401', async () => {
    const { app } = await createTestApp();
    const role = await createRole({ permissions: ['users:manage'] });
    const { user, password } = await createUser({ roleId: role.id });
    const cookie = cookieFrom(await loginWith(app, user.email, password));
    expect((await request(app).get('/api/v1/terms').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).get('/api/v1/terms')).status).toBe(401);
  });
});

describe('B01: catálogos de selección sin permiso de administrarlos', () => {
  for (const permission of ['social:moderate', 'publications:manage', 'notices:manage']) {
    it(`${permission} puede elegir categorías sin poder crearlas`, async () => {
      const { app } = await createTestApp();
      const role = await createRole({ permissions: [permission] });
      const { user, password } = await createUser({ roleId: role.id });
      const cookie = cookieFrom(await loginWith(app, user.email, password));
      expect(
        (await request(app).get('/api/v1/categories?kind=PUBLICATION').set('Cookie', cookie))
          .status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .post('/api/v1/categories')
            .set('Cookie', cookie)
            .send({ name: 'No autorizada', kind: 'PUBLICATION' })
        ).status,
      ).toBe(403);
    });
  }
});
