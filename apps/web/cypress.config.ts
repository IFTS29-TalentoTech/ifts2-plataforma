import { defineConfig } from 'cypress';
import { registerPanelATasks } from './cypress/support/panel-a-tasks';

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    video: false,
    screenshotsFolder: 'cypress/screenshots',
    viewportWidth: 1440,
    viewportHeight: 900,
    setupNodeEvents(on) {
      registerPanelATasks(on); // tareas de las pruebas del panel (parte A)
      on('task', {
        log(message: string) {
          console.log(message);
          return null;
        },
      });
    },
  },
});
