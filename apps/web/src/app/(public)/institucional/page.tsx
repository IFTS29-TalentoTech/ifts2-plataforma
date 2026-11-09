/**
 * Institucional (Figma 02, nodo 210:1077). Datos: GET /public/content/institucional (contenido
 * estanco, RF02) + GET /public/settings (sede y contactos) + POST /public/contact (RF08).
 *
 * - La primera sección (por `order`) es la presentación: su título es el h1 y su texto va en la franja.
 * - Las demás secciones se dibujan como tarjetas, en el orden que define el panel. Nada institucional
 *   está escrito acá: si el cliente agrega o cambia una sección, se refleja sin tocar código.
 * - Contacto (sin diseño en el Figma, Q60): se resuelve en esta página, ancla `#contacto`, con los
 *   componentes del kit. Ver `features/public/contact-form.tsx`.
 * - Franja de enlaces, plantel y contacto se pueden ocultar desde "Páginas del sitio" (`showBlock`,
 *   ADR-042); el encabezado no.
 * - Plantel docente (RF10, sin diseño en el Figma): sección entre las tarjetas y Contacto. Se omite
 *   si no hay personas visibles o si la API falla (RNF03).
 */
import { ArrowRight, Building2, Mail, MapPin, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { ContactForm } from '@/features/public/contact-form';
import { GallerySections } from '@/features/public/gallery-sections';
import { loadContent, loadTeachers } from '@/features/public/data';
import { Markdown } from '@/features/public/markdown';
import { Container, PageHero, Section, SectionError } from '@/features/public/parts';
import { TeachersSection } from '@/features/public/teachers-section';
import { getSiteInfo, showBlock } from '@/lib/site';

export const metadata: Metadata = { title: 'Institucional' };
// Debe ser un literal (Next lo analiza estáticamente); coincide con PUBLIC_REVALIDATE de data.ts.
export const revalidate = 60;

export default async function Page() {
  const [site, content, teachers] = await Promise.all([
    getSiteInfo(),
    loadContent('institucional'),
    loadTeachers(),
  ]);
  const sections = content.ok ? [...content.data.sections].sort((a, b) => a.order - b.order) : [];
  const [intro, ...rest] = sections;

  return (
    <>
      <PageHero
        eyebrow={site.subtitle || undefined}
        title={intro?.title ?? 'Institucional'}
        description={intro && <Markdown source={intro.body} className="text-lg text-surface" />}
        aside={
          site.address ? (
            <div className="rounded-lg border border-surface px-6 py-4 text-sm text-surface">
              <p>Sede central</p>
              <p className="mt-1 font-display text-lg font-bold">{site.address}</p>
            </div>
          ) : undefined
        }
      />

      {showBlock(site, 'institucional.enlaces') && (
        <Container className="pt-6">
          <nav
            aria-label="Enlaces relacionados"
            className="flex flex-col gap-2 rounded-lg border border-accent-2 bg-surface px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-font-strong">
              ¿Buscás información sobre planes de estudio o inscripciones?
            </span>
            <span className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <Link
                href="/la-carrera"
                className="inline-flex items-center gap-1 rounded-sm font-semibold text-accent focus-visible:outline-none focus-visible:shadow-focus"
              >
                Ver plan de estudios de la carrera{' '}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/ingreso"
                className="inline-flex items-center gap-1 rounded-sm font-semibold text-accent-3 focus-visible:outline-none focus-visible:shadow-focus"
              >
                Requisitos de ingreso para aspirantes{' '}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </span>
          </nav>
        </Container>
      )}

      <Section>
        {!content.ok ? (
          <SectionError what="la información institucional" />
        ) : rest.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((s) => (
              <li key={s.slug}>
                <Card className="flex h-full flex-col gap-3" data-testid="institucional-section">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-2 text-accent">
                    <Building2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="font-display text-lg font-bold text-accent-3">{s.title}</h2>
                  <Markdown source={s.body} />
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <GallerySections galleries={content.ok ? (content.data.galleries ?? []) : []} />

      {showBlock(site, 'institucional.plantel') && (
        <TeachersSection teachers={teachers.ok ? teachers.data.items : []} />
      )}

      {showBlock(site, 'institucional.contacto') && (
        <Section eyebrow="Escribinos" title="Contacto" id="contacto">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card className="flex flex-col gap-4 self-start">
              <h3 className="font-display text-lg font-bold text-accent-3">Datos de la sede</h3>
              <ul className="flex flex-col gap-3 text-sm text-font-strong">
                {site.address && (
                  <li className="flex gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span>{site.address}</span>
                  </li>
                )}
                {site.phone && (
                  <li className="flex gap-3">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`} className="underline">
                      {site.phone}
                    </a>
                  </li>
                )}
                {site.emailInstitutional && (
                  <li className="flex gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <a href={`mailto:${site.emailInstitutional}`} className="break-all underline">
                      {site.emailInstitutional}
                    </a>
                  </li>
                )}
                {site.emailBedelia && (
                  <li className="flex gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span>
                      Bedelía:{' '}
                      <a href={`mailto:${site.emailBedelia}`} className="break-all underline">
                        {site.emailBedelia}
                      </a>
                    </span>
                  </li>
                )}
              </ul>
            </Card>
            <Card>
              <ContactForm />
            </Card>
          </div>
        </Section>
      )}
    </>
  );
}
