/**
 * Defensa en capas (ADR-18 ampliada, 06-testing "Seguridad"): recorre TODAS las rutas de la API y
 * falla si alguna fuera de `/public` y `/auth` no declara un permiso con `requirePermission` /
 * `requireAnyPermission` (a nivel del router del módulo o de la ruta).
 *
 * Si agregás una ruta pública a propósito, sumala a PUBLIC_BY_DESIGN con el motivo.
 */
import type { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { PERMISSION_GUARDS } from '../../src/middleware/auth';
import { loadModules } from '../../src/routes';

/** Módulos que no son del panel: sitio público, inicio de sesión, estado y archivos firmados. */
const PUBLIC_MODULES = new Set(['/public', '/auth', '/health', '/files']);

/** Rutas sueltas sin permiso, cada una con su justificación. */
const PUBLIC_BY_DESIGN = new Map<string, string>([
  ['POST /public/contact', 'formulario de contacto del sitio público (módulo contact)'],
  ['POST /social/cron', 'tarea programada externa: se autentica con CRON_SECRET, no con sesión'],
  [
    'GET /settings',
    'solo exige sesión: datos básicos del sitio que usa cualquier pantalla del panel',
  ],
]);

interface Layer {
  handle: unknown;
  route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
}

const join = (a: string, b: string) => (a === '/' ? b : b === '/' ? a : `${a}${b}`);

describe('toda ruta del panel declara un permiso', async () => {
  const modules = await loadModules();

  it('ninguna ruta queda sin permiso', () => {
    const unguarded: string[] = [];
    let checked = 0;
    for (const m of modules) {
      if (PUBLIC_MODULES.has(m.mountPath)) continue;
      let guardedFromHere = false; // un router.use(requirePermission(...)) protege lo que sigue
      for (const layer of (m.router as Router & { stack: Layer[] }).stack) {
        if (!layer.route) {
          if (PERMISSION_GUARDS.has(layer.handle as never)) guardedFromHere = true;
          continue;
        }
        const guarded =
          guardedFromHere ||
          layer.route.stack.some((l) => PERMISSION_GUARDS.has(l.handle as never));
        for (const method of Object.keys(layer.route.methods)) {
          const id = `${method.toUpperCase()} ${join(m.mountPath, layer.route.path)}`;
          checked++;
          if (!guarded && !PUBLIC_BY_DESIGN.has(id)) unguarded.push(id);
        }
      }
    }
    expect(unguarded, 'Rutas sin requirePermission').toEqual([]);
    // Sanidad: si la introspección dejara de encontrar rutas, la prueba no debe pasar en falso.
    expect(checked).toBeGreaterThan(60);
  });

  it('las excepciones declaradas siguen existiendo (no quedan entradas viejas)', () => {
    const all = new Set<string>();
    for (const m of modules) {
      for (const layer of (m.router as Router & { stack: Layer[] }).stack) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) {
          all.add(`${method.toUpperCase()} ${join(m.mountPath, layer.route.path)}`);
        }
      }
    }
    for (const id of PUBLIC_BY_DESIGN.keys()) expect(all, id).toContain(id);
  });
});
