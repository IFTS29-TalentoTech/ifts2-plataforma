import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { TeachersEditor } from '@/features/panel-b/configuracion/teachers-editor';
import { NoAccess } from '@/features/panel-a/no-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Plantel docente' };

/**
 * /panel/plantel (RF10, US-29, ADR-037). Permiso `teachers:manage` (ADMIN y EDITOR por defecto). Es una
 * página propia porque el rol EDITOR no tiene `settings:manage` y no entra a Configuración; la misma
 * pantalla también está como pestaña dentro de Configuración.
 */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.permissions, 'teachers:manage')) return <NoAccess title="Plantel docente" />;
  return (
    <>
      <PageHeader
        title="Plantel docente"
        description="Cargá las personas del plantel y las materias a cargo que se muestran en Institucional."
      />
      <TeachersEditor />
    </>
  );
}
