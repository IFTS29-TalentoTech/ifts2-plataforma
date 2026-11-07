/**
 * Plantel docente en Institucional (RF10, US-29, ADR-037). Componente de servidor.
 *
 * - No hay diseño en el Figma (Q12): se arma con la tarjeta y los tokens existentes.
 * - Sin personas visibles NO se dibuja nada (ni el título): el sitio no muestra una sección vacía.
 * - Foto opcional y siempre decorativa (`alt=""`): el nombre ya está en el texto de la tarjeta.
 *   Sin foto, o si el almacenamiento falló (`photoSrc` nulo), se muestran las iniciales.
 * - Las materias a cargo van en una lista, para que un lector de pantalla anuncie "lista de n elementos".
 */
import type { PublicTeacherDto } from '@ifts2/shared';
import { Card } from '@/components/ui';
import { Cover, Section } from './parts';

/** Iniciales (máx. 2) del nombre, para la tarjeta sin foto. */
function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = [parts[0]?.[0], parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined];
  return letters.filter(Boolean).join('').toLocaleUpperCase('es');
}

export function TeachersSection({ teachers }: { teachers: PublicTeacherDto[] }) {
  if (teachers.length === 0) return null;
  return (
    <Section eyebrow="Equipo" title="Plantel docente" id="plantel">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="plantel">
        {teachers.map((t) => (
          <li key={t.id}>
            <Card className="flex h-full gap-4" data-testid="plantel-docente">
              {t.photoSrc ? (
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-pill">
                  <Cover
                    src={t.photoSrc}
                    alt=""
                    width={128}
                    height={128}
                    sizes="64px"
                    className="h-16 w-16"
                  />
                </div>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-pill bg-accent-2 font-display text-lg font-bold text-accent-3"
                >
                  {initials(t.name)}
                </span>
              )}
              <div className="min-w-0">
                <h3 className="font-display text-lg font-bold text-accent-3">{t.name}</h3>
                {t.role && <p className="text-sm text-font-strong">{t.role}</p>}
                {t.subjects.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-font-strong">
                      Materias a cargo
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-accent-3">
                      {t.subjects.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
