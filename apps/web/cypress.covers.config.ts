import { defineConfig } from 'cypress';

/** A06: suite sin tareas de base de datos ni cambios en las capturas de otros escenarios. */
export default defineConfig({
  screenshotsFolder: '.next/covers-screenshots',
  video: false,
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? 'http://localhost:3200',
    specPattern: 'cypress/covers/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    setupNodeEvents(on) {
      on('task', {
        log(message: string) {
          console.log(message);
          return null;
        },
      });
    },
  },
});
