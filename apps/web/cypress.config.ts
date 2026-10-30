import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    video: false,
    // URL de una web sin API para el spec de degradacion (RNF03); sin ella ese spec se omite.
    expose: { DEGRADED_URL: process.env.DEGRADED_URL ?? '' },
    screenshotsFolder: 'cypress/screenshots',
    viewportWidth: 1440,
    viewportHeight: 900,
    setupNodeEvents(on) {
      // Chrome limita la ventana a la pantalla y recorta las capturas de 1440 px: se fuerza el tamaño.
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          launchOptions.args.push('--window-size=1500,1100');
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
