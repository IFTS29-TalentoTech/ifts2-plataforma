import { describe, expect, it } from 'vitest';
import { mutationContract } from '../src/lib/mutation-contracts';

/**
 * Los contratos de respuesta del panel deben coincidir con lo que devuelve la API. Si una ruta nueva
 * responde con otra forma, la interfaz dice "No pudimos confirmar el resultado" aunque haya guardado.
 * Acá se prueban las rutas de Páginas del sitio y Galerías (ADR-041/042) con respuestas de ejemplo.
 */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = '2026-11-08T12:00:00.000Z';
const ok = (method: string, path: string, status: number, body?: unknown) => {
  const c = mutationContract(method, path);
  expect(c, `${method} ${path} sin contrato`).toBeDefined();
  expect([c!.status, ...(c!.alsoStatuses ?? [])]).toContain(status);
  if (c!.schema && body !== undefined) {
    expect(c!.schema.safeParse(body).success, `${method} ${path}`).toBe(true);
  }
};

const item = {
  id: uuid(2),
  galleryId: uuid(1),
  order: 0,
  title: 't',
  caption: '',
  alt: '',
  category: '',
  image: '/img/a.webp',
  src: '/img/a.webp',
  createdAt: now,
  updatedAt: now,
};
const gallery = {
  id: uuid(1),
  name: 'Vida en la cocina',
  order: 0,
  items: [item],
  pages: ['estudiantes'],
  createdAt: now,
  updatedAt: now,
};

describe('contratos de mutación: galerías con nombre', () => {
  it('alta, renombrar y reordenar devuelven la galería completa', () => {
    ok('POST', '/gallery', 201, gallery);
    ok('PATCH', `/gallery/${uuid(1)}`, 200, gallery);
    ok('PUT', `/gallery/${uuid(1)}/order`, 200, gallery);
  });
  it('las fotos devuelven la foto (alta 201, edición y cambio de imagen 200)', () => {
    ok('POST', `/gallery/${uuid(1)}/items`, 201, item);
    ok('PATCH', `/gallery/items/${uuid(2)}`, 200, item);
    ok('POST', `/gallery/items/${uuid(2)}/image`, 200, item);
  });
  it('eliminar una galería o una foto no devuelve cuerpo', () => {
    ok('DELETE', `/gallery/${uuid(1)}`, 204);
    ok('DELETE', `/gallery/items/${uuid(2)}`, 204);
  });
});

describe('contratos de mutación: enlaces de interés', () => {
  it('reordenar devuelve la lista; alta y edición devuelven el enlace', () => {
    const link = { id: uuid(4), title: 't', url: 'https://x.test', visible: true };
    ok('PUT', '/links/order', 200, { items: [link], total: 1 });
    ok('POST', '/links', 201, link);
    ok('PATCH', `/links/${uuid(4)}`, 200, link);
  });
});

describe('contratos de mutación: Páginas del sitio', () => {
  it('el interruptor de un bloque fijo devuelve la lista de ocultos', () => {
    ok('PUT', '/content/blocks/inicio.avisos', 200, { hidden: ['inicio.avisos'] });
  });
  it('reordenar las secciones no devuelve cuerpo', () => {
    ok('PUT', '/content/institucional/order', 204);
  });
  it('alta (201), edición y mostrar/ocultar devuelven la sección', () => {
    const section = {
      id: uuid(3),
      page: 'ingreso',
      slug: 'a',
      title: 'A',
      body: '',
      visible: true,
      createdAt: now,
      updatedAt: now,
    };
    ok('POST', '/content/ingreso', 201, section);
    ok('PUT', '/content/ingreso/a', 200, section);
    ok('PATCH', '/content/ingreso/a', 200, section);
    ok('DELETE', '/content/ingreso/a', 204);
  });
  it('subir y quitar una imagen del sitio devuelven los ajustes', () => {
    ok('POST', '/settings/image/logo_url', 200, { institution_name: 'x' });
    ok('DELETE', '/settings/image/logo_url', 200);
  });
});
