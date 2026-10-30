import path from 'node:path';
import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';

// Un solo .env en la raíz del monorepo.
// `forceReload`: Next ya cargó el entorno de apps/web (sin archivos) y sin esta bandera devuelve esa
// caché y NUNCA lee el .env de la raíz, así que API_ORIGIN y compañía quedaban en sus valores por defecto.
loadEnvConfig(
  path.resolve(__dirname, '../..'),
  process.env.NODE_ENV !== 'production',
  console,
  true,
);

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

// Las portadas de las publicaciones las sirve la API (almacenamiento propio): next/image solo
// optimiza imágenes de orígenes declarados acá (RNF05). Ver features/public/parts.tsx (Cover).
const apiUrl = new URL(apiOrigin);

const config: NextConfig = {
  // Salida de compilación alternativa: la usa la web "degradada" de la prueba de punta a punta (se compila
  // con la API caída para que sus páginas muestren el estado de error; ver scripts/e2e.mjs).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: apiUrl.hostname,
        port: apiUrl.port,
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true }, // el lint corre en la raíz (pnpm lint)
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  transpilePackages: ['@ifts2/shared'],
  poweredByHeader: false,
  // El navegador habla con `/api/v1/*` en el mismo origen que la web: la cookie de sesión es de primer
  // nivel y no hace falta CORS. Next reenvía a la API.
  // Cabeceras de seguridad de la web (RNF06). La CSP es deliberadamente acotada (sin script-src): Next inyecta
  // scripts en línea y una CSP estricta pediría nonces por pedido, que impedirían cachear las páginas (RNF09).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      // /novedades con filtros o paginación se atiende con la variante renderizada por pedido
      // (/novedades/lista); /novedades a secas es una página estática con ISR (RNF09).
      beforeFiles: ['year', 'category', 'archived', 'page'].map((key) => ({
        source: '/novedades',
        has: [{ type: 'query' as const, key }],
        destination: '/novedades/lista',
      })),
      afterFiles: [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }],
      fallback: [],
    };
  },
};

export default config;
