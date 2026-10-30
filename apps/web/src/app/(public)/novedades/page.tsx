/**
 * Novedades y eventos (Figma 06, nodo 1:196). Datos: GET /public/publications (RF04).
 *
 * - Solo salen publicaciones APROBADAS por una persona y vigentes (la API aplica la vigencia).
 * - Filtros por año y categoría con las opciones que devuelve la API (`availableYears`, `categories`).
 * - Paginación por enlaces (12 por página). `?archived=true` = vista de archivo: publicaciones vencidas
 *   del año elegido (RF03: lo vencido no se borra, se archiva); sin año usa el año en curso (Q47).
 * - Los parámetros de la URL se validan acá antes de pedirle nada a la API (año entero razonable,
 *   categoría con forma de UUID, página >= 1): un parámetro inválido se ignora, no rompe la página.
 * - Esta página depende de la URL, así que se renderiza por pedido; el costo para la API se acota
 *   porque cada consulta se cachea 60 s (`loadPublic`).
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/ui';
import { loadPublications } from '@/features/public/data';
import { NewsFilters } from '@/features/public/news-filters';
import {
  LinkPagination,
  PageHero,
  PublicationCard,
  Section,
  SectionError,
} from '@/features/public/parts';

export const metadata: Metadata = { title: 'Novedades' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const yearN = Number(one(sp.year));
  const year = Number.isInteger(yearN) && yearN >= 2000 && yearN <= 2100 ? yearN : undefined;
  const catRaw = one(sp.category);
  const category = catRaw && UUID.test(catRaw) ? catRaw : undefined;
  const archived = one(sp.archived) === 'true';
  const pageN = Number(one(sp.page));
  const page = Number.isInteger(pageN) && pageN >= 1 ? pageN : 1;

  const res = await loadPublications({ year, category, archived, page });
  const d = res.ok ? res.data : null;

  /** URL de la página `n` conservando los filtros. */
  const hrefFor = (n: number, over: { archived?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (year) p.set('year', String(year));
    if (category) p.set('category', category);
    if (over.archived ?? archived) p.set('archived', 'true');
    if (n > 1) p.set('page', String(n));
    const qs = p.toString();
    return `/novedades${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <PageHero
        eyebrow="Comunidad e institución"
        title="Novedades y eventos"
        description={
          archived
            ? 'Archivo: publicaciones anteriores que ya no están en la portada.'
            : 'Publicaciones seleccionadas por el equipo del instituto.'
        }
      />
      <Section>
        {!d ? (
          <SectionError what="las novedades" />
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <NewsFilters
                years={d.availableYears}
                categories={d.categories}
                year={year ?? (archived ? d.year : null)}
                category={category ?? null}
                archived={archived}
              />
              <Link
                href={hrefFor(1, { archived: !archived })}
                className="rounded-sm text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                {archived ? 'Volver a las novedades vigentes' : 'Ver el archivo de novedades'}
              </Link>
            </div>

            {d.items.length === 0 ? (
              <EmptyState
                title={archived ? 'No hay publicaciones archivadas' : 'No encontramos novedades'}
                description="Probá con otro año o categoría."
                action={
                  <Link href="/novedades" className="text-sm font-semibold text-accent underline">
                    Quitar los filtros
                  </Link>
                }
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="novedades">
                {d.items.map((p) => (
                  <li key={p.id}>
                    <PublicationCard p={p} archived={archived} />
                  </li>
                ))}
              </ul>
            )}
            <LinkPagination
              page={d.page}
              pageSize={d.pageSize}
              total={d.total}
              hrefFor={(n) => hrefFor(n)}
            />
          </>
        )}
      </Section>
    </>
  );
}
