/**
 * La carrera (Figma 03, nodo 1:63). Datos: GET /public/content/carrera (contenido estanco, RF02).
 *
 * - La primera sección es la ficha de la carrera: título = h1, texto = título, duración e ingreso.
 * - El resto (perfil profesional, áreas formativas y, cuando el cliente las cargue desde el panel,
 *   plan por año y correlatividades) se dibuja como bloques en orden. El plan (por área formativa, con
 *   horas y correlatividades) viene de la Res. MEGC 1202/07; la ubicación por año no figura en los
 *   documentos del cliente y queda como [a confirmar] (Q120). No se inventa.
 * - Sin imágenes: las fotos del Figma son de referencia y requieren consentimiento (RNF08).
 */
import type { Metadata } from 'next';
import { Card, EmptyState, Eyebrow } from '@/components/ui';
import { loadContent } from '@/features/public/data';
import { Markdown } from '@/features/public/markdown';
import { PageHero, Section, SectionError } from '@/features/public/parts';

export const metadata: Metadata = { title: 'La carrera' };
// Debe ser un literal (Next lo analiza estáticamente); coincide con PUBLIC_REVALIDATE de data.ts.
export const revalidate = 60;

export default async function Page() {
  const content = await loadContent('carrera');
  const sections = content.ok ? [...content.data.sections].sort((a, b) => a.order - b.order) : [];
  const [intro, ...rest] = sections;

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
        ) : rest.length === 0 ? (
          <EmptyState
            title="La información de la carrera se está preparando"
            description="Muy pronto vas a encontrar acá el perfil profesional y el plan de estudios."
          />
        ) : (
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
        )}
      </Section>
    </>
  );
}
