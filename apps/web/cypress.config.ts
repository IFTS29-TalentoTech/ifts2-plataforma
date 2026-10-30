import { defineConfig } from 'cypress';

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
      // Ventana de Electron de 1440 px: sin esto las capturas a ancho de escritorio salen recortadas a 1280.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.name === 'electron') {
          launchOptions.preferences.width = 1440;
          launchOptions.preferences.height = 900;
        }
        return launchOptions;
      });
      on('task', {
        log(message: string) {
          console.log(message);
          return null;
        },
      });
    },
  },
});
