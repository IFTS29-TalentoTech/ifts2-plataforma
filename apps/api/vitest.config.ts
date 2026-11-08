import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          // Evita un fallo de Vitest 5 al reconstruir errores del setup desde la caché.
          fsModuleCache: false,
          // Vitest 5 exige un groupOrder distinto cuando dos proyectos tienen distinto maxWorkers (aquí
          // fileParallelism:false deja 1 worker y unit usa los de la máquina). Sin esto `pnpm test` falla en
          // equipos con varios núcleos aunque en CI (pocos núcleos) pase.
          sequence: { groupOrder: 2 },
          include: ['test/api/**/*.test.ts'],
          globalSetup: ['test/helpers/global-setup.ts'],
          setupFiles: ['test/helpers/setup-env.ts'],
          isolate: false,
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 60000,
        },
      },
    ],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], reportsDirectory: 'coverage' },
  },
});
