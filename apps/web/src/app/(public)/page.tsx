/**
 * Inicio (Figma 01, nodo 1:2). Datos: GET /public/home + GET /public/settings (vía getSiteInfo).
 *
 * - Titular corto (`hero_title`, Q64) y, debajo, la frase ancla del cliente (`tagline`) como subtítulo;
 *   sin titular corto, la frase ancla hace de titular. Nada institucional está escrito en el código
 *   (ADR-22). Las dos fotos del encabezado salen de `hero_image_1/2` (provisorias, ADR-035).
 * - Accesos rápidos: tarjetas hacia secciones del propio sitio (estructura de navegación) y, debajo,
 *   los enlaces externos que cargó el cliente (SIU, Aula virtual, Mi Argentina, Tutoría: RF07).
 * - "Actualidad institucional": publicaciones de sección HOME/BOTH aprobadas por una persona (RF04).
 * - Cada bloque se puede ocultar desde "Páginas del sitio" (`showBlock`, ADR-042); el encabezado no. Las
 *   secciones de texto y las galerías que agrega el administrador van al final de la página.
 * - Si /public/home falla se muestra el héroe con los datos de ajustes y un aviso en cada bloque (RNF03).
 */
import Link from 'next/link';
import { Button, EmptyState } from '@/components/ui';
import { ExamCallCard, NoticeCard } from '@/features/public/academic-parts';
import { loadContent, loadHome } from '@/features/public/data';
import { GallerySections, TextSections } from '@/features/public/gallery-sections';
import {
  HeroPhotos,
  LinkCard,
  PageHero,
  PublicationCard,
  Section,
  SectionError,
} from '@/features/public/parts';
import { getSiteInfo, showBlock } from '@/lib/site';

// Debe ser un literal (Next lo analiza estáticamente); coincide con PUBLIC_REVALIDATE de data.ts.
export const revalidate = 60;

/** Accesos a secciones del sitio (navegación, no contenido institucional). */
const QUICK_SECTIONS = [
  {
    href: '/la-carrera',
    title: 'Plan de estudios',
    description: 'Materias, perfil del egresado y correlatividades.',
  },
  {
    href: '/estudiantes',
    title: 'Horarios y exámenes',
    description: 'Información actualizada del período vigente.',
  },
  {
    href: '/ingreso',
    title: 'Ingreso',
    description: 'Requisitos y novedades de inscripción.',
  },
  {
    href: '/institucional#contacto',
    title: 'Contacto',
    description: 'Datos de la sede y consultas institucionales.',
  },
];

export default async function Page() {
  const [site, home, content] = await Promise.all([
    getSiteInfo(),
    loadHome(),
    loadContent('inicio'),
  ]);
  const extra = content.ok ? content.data : null;
  const showQuick = showBlock(site, 'inicio.accesos');
  const showLinks = showBlock(site, 'inicio.enlaces');
  const data = home.ok ? home.data : null;
  const tagline = data?.tagline || site.tagline || '';
  // Con titular corto, la frase ancla pasa a subtítulo; sin él, es el titular (como antes).
  const title = site.heroTitle || tagline || site.name;
  const subtitle = site.heroTitle ? tagline : '';

  return (
    <>
      <PageHero
        eyebrow={site.heroEyebrow || site.subtitle || undefined}
        title={title}
        description={subtitle || undefined}
        aside={<HeroPhotos first={site.heroImage1} second={site.heroImage2} />}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/la-carrera">Conocé la carrera</Link>
            </Button>
            <Button asChild className="bg-surface text-accent-3 hover:bg-accent-2">
              <Link href="/estudiantes">Soy estudiante</Link>
            </Button>
          </>
        }
      />

      {(showQuick || showLinks) && (
        <Section eyebrow="Accesos rápidos" title="¿Qué necesitás encontrar?" id="accesos">
          {showQuick && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK_SECTIONS.map((q) => (
                <li key={q.href}>
                  <LinkCard {...q} />
                </li>
              ))}
            </ul>
          )}
          {showLinks && data && data.quickLinks.length > 0 && (
            <>
              <h3 className="mb-3 mt-8 font-display text-lg font-bold text-accent-3">
                Accesos académicos
              </h3>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.quickLinks.map((l) => (
                  <li key={l.id}>
                    <LinkCard href={l.url} title={l.title} description={l.description} external />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {showBlock(site, 'inicio.proximos') &&
        data &&
        (data.highlightedNotices.length > 0 || data.highlightedExamCalls.length > 0) && (
          <Section eyebrow="Para tener en cuenta" title="Próximos eventos" id="proximos">
            <div className="grid gap-4 md:grid-cols-2">
              {data.highlightedExamCalls.map((c) => (
                <ExamCallCard key={c.id} c={c} />
              ))}
              {data.highlightedNotices.map((n) => (
                <NoticeCard key={n.id} n={n} />
              ))}
            </div>
          </Section>
        )}

      {showBlock(site, 'inicio.actualidad') && (
        <Section
          eyebrow="Seleccionados por el instituto"
          title="Actualidad institucional"
          id="actualidad"
          action={
            <Link
              href="/novedades"
              className="rounded-sm text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
            >
              Ver todas las novedades
            </Link>
          }
        >
          {!data ? (
            <SectionError what="las novedades" />
          ) : data.publications.length === 0 ? (
            <EmptyState
              title="Todavía no hay novedades publicadas"
              description="Cuando el instituto seleccione publicaciones van a aparecer acá."
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.publications.map((p) => (
                <li key={p.id}>
                  <PublicationCard p={p} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <TextSections sections={extra?.sections ?? []} />
      <GallerySections galleries={extra?.galleries ?? []} />
    </>
  );
}
