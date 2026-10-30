/**
 * Tareas de Node para las pruebas E2E del panel (parte A). Se registran desde cypress.config.ts con una sola
 * línea (`registerPanelATasks(on)`), para no pisar la configuración de otros agentes.
 *
 *  - `panelA:moveCapture`: mueve una captura de Cypress a docs/capturas/panel/ (imágenes del Manual de Usuario).
 *  - `panelA:createContactMessage`: inserta un mensaje de contacto de prueba directo en la base, porque el
 *    envío público está limitado a 5 por hora por IP y no alcanzaría para las pruebas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';

const root = path.resolve(__dirname, '../../../..');

export function registerPanelATasks(on: Cypress.PluginEvents) {
  loadEnvConfig(root);
  on('task', {
    'panelA:moveCapture'({ from, to }: { from: string; to: string }) {
      const src = path.resolve(__dirname, '../screenshots', from);
      const dest = path.join(root, 'docs', 'capturas', 'panel', to);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      return null;
    },
    async 'panelA:createContactMessage'(subject: string) {
      // Carga diferida: el cliente de Prisma vive en la raíz del monorepo.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaClient } = require(path.join(root, 'node_modules/@prisma/client'));
      const prisma = new PrismaClient();
      try {
        const m = await prisma.contactMessage.create({
          data: {
            name: 'Persona de Prueba',
            email: 'prueba@example.com',
            subject,
            message: 'Mensaje de prueba generado por Cypress.',
            consent: true,
          },
        });
        return m.id as string;
      } finally {
        await prisma.$disconnect();
      }
    },
  });
}
