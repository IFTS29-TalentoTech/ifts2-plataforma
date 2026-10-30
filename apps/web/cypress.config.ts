import { defineConfig } from 'cypress';
import { registerPanelATasks } from './cypress/support/panel-a-tasks';

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
      // Las capturas de 1440 px salen recortadas si la ventana es más chica que la pantalla:
      // se fuerza el tamaño en Chrome (público) y en Electron (panel).
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          launchOptions.args.push('--window-size=1500,1100');
        }
        if (browser.name === 'electron') {
          launchOptions.preferences.width = 1440;
          launchOptions.preferences.height = 900;
        }
        return launchOptions;
      });

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
