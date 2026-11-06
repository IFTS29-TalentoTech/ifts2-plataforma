import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')));
const cwd = path.resolve(import.meta.dirname, '../..');

describe('diagnóstico de seguridad desde Vitest', () => {
  it.each([
    { value: '', message: 'Falta TEST_DATABASE_URL' },
    { value: 'incorrecta', message: 'TEST_DATABASE_URL no es una URL PostgreSQL válida' },
    {
      value: 'postgresql://ifts2:clave-no-publicar@localhost:5433/ifts2',
      message: 'TEST_DATABASE_URL debe apuntar a la base local descartable',
    },
  ])(
    'rechaza la configuración inválida con un diagnóstico claro: $message',
    ({ value, message }) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = spawnSync(process.execPath, [cli, 'run', '--project', 'integration'], {
          cwd,
          env: { ...process.env, TEST_DATABASE_URL: value, NO_COLOR: '1' },
          encoding: 'utf8',
          timeout: 10000,
        });
        const output = result.stdout + result.stderr;
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(output).toContain(message);
        expect(output).not.toContain('code.charCodeAt');
        expect(output).not.toContain('clave-no-publicar');
      }
    },
    25000,
  );
});
