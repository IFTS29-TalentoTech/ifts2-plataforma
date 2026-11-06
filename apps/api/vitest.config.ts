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
