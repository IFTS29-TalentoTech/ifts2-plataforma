/**
 * Novedades con filtros o paginación (`/novedades?year=...&page=...`): una regla de `rewrites` (next.config.ts) reescribe a esta
 * ruta, que se renderiza por pedido porque depende de la URL. La consulta a la API igual se cachea
 * 60 s (`loadPublic`). La vista es la de `features/public/news-page.tsx`.
 */
import type { Metadata } from 'next';
import { NewsPage, type NewsSearchParams } from '@/features/public/news-page';

export const metadata: Metadata = { title: 'Novedades' };

export default async function Page({ searchParams }: { searchParams: Promise<NewsSearchParams> }) {
  return <NewsPage sp={await searchParams} />;
}
