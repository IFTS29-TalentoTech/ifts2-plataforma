/**
 * Plantel docente (RF10, US-29): lectura y mapeo compartidos por el panel (`/teachers`) y por la API
 * pública (`/public/teachers`).
 *
 * `Teacher.photo` guarda una ruta propia (`/img/...`, la deja la semilla) o una clave del
 * almacenamiento (`teachers/<uuid>.webp`); vacío = sin foto. Las URL firmadas vencen: se resuelven al
 * responder. RNF03: si el almacenamiento falla, la persona se muestra igual, sin foto.
 */
import type { Teacher } from '@prisma/client';
import type { PublicTeacherDto, TeacherDto } from '@ifts2/shared';
import type { AppContext } from '../../context';
import { resolveCoverSrc } from '../../lib/cover';

/** Todo el plantel (visible y oculto) en el orden elegido. */
export function listTeachers(ctx: AppContext): Promise<Teacher[]> {
  return ctx.prisma.teacher.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
}

export async function toTeacherDto(ctx: AppContext, row: Teacher): Promise<TeacherDto> {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    subjects: row.subjects,
    photo: row.photo,
    photoSrc: await resolveCoverSrc(ctx.storage, row.photo),
    order: row.order,
    visible: row.visible,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Plantel público: SOLO las personas visibles (la baja lógica las saca del sitio). */
export async function listPublicTeachers(ctx: AppContext): Promise<PublicTeacherDto[]> {
  const rows = await ctx.prisma.teacher.findMany({
    where: { visible: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      subjects: r.subjects,
      photoSrc: await resolveCoverSrc(ctx.storage, r.photo),
    })),
  );
}
