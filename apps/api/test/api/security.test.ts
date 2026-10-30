/**
 * Seguridad básica (RNF06), a nivel de toda la API:
 *  - sin sesión, TODA ruta del panel responde 401 (se recorren los routers montados, así una ruta
 *    nueva sin protección rompe esta prueba);
 *  - las cabeceras de seguridad (helmet) están y no se anuncia el framework;
 *  - GET /health no filtra secretos ni configuración sensible.
 */
import type { Router } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadModules } from '../../src/routes';
import { createTestApp, type TestApp } from '../helpers/app';

let t: TestApp;
const UUID = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  t = await createTestApp();
});

/** Rutas deliberadamente públicas o con otra autenticación (firma, secreto de la tarea programada). */
const PUBLIC_PREFIXES = ['/public', '/files', '/health'];
// /social/cron se autentica con CRON_SECRET (403 si falta o no coincide; sin secreto configurado está deshabilitada).
const PUBLIC_EXACT = new Set(['POST /auth/login', 'POST /auth/logout', 'POST /social/cron']);

interface Found {
  method: string;
  path: string;
}

/** Aplana las rutas de un router (Express 5: `router.stack[i].route`). */
function routesOf(router: Router, prefix: string): Found[] {
  const out: Found[] = [];
  for (const layer of (router as unknown as { stack: Array<Record<string, unknown>> }).stack) {
    const route = layer.route as
      { path: string; methods: Record<string, boolean>; stack: unknown[] } | undefined;
    if (!route) continue;
    for (const m of Object.keys(route.methods)) {
      out.push({
        method: m.toUpperCase(),
        path: `${prefix === '/' ? '' : prefix}${route.path === '/' ? '' : route.path}` || '/',
      });
    }
  }
  return out;
}

describe('sin sesión, todo el panel responde 401', () => {
  it('recorre cada ruta de cada módulo montado', async () => {
    const modules = await loadModules();
    const all = modules.flatMap((m) => routesOf(m.router, m.mountPath));
    expect(all.length).toBeGreaterThan(80); // sanity: se encontraron las rutas

    const offenders: string[] = [];
    let checked = 0;
    for (const r of all) {
      const concrete = r.path.replace(/:[A-Za-z]+/g, UUID);
      const isPublic =
        PUBLIC_PREFIXES.some((p) => concrete === p || concrete.startsWith(`${p}/`)) ||
        PUBLIC_EXACT.has(`${r.method} ${concrete}`);
      if (isPublic) continue;
      const agent = request(t.app);
      const call = (url: string) => agent[r.method.toLowerCase() as 'get'](url);
      const res = await call(`/api/v1${concrete}`).send(r.method === 'GET' ? undefined : {});
      checked += 1;
      if (res.status !== 401) offenders.push(`${r.method} ${concrete} -> ${res.status}`);
    }
    expect(checked).toBeGreaterThan(60);
    expect(offenders).toEqual([]);
  });
});

describe('cabeceras y /health', () => {
  it('helmet: sin x-powered-by, nosniff y política de contenido', async () => {
    const res = await request(t.app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['strict-transport-security']).toBeTruthy();
    expect(res.headers['x-frame-options'] ?? res.headers['content-security-policy']).toBeTruthy();
  });

  it('GET /health no filtra secretos (solo estado y proveedor activo)', async () => {
    const res = await request(t.app).get('/health');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['api', 'db', 'demoMode', 'integrations', 'status', 'time'].sort(),
    );
    expect(Object.keys(res.body.integrations).sort()).toEqual(['instagram', 'mailer', 'storage']);
    const text = JSON.stringify(res.body);
    for (const secret of [
      process.env.APP_ENCRYPTION_KEY,
      process.env.STORAGE_SIGNING_SECRET,
      process.env.DATABASE_URL,
      process.env.CRON_SECRET,
    ]) {
      if (secret) expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/password|secret|token|postgres(ql)?:\/\//i);
  });

  it('una ruta inexistente devuelve Problem Details sin rastros internos', async () => {
    const res = await request(t.app).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|at .*\(.*:\d+:\d+\)/);
  });
});
