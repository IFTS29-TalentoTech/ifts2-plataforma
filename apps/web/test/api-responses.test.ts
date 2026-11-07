import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';

afterEach(() => vi.unstubAllGlobals());

describe('B04: confirmaciones del cliente HTTP', () => {
  for (const [name, body, type] of [
    ['HTML', '<html>Error</html>', 'text/html'],
    ['vacío', '', 'application/json'],
    ['JSON roto', '{', 'application/json'],
    ['contrato incompatible', '{}', 'application/json'],
  ]) {
    it(`rechaza 200 ${name} al publicar`, async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(body, {
            status: 200,
            headers: { 'Content-Type': type },
          }),
        ),
      );
      await expect(
        api.post('/publications/11111111-1111-4111-8111-111111111111/publish'),
      ).rejects.toThrow();
    });
  }
  it('rechaza 204 cuando publicar exige JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(
      api.post('/publications/11111111-1111-4111-8111-111111111111/publish'),
    ).rejects.toThrow();
  });
  it('admite 204 en logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.post('/auth/logout')).resolves.toBeUndefined();
  });
});

const publication = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'NEWS',
  title: 'Prueba',
  summary: '',
  body: '',
  coverUrl: null,
  coverSrc: null,
  categoryId: null,
  category: null,
  section: 'BOTH',
  status: 'PUBLISHED',
  origin: 'MANUAL',
  socialPermalink: null,
  visibleFrom: null,
  visibleUntil: null,
  createdAt: '2026-11-07T00:00:00.000Z',
  updatedAt: '2026-11-07T00:00:00.000Z',
  visible: true,
  expired: false,
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('B04: estados y resultados inciertos', () => {
  it('admite JSON válido del contrato y rechaza otro id o estado', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(publication))
      .mockResolvedValueOnce(response({ ...publication, status: 'DRAFT' }))
      .mockResolvedValueOnce(
        response({ ...publication, id: '22222222-2222-4222-8222-222222222222' }),
      );
    vi.stubGlobal('fetch', fetch);
    const call = () => api.post(`/publications/${publication.id}/publish`);
    await expect(call()).resolves.toMatchObject({ status: 'PUBLISHED' });
    await expect(call()).rejects.toMatchObject({ outcome: 'unknown' });
    await expect(call()).rejects.toMatchObject({ outcome: 'unknown' });
  });
  it('preserva el error HTTP 500 y lo marca incierto en una mutación', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ detail: 'Error del servidor' }, 500)),
    );
    await expect(api.post(`/publications/${publication.id}/publish`)).rejects.toMatchObject({
      status: 500,
      outcome: 'unknown',
    });
  });
  it('preserva el rechazo HTTP 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })));
    await expect(api.post(`/publications/${publication.id}/publish`)).rejects.toMatchObject({
      status: 403,
      outcome: 'rejected',
    });
  });
  it('una conexión interrumpida no reintenta ni invita a duplicar la operación', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('connection reset'));
    vi.stubGlobal('fetch', fetch);
    await expect(api.post('/publications', {})).rejects.toMatchObject({
      outcome: 'unknown',
      userMessage: expect.stringContaining('Revisá el estado antes'),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('detecta pérdida al leer el cuerpo después de recibir cabeceras', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ text: () => Promise.reject(new TypeError('reset')) }),
    );
    await expect(api.post('/publications', {})).rejects.toMatchObject({ outcome: 'unknown' });
  });
  it('no envía una mutación sin contrato', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(api.post('/unknown')).rejects.toThrow('contrato');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('B04: reconciliación sin repetir el POST', () => {
  it('recupera el resultado persistido tras perder la respuesta del commit', async () => {
    const { confirmPublication } = await import('../src/lib/confirm-publication');
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('reset after commit'))
      .mockResolvedValueOnce(response(publication));
    vi.stubGlobal('fetch', fetch);
    await expect(confirmPublication(publication.id, 'publish')).resolves.toBeUndefined();
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'GET']);
    expect(fetch.mock.calls[1][1].cache).toBe('no-store');
  });
  it('no confirma si el estado persistido sigue siendo DRAFT', async () => {
    const { confirmPublication } = await import('../src/lib/confirm-publication');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({}))
        .mockResolvedValueOnce(response({ ...publication, status: 'DRAFT' })),
    );
    await expect(confirmPublication(publication.id, 'publish')).rejects.toMatchObject({
      outcome: 'unknown',
    });
  });
  it('conserva incertidumbre cuando falla también la consulta de verificación', async () => {
    const { confirmPublication } = await import('../src/lib/confirm-publication');
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    await expect(confirmPublication(publication.id, 'publish')).rejects.toMatchObject({
      outcome: 'unknown',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('programación no confirma fechas distintas a las solicitadas', async () => {
    const { confirmPublication } = await import('../src/lib/confirm-publication');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('offline'))
        .mockResolvedValueOnce(
          response({ ...publication, status: 'SCHEDULED', visibleFrom: '2026-12-01T03:00:00Z' }),
        ),
    );
    await expect(
      confirmPublication(publication.id, 'schedule', { visibleFrom: '2026-12-02' }),
    ).rejects.toMatchObject({ outcome: 'unknown' });
  });
});

describe('B04: contratos compartidos por las demás mutaciones', () => {
  for (const path of [
    '/users',
    '/roles',
    '/terms',
    '/documents',
    '/schedules',
    '/exam-calls',
    '/notices',
    '/links',
    '/teachers',
    '/gallery',
    '/social/manual',
    '/public/contact',
  ]) {
    it(`${path}: rechaza un JSON 201 sin los campos de confirmación`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 201)));
      await expect(api.post(path, {})).rejects.toMatchObject({ outcome: 'unknown' });
    });
  }
  it('admite creación 201 y edición 200 de contenido', async () => {
    const value = {
      id: publication.id,
      page: 'institucional',
      slug: 'prueba',
      title: 'Prueba',
      body: '',
      visible: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(response(value, 201)).mockResolvedValueOnce(response(value)),
    );
    await expect(api.put('/content/institucional/prueba', {})).resolves.toMatchObject(value);
    await expect(api.put('/content/institucional/prueba', {})).resolves.toMatchObject(value);
  });
  it('admite DELETE 204 y rechaza un supuesto borrado con 200 vacío', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response('', { status: 200 })),
    );
    await expect(api.delete(`/publications/${publication.id}`)).resolves.toBeUndefined();
    await expect(api.delete(`/publications/${publication.id}`)).rejects.toMatchObject({
      outcome: 'unknown',
    });
  });
});

it('conserva el motivo útil de un 502 de integración junto con la incertidumbre', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response({ detail: 'Instagram no respondió.' }, 502)),
  );
  await expect(api.post('/social/sync')).rejects.toMatchObject({
    status: 502,
    userMessage: expect.stringContaining('Instagram no respondió.'),
  });
});

it('confirma las fechas con el mismo inicio/fin de día de Buenos Aires que usa la API', async () => {
  const { confirmPublication } = await import('../src/lib/confirm-publication');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockRejectedValueOnce(new TypeError('reset after commit'))
      .mockResolvedValueOnce(
        response({
          ...publication,
          status: 'SCHEDULED',
          visibleFrom: '2026-12-01T03:00:00.000Z',
          visibleUntil: '2026-12-04T02:59:59.999Z',
        }),
      ),
  );
  await expect(
    confirmPublication(publication.id, 'schedule', {
      visibleFrom: '2026-12-01',
      visibleUntil: '2026-12-03',
    }),
  ).resolves.toBeUndefined();
});
