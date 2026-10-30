/**
 * Tarjetas del bloque académico público: avisos (cartelera), horarios por comisión y llamados a
 * examen. Se usan en Estudiantes, Inscripciones, Ingreso (avisos para aspirantes) e Inicio
 * (destacados). Reciben los DTO públicos de `@ifts2/shared` ya filtrados por vigencia: acá NO se
 * vuelve a decidir qué es visible (RF03/RF06: lo calcula la API al consultar).
 */
import { CalendarDays } from 'lucide-react';
import type { PublicExamCallDto, PublicNoticeDto, PublicScheduleDto } from '@ifts2/shared';
import { Badge, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateAR } from '@/lib/dates';
import { FileLink } from './parts';
import { Markdown } from './markdown';

/** Rango "07/12/2026 al 18/12/2026" (o un solo día si coinciden). */
export function dateRange(startsOn: string, endsOn: string): string {
  const a = formatDateAR(startsOn);
  const b = formatDateAR(endsOn);
  return a === b ? a : `${a} al ${b}`;
}

/**
 * Aviso de la cartelera. Urgente = insignia con texto "Urgente" (no solo color) y borde de alerta;
 * destacado = insignia "Próximo evento" (RF06). El orden (urgentes primero) lo entrega la API.
 */
export function NoticeCard({ n }: { n: PublicNoticeDto }) {
  return (
    <Card
      accentBar
      className={cn('flex flex-col gap-3', n.urgent && 'border-l-danger-solid')}
      data-testid="notice"
    >
      <div className="flex flex-wrap items-center gap-2">
        {n.urgent && <Badge tone="urgent">Urgente</Badge>}
        {n.highlighted && <Badge tone="warning">Próximo evento</Badge>}
        {n.category && <Badge>{n.category.name}</Badge>}
      </div>
      <h3 className="font-display text-lg font-bold text-accent-3">{n.title}</h3>
      <Markdown source={n.body} />
      <p className="text-xs text-font-strong">
        {n.visibleUntil
          ? `Vigente hasta el ${formatDateAR(n.visibleUntil)}`
          : 'Sin fecha de cierre'}
      </p>
      <FileLink file={n.attachment} />
    </Card>
  );
}

/** Horario de cursada de una comisión (RF06): descarga de la grilla vigente del ciclo público. */
export function ScheduleCard({ s }: { s: PublicScheduleDto }) {
  return (
    <Card accentBar className="flex flex-col gap-3" data-testid="schedule">
      <h3 className="font-display text-lg font-bold text-accent-3">{s.commissionName}</h3>
      {s.notes && <p className="text-sm text-font-strong">{s.notes}</p>}
      <p className="text-xs text-font-strong">Actualizado el {formatDateAR(s.updatedAt)}</p>
      <FileLink file={s.file} label="Descargar horarios" />
    </Card>
  );
}

/** Llamado / mesa de examen: fechas, estado de la inscripción y cronograma descargable. */
export function ExamCallCard({
  c,
  showEnrollment = true,
}: {
  c: PublicExamCallDto;
  showEnrollment?: boolean;
}) {
  return (
    <Card accentBar className="flex flex-col gap-3" data-testid="exam-call">
      <div className="flex flex-wrap items-center gap-2">
        {c.highlighted && <Badge tone="warning">Próximo evento</Badge>}
        {showEnrollment && (
          <Badge tone={c.enrollmentOpen ? 'success' : 'neutral'}>
            {c.enrollmentOpen ? 'Inscripción abierta' : 'Inscripción cerrada'}
          </Badge>
        )}
      </div>
      <h3 className="font-display text-lg font-bold text-accent-3">{c.name}</h3>
      <p className="flex items-center gap-2 text-sm font-medium text-accent-3">
        <CalendarDays className="h-4 w-4 text-accent" aria-hidden="true" />
        {dateRange(c.startsOn, c.endsOn)}
      </p>
      {c.notes && <p className="text-sm text-font-strong">{c.notes}</p>}
      <FileLink file={c.file} label="Descargar cronograma" />
    </Card>
  );
}
