import path from 'node:path';
import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';

// Un solo .env en la raíz del monorepo. `forceReload`: Next ya cargó los .env de apps/web (no hay) antes de
// leer este archivo y, sin forzar, la segunda llamada devuelve lo cacheado y el .env raíz nunca se aplica
// (el proxy iba a localhost:4000 aunque API_ORIGIN estuviera en el .env).
loadEnvConfig(
  path.resolve(__dirname, '../..'),
  process.env.NODE_ENV !== 'production',
  undefined,
  true,
);

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true }, // el lint corre en la raíz (pnpm lint)
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  transpilePackages: ['@ifts2/shared'],
  poweredByHeader: false,
  // El navegador habla con `/api/v1/*` en el mismo origen que la web: la cookie de sesión es de primer
  // nivel y no hace falta CORS. Next reenvía a la API.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default config;
