/**
 * Detalle de una publicación (GET /public/publications/:id[?archived=true]).
 *
 * - 404 de la API (no existe, no está vigente, o es una publicación pausada/vencida) -> `notFound()`,
 *   que muestra `not-found.tsx` de esta carpeta con un mensaje amable y el camino de vuelta.
 * - Cualquier otra falla (API caída) muestra un error claro SIN romper el resto del sitio (RNF03).
 * - El cuerpo es Markdown acotado y se renderiza escapando HTML (`features/public/markdown.tsx`).
 * - La imagen de portada usa `next/image` con dimensiones explícitas; es la imagen principal de la
 *   página, así que se carga con prioridad (LCP).
 */
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui';
import { loadPublication } from '@/features/public/data';
import { Markdown } from '@/features/public/markdown';
import { Container, Cover, SectionError } from '@/features/public/parts';
import { formatDateAR, formatDateTimeAR } from '@/lib/dates';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const res = await loadPublication(id, sp.archived === 'true');
  return { title: res.ok ? res.data.title : 'Publicación' };
}

export default async function Page({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const archived = sp.archived === 'true';
  const res = await loadPublication(id, archived);
  if (!res.ok && (res.status === 404 || res.status === 400)) notFound();

  const back = (
    <Link
      href={archived ? '/novedades?archived=true' : '/novedades'}
      className="mb-6 inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-accent focus-visible:outline-none focus-visible:shadow-focus"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a novedades
    </Link>
  );

  if (!res.ok) {
    return (
      <Container className="max-w-3xl py-10">
        {back}
        <h1 className="sr-only">Publicación</h1>
        <SectionError what="la publicación" />
      </Container>
    );
  }

  const p = res.data;
  const when =
    p.eventStart &&
    (p.eventEnd && p.eventEnd !== p.eventStart
      ? `${formatDateTimeAR(p.eventStart)} a ${formatDateTimeAR(p.eventEnd)}`
      : formatDateTimeAR(p.eventStart));

  return (
    <Container className="max-w-3xl py-10">
      {back}
      <article>
        <header>
          <div className="flex flex-wrap items-center gap-2">
            {p.category && <Badge>{p.category.name}</Badge>}
            {archived && <Badge tone="warning">Archivo</Badge>}
            <time dateTime={p.date} className="text-sm text-font-strong">
              {formatDateAR(p.date)}
            </time>
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold text-accent-3 sm:text-4xl">
            {p.title}
          </h1>
          {p.summary && <p className="mt-3 text-lg text-font-strong">{p.summary}</p>}
          {(when || p.location) && (
            <ul className="mt-4 flex flex-col gap-2 text-sm text-accent-3">
              {when && (
                <li className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-accent" aria-hidden="true" /> {when}
                </li>
              )}
              {p.location && (
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-accent" aria-hidden="true" /> {p.location}
                </li>
              )}
            </ul>
          )}
        </header>

        {p.coverUrl && (
          <Cover
            src={p.coverUrl}
            alt={`Imagen de la publicación: ${p.title}`}
            width={1200}
            height={675}
            priority
            sizes="(min-width: 768px) 768px, 100vw"
            className="mt-6 rounded-lg"
          />
        )}

        {p.body && <Markdown source={p.body} className="mt-6 text-[1rem] leading-7" />}

        {p.permalink && (
          <p className="mt-8 text-sm">
            <a
              href={p.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent underline"
            >
              Ver la publicación original
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </p>
        )}
      </article>
    </Container>
  );
}
