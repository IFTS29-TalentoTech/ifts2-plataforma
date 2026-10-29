import { defineConfig } from 'tsup';

// Cada modulo se compila como entrada propia para que el autodescubrimiento de
// `dist/modules/<nombre>/index.js` funcione igual que en desarrollo.
export default defineConfig({
  entry: ['src/server.ts', 'src/modules/*/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  splitting: true,
  sourcemap: true,
  clean: true,
  noExternal: ['@ifts2/shared'],
});
