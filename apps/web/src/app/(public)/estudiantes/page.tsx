/**
 * Estudiantes (Figma 04, nodo 1:106). Datos: GET /public/students (RF06, RF07).
 *
 * Reglas de negocio (la API ya las aplica; la página solo las muestra):
 * - RF06: solo existe el CICLO PÚBLICO vigente. El "selector" del Figma es informativo: se muestra el
 *   ciclo vigente y la nota de que los anteriores viven en el archivo (no se mezclan con lo vigente).
 * - Horarios por comisión y llamados a examen con descarga. `downloadUrl` puede ser null (falló el
 *   almacenamiento): el componente FileLink lo informa sin romper la página (RNF03).
 * - Avisos: la API los entrega con los URGENTES primero; los destacados llevan la insignia
 *   "Próximo evento" (reunión del 06/10).
 * - RF07: enlaces de interés (SIU, Aula virtual, Tutoría, Mi Argentina) en pestaña nueva con
 *   `rel="noopener noreferrer"`.
 * - "Vida en la cocina": galería de fotos del Figma como grilla estática (sin carrusel). Sale del ajuste
 *   `student_gallery` (ruta | título | descripción por línea; provisorias, ADR-035/Q63). RF09 (galería con
 *   categorías administrables) sigue siendo Could: esto es solo la presentación del Figma.
 */
import type { Metadata } from 'next';
import { Card, EmptyState } from '@/components/ui';
import { ExamCallCard, NoticeCard, ScheduleCard } from '@/features/public/academic-parts';
import { loadStudents } from '@/features/public/data';
import { LinkCard, PageHero, PhotoCard, Section, SectionError } from '@/features/public/parts';
import { getSiteInfo } from '@/lib/site';

export const metadata: Metadata = { title: 'Estudiantes' };
// Debe ser un literal (Next lo analiza estáticamente); coincide con PUBLIC_REVALIDATE de data.ts.
export const revalidate = 60;

export default async function Page() {
  const [site, res] = await Promise.all([getSiteInfo(), loadStudents()]);
  const d = res.ok ? res.data : null;

  return (
    <>
      <PageHero
        eyebrow="Cartelera académica"
        title="Información para estudiantes"
        description="Horarios, mesas de examen y accesos del ciclo lectivo vigente."
      />

      {!d ? (
        <Section>
          <SectionError what="la información para estudiantes" />
        </Section>
      ) : (
        <>
          <Section eyebrow="Cartelera" title="Avisos" id="avisos">
            {d.notices.length === 0 ? (
              <EmptyState
                title="No hay avisos vigentes"
                description="Cuando Bedelía publique un comunicado lo vas a ver acá."
              />
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {d.notices.map((n) => (
                  <li key={n.id}>
                    <NoticeCard n={n} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section eyebrow="Ciclo lectivo vigente" title="Horarios y exámenes" id="horarios">
            <p className="mb-6 flex flex-wrap items-center gap-3 text-sm text-font-strong">
              <span className="font-semibold text-accent-3">Ciclo lectivo</span>
              <span
                data-testid="ciclo-vigente"
                className="rounded-pill border border-primary bg-surface px-4 py-2 font-semibold text-accent-3"
              >
                {d.term ? d.term.label : 'Sin ciclo definido'}
              </span>
              <span>Se muestra solo el ciclo vigente.</span>
            </p>

            {!d.term ? (
              <EmptyState
                title="Todavía no se definió el ciclo vigente"
                description="En cuanto el instituto lo publique vas a ver los horarios y las mesas de examen."
              />
            ) : (
              <div className="grid gap-8 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 font-display text-lg font-bold text-accent-3">
                    Horarios de cursada
                  </h3>
                  {d.schedules.length === 0 ? (
                    <EmptyState title="Todavía no hay horarios publicados para este ciclo" />
                  ) : (
                    <ul className="flex flex-col gap-4">
                      {d.schedules.map((s) => (
                        <li key={s.id}>
                          <ScheduleCard s={s} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-3 font-display text-lg font-bold text-accent-3">
                    Mesas de examen
                  </h3>
                  {d.examCalls.length === 0 ? (
                    <EmptyState title="No hay mesas de examen publicadas por ahora" />
                  ) : (
                    <ul className="flex flex-col gap-4">
                      {d.examCalls.map((c) => (
                        <li key={c.id}>
                          <ExamCallCard c={c} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Section>

          {site.gallery.length > 0 && (
            <Section
              eyebrow="Comunidad estudiantil"
              title="Vida en la cocina"
              id="vida-en-la-cocina"
            >
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="galeria">
                {site.gallery.map((g) => (
                  <li key={g.src}>
                    <PhotoCard src={g.src} title={g.title} description={g.description} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section eyebrow="Herramientas" title="Accesos académicos" id="accesos">
            {d.links.length === 0 ? (
              <EmptyState title="Todavía no hay accesos cargados" />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {d.links.map((l) => (
                  <li key={l.id}>
                    <LinkCard href={l.url} title={l.title} description={l.description} external />
                  </li>
                ))}
              </ul>
            )}
            <Card padded={false} className="mt-8 border-0 bg-transparent shadow-none">
              <p className="text-sm text-font-strong">
                Los períodos anteriores se conservan en el archivo, no se mezclan con la información
                vigente.
              </p>
            </Card>
          </Section>
        </>
      )}
    </>
  );
}
