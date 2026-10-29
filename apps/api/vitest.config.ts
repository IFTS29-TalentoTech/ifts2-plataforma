import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/helpers/global-setup.ts'],
    setupFiles: ['test/helpers/setup-env.ts'],
    isolate: false, // más rápido: los módulos se evalúan una vez
    fileParallelism: false, // todas las pruebas comparten la base ifts2_test
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: { provider: 'v8', include: ['src/**/*.ts'], reportsDirectory: 'coverage' },
  },
});
