/**
 * Inscripciones (alumnos): inscripción a carreras y a exámenes. Reunión del 06/10 (Q20/Q22): el
 * cliente pidió separarla de "Ingreso" (aspirantes a la tecnicatura). No tiene diseño en el Figma
 * (Q60): se arma con las tarjetas del sistema.
 *
 * Datos: GET /public/students (RF06).
 * - A08: `enrollmentOpen` de cada llamado ya llega como estado EFECTIVO desde la API (interruptor
 *   general `examEnrollmentOpen` + casilla del llamado + llamado no terminado; ver
 *   `effectiveExamEnrollmentOpen` en @ifts2/shared). Por eso la insignia general y las tarjetas no
 *   pueden contradecirse: con el interruptor apagado no hay ningún llamado "abierto".
 * - A07: el trámite se hace en el sistema de gestión académica. Se enlazan SOLO los enlaces marcados
 *   en el panel como "Enlace de inscripción de alumnos" (`enrollment`). Nunca se deduce por el título
 *   ("SIU Guaraní" también existe para profesores y secretaría) ni se cae a "todos los enlaces".
 *   Si no hay ninguno publicado, se avisa que está pendiente y se ofrece el contacto de Bedelía.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { ExamCallCard } from '@/features/public/academic-parts';
import { loadStudents } from '@/features/public/data';
import { LinkCard, PageHero, Section, SectionError } from '@/features/public/parts';
import { getSiteInfo } from '@/lib/site';

export const metadata: Metadata = { title: 'Inscripciones' };
// Debe ser un literal (Next lo analiza estáticamente); coincide con PUBLIC_REVALIDATE de data.ts.
export const revalidate = 60;

export default async function Page() {
  const [site, res] = await Promise.all([getSiteInfo(), loadStudents()]);
  const d = res.ok ? res.data : null;
  const open = d ? d.examCalls.filter((c) => c.enrollmentOpen) : [];
  const links = d ? d.links.filter((l) => l.enrollment) : [];

  return (
    <>
      <PageHero
        eyebrow="Para estudiantes"
        title="Inscripciones"
        description="Inscripción a carreras y a mesas de examen. Si todavía no sos estudiante, mirá la sección Ingreso."
        actions={
          <Button asChild variant="secondary">
            <Link href="/ingreso">Quiero ingresar a la tecnicatura</Link>
          </Button>
        }
      />

      {!d ? (
        <Section>
          <SectionError what="las inscripciones" />
        </Section>
      ) : (
        <>
          <Section eyebrow="Mesas de examen" title="Llamados con inscripción abierta" id="llamados">
            <p className="mb-5 flex flex-wrap items-center gap-3 text-sm text-font-strong">
              <Badge tone={d.examEnrollmentOpen ? 'success' : 'neutral'}>
                {d.examEnrollmentOpen
                  ? 'Inscripción a mesas habilitada'
                  : 'Inscripción a mesas cerrada por ahora'}
              </Badge>
              {d.term && <span>Ciclo vigente: {d.term.label}</span>}
            </p>
            {open.length === 0 ? (
              <EmptyState
                title="No hay llamados con inscripción abierta"
                description="Cuando se abra una mesa de examen la vas a ver acá, con sus fechas y el cronograma."
              />
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {open.map((c) => (
                  <li key={c.id}>
                    <ExamCallCard c={c} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section eyebrow="Trámite" title="¿Dónde me inscribo?" id="donde">
            {links.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {links.map((l) => (
                  <li key={l.id}>
                    <LinkCard href={l.url} title={l.title} description={l.description} external />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="El enlace de inscripción todavía no está publicado"
                description="Mientras tanto, consultá con Bedelía cómo inscribirte."
              />
            )}
            {site.emailBedelia && (
              <Card className="mt-6">
                <p className="text-sm text-font-strong">
                  ¿Dudas con tu inscripción? Escribile a Bedelía:{' '}
                  <a
                    href={`mailto:${site.emailBedelia}`}
                    className="font-semibold text-accent underline"
                  >
                    {site.emailBedelia}
                  </a>
                  .
                </p>
              </Card>
            )}
          </Section>
        </>
      )}
    </>
  );
}
