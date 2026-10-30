/**
 * /novedades sin filtros: página ESTÁTICA con ISR (ver `features/public/news-page.tsx`). Las URLs con
 * parámetros las atiende `/novedades/lista` (render por pedido) vía una regla de rewrites (next.config.ts).
 */
import type { Metadata } from 'next';
import { NewsPage } from '@/features/public/news-page';

export const metadata: Metadata = { title: 'Novedades' };
// Debe ser un literal (Next lo analiza estáticamente); coincide con PUBLIC_REVALIDATE de data.ts.
export const revalidate = 60;

export default function Page() {
  return <NewsPage sp={{}} />;
}
