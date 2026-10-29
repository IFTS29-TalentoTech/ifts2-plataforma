import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Router } from 'express';

/**
 * AUTODESCUBRIMIENTO DE MÓDULOS
 * Cada carpeta `src/modules/<nombre>/` con un `index.ts` que exporta `{ mountPath, router }` se monta
 * sola bajo `/api/v1<mountPath>`. Agregar un módulo NO requiere editar ningún archivo compartido.
 * Las carpetas que empiezan con `_` se ignoran. Ver apps/api/README.md (plantilla).
 */
export interface ApiModule {
  /** Ruta relativa a /api/v1, p. ej. '/notices'. */
  mountPath: string;
  router: Router;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = path.join(here, 'modules');

export async function loadModules(): Promise<Array<ApiModule & { name: string }>> {
  const names = readdirSync(MODULES_DIR)
    .filter((n) => !n.startsWith('_') && statSync(path.join(MODULES_DIR, n)).isDirectory())
    .sort();
  const loaded: Array<ApiModule & { name: string }> = [];
  for (const name of names) {
    const file = ['index.ts', 'index.js', 'index.mjs']
      .map((f) => path.join(MODULES_DIR, name, f))
      .find((f) => existsSync(f));
    if (!file) continue;
    const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Partial<ApiModule>;
    if (!mod.mountPath || !mod.router) {
      throw new Error(`El módulo "${name}" debe exportar { mountPath, router } desde su index.`);
    }
    loaded.push({ name, mountPath: mod.mountPath, router: mod.router });
  }
  return loaded;
}
