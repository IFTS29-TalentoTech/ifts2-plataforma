/**
 * La carrera (Figma 03, nodo 1:63). Datos: GET /public/content/carrera (contenido estanco, RF02).
 *
 * - La primera sección es la ficha de la carrera: título = h1, texto = título, duración e ingreso.
 * - El resto (perfil profesional, áreas formativas y, cuando el cliente las cargue desde el panel,
 *   plan por año y correlatividades) se dibuja como bloques en orden. El plan (por área formativa, con
 *   horas y correlatividades) viene de la Res. MEGC 1202/07; la ubicación por año no figura en los
 *   documentos del cliente y queda como [a confirmar] (Q120). No se inventa.
 * - Foto junto al perfil profesional (`career_image`, provisoria exportada del Figma, ADR-035/Q63);
 *   sin imagen configurada el perfil vuelve a ser una tarjeta más. El plan "por año" del Figma NO se
 *   dibuja: la ubicación de cada materia por año no está confirmada (Q120).
 */
import type { Metadata } from 'next';
import { Card, EmptyState, Eyebrow } from '@/components/ui';
import { loadContent } from '@/features/public/data';
import { Markdown } from '@/features/public/markdown';
import { Cover, PageHero, Section, SectionError } from '@/features/public/parts';
import { getSiteInfo } from '@/lib/site';

export const metadata: Metadata = { title: 'La carrera' };
// Debe ser un literal (Next lo analiza estáticamente); coincide con PUBLIC_REVALIDATE de data.ts.
export const revalidate = 60;

export default async function Page() {
  const [site, content] = await Promise.all([getSiteInfo(), loadContent('carrera')]);
  const sections = content.ok ? [...content.data.sections].sort((a, b) => a.order - b.order) : [];
  const [intro, ...others] = sections;
  // El perfil profesional va a dos columnas (texto + foto) cuando hay foto; si no, queda en la grilla.
  const profile = site.careerImage ? others.find((x) => x.slug === 'perfil') : undefined;
  const rest = others.filter((x) => x !== profile);

  return (
    <>
      <PageHero
        eyebrow="Nuestra propuesta formativa"
        title={intro?.title ?? 'La carrera'}
        description={intro && <Markdown source={intro.body} className="text-lg text-surface" />}
      />
      <Section>
        {!content.ok ? (
          <SectionError what="la información de la carrera" />
        ) : rest.length === 0 && !profile ? (
          <EmptyState
            title="La información de la carrera se está preparando"
            description="Muy pronto vas a encontrar acá el perfil profesional y el plan de estudios."
          />
        ) : (
          <div className="flex flex-col gap-8">
            {profile && (
              <div
                className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10"
                data-testid="carrera-perfil"
              >
                <div className="flex flex-col gap-3">
                  <Eyebrow>Perfil profesional</Eyebrow>
                  <h2 className="font-display text-2xl font-extrabold text-accent-3">
                    {profile.title}
                  </h2>
                  <Markdown source={profile.body} />
                </div>
                <div className="overflow-hidden rounded-xl shadow-popover">
                  <Cover
                    src={site.careerImage}
                    alt=""
                    width={640}
                    height={427}
                    sizes="(min-width: 1024px) 560px, 100vw"
                  />
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {rest.map((s) => (
                <Card
                  key={s.slug}
                  accentBar
                  className="flex flex-col gap-3"
                  data-testid="carrera-section"
                >
                  {s.slug === 'perfil' && <Eyebrow>Perfil profesional</Eyebrow>}
                  <h2 className="font-display text-xl font-bold text-accent-3">{s.title}</h2>
                  <Markdown source={s.body} />
                </Card>
              ))}
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
