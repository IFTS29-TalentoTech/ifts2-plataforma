/**
 * Ingreso (Figma 05, nodo 1:154): convocatoria, pasos y material para ASPIRANTES a la tecnicatura.
 * La inscripción de alumnos a carreras y exámenes está aparte, en /inscripciones (reunión 06/10).
 *
 * Datos: GET /public/content/ingreso (contenido estanco, RF02) y GET /public/students?audience=ASPIRANTS
 * (avisos dirigidos a aspirantes).
 *
 * Cómo se arma a partir del contenido (lo edita el cliente en el panel, así que no hay textos
 * institucionales acá):
 * - Una sección cuyo Markdown tiene una LISTA NUMERADA se dibuja como pasos (tarjetas "1 · ...").
 * - El resto de su texto (por ejemplo "Fechas sujetas a confirmación") va en "Próxima convocatoria".
 * - Las demás secciones (p. ej. "Material de consulta") se dibujan como tarjetas.
 * Del ingreso solo está documentado el requisito de secundario completo; fechas y documentación quedan
 * como [a confirmar con el cliente] (Q122).
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { NoticeCard } from '@/features/public/academic-parts';
import { loadContent, loadStudents } from '@/features/public/data';
import { MarkdownBlocks, parseMarkdown, renderInline } from '@/features/public/markdown';
import { HeroImage, PageHero, Section, SectionError } from '@/features/public/parts';
import { cn } from '@/lib/cn';
import { getSiteInfo } from '@/lib/site';

export const metadata: Metadata = { title: 'Ingreso' };
// Debe ser un literal (Next lo analiza estáticamente); coincide con PUBLIC_REVALIDATE de data.ts.
export const revalidate = 60;

export default async function Page() {
  const [site, content, students] = await Promise.all([
    getSiteInfo(),
    loadContent('ingreso'),
    loadStudents('ASPIRANTS'),
  ]);
  const sections = content.ok ? [...content.data.sections].sort((a, b) => a.order - b.order) : [];
  const parsed = sections.map((s) => {
    const blocks = parseMarkdown(s.body);
    const steps = blocks.find((b) => b.type === 'ol');
    return {
      ...s,
      steps: steps && steps.type === 'ol' ? steps.items : null,
      rest: blocks.filter((b) => b !== steps),
    };
  });
  const stepSections = parsed.filter((s) => s.steps);
  const convocatoria = stepSections.flatMap((s) => s.rest);
  const others = parsed.filter((s) => !s.steps);
  // Avisos para aspirantes: solo los dirigidos a ellos (la API incluye también los de "todos").
  const notices = students.ok ? students.data.notices : [];

  return (
    <>
      <PageHero
        eyebrow="Futuros estudiantes"
        title={`Ingresá a ${site.short}`}
        description="Inscripción, documentación requerida y pasos para aspirantes."
        aside={<HeroImage src={site.ingresoImage} />}
      />

      {!content.ok ? (
        <Section>
          <SectionError what="la información de ingreso" />
        </Section>
      ) : (
        <>
          {convocatoria.length > 0 && (
            <Section>
              <Card accentBar data-testid="convocatoria">
                <h2 className="font-display text-xl font-bold text-accent-3">
                  Próxima convocatoria
                </h2>
                <MarkdownBlocks blocks={convocatoria} className="mt-2" />
              </Card>
            </Section>
          )}

          {stepSections.map((s) => (
            <Section key={s.slug} eyebrow="Pasos para aspirantes" title={s.title} id={s.slug}>
              {/* Columnas según la cantidad de pasos: con 1 o 2 no queda espacio vacío al costado. */}
              <ol
                className={cn(
                  'grid gap-4',
                  s.steps!.length >= 3 && 'md:grid-cols-3',
                  s.steps!.length === 2 && 'md:grid-cols-2',
                )}
              >
                {s.steps!.map((step, i) => (
                  <li key={i}>
                    <Card accentBar className="h-full" data-testid="ingreso-paso">
                      <p className="font-display text-lg font-bold text-accent-3">
                        <span className="text-accent">{i + 1} · </span>
                        {renderInline(step, `s${i}`)}
                      </p>
                    </Card>
                  </li>
                ))}
              </ol>
            </Section>
          ))}

          {others.length > 0 && (
            <Section>
              {/* Con una sola sección ocupa todo el ancho; con varias, dos columnas (A13). */}
              <div className={cn('grid gap-4', others.length > 1 && 'md:grid-cols-2')}>
                {others.map((s) => (
                  <Card key={s.slug} accentBar className="flex flex-col gap-3">
                    <h2 className="font-display text-xl font-bold text-accent-3">{s.title}</h2>
                    <MarkdownBlocks blocks={s.rest} />
                  </Card>
                ))}
              </div>
            </Section>
          )}

          {parsed.length === 0 && (
            <Section>
              <Card>
                <p className="text-sm text-font-strong">
                  La información de ingreso se está preparando. Consultanos desde la sección de
                  contacto.
                </p>
              </Card>
            </Section>
          )}
        </>
      )}

      {notices.length > 0 && (
        <Section eyebrow="Cartelera" title="Avisos para aspirantes" id="avisos">
          <ul className="grid gap-4 md:grid-cols-2">
            {notices.map((n) => (
              <li key={n.id}>
                <NoticeCard n={n} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section>
        <div className="flex flex-col items-start justify-between gap-4 rounded-lg bg-primary-strong p-6 text-surface sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-xl font-bold">¿Tenés dudas sobre el ingreso?</h2>
            <p className="mt-1 text-sm">Escribinos y te respondemos a la brevedad.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/institucional#contacto">Ir a contacto</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
