/**
 * Revalidación bajo demanda del sitio público: tras una mutación exitosa del panel la API avisa a
 * la web (POST /api/revalidate con el secreto). Nunca por lecturas, errores, login ni mensajes de contacto,
 * y nunca debe romper la respuesta si la web no contesta.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config';
import { createTestApp, type TestApp } from '../helpers/app';
import { loginAs, type LoggedIn } from '../helpers/auth';
import { resetDb } from '../helpers/db';

let t: TestApp;
let bedelia: LoggedIn;
const fetchMock = vi.fn<typeof fetch>();
const wait = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const notice = { title: 'Aviso de prueba', body: 'Texto del aviso' };

beforeEach(async () => {
  await resetDb();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  t = await createTestApp({
    config: loadConfig({ ...process.env, REVALIDATE_SECRET: 'secreto-de-prueba' }),
    fetch: fetchMock,
  });
  bedelia = await loginAs(t.app, 'BEDELIA');
  await wait();
  fetchMock.mockClear();
});

describe('revalidación bajo demanda', () => {
  it('una mutación exitosa avisa a la web una sola vez, con el secreto', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(t.app)
        .post('/api/v1/notices')
        .set('Cookie', bedelia.cookie)
        .send({ ...notice, title: `Aviso ${i}` });
      expect(res.status).toBe(201);
    }
    await wait();
    expect(fetchMock).toHaveBeenCalledTimes(1); // las tres se agrupan
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/revalidate');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['x-revalidate-secret']).toBe(
      'secreto-de-prueba',
    );
  });

  it('no avisa por lecturas, mutaciones fallidas ni login', async () => {
    await request(t.app).get('/api/v1/notices').set('Cookie', bedelia.cookie);
    const bad = await request(t.app)
      .post('/api/v1/notices')
      .set('Cookie', bedelia.cookie)
      .send({ title: '' });
    expect(bad.status).toBe(400);
    await request(t.app)
      .post('/api/v1/auth/login')
      .send({ email: bedelia.user.email, password: bedelia.password });
    await wait();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si la web no responde, la API igual contesta bien', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(t.app)
      .post('/api/v1/notices')
      .set('Cookie', bedelia.cookie)
      .send(notice);
    expect(res.status).toBe(201);
    await wait();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('sin REVALIDATE_SECRET está desactivada', async () => {
    const plain = await createTestApp({ fetch: fetchMock });
    const c = await loginAs(plain.app, 'BEDELIA');
    await request(plain.app).post('/api/v1/notices').set('Cookie', c.cookie).send(notice);
    await wait();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
