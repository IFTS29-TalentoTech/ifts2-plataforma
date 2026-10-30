import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { AvisosView } from '@/features/panel-a/avisos/avisos-view';
import { NoAccess } from '@/features/panel-a/no-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Avisos académicos' };

/** /panel/avisos (Figma 09). Permiso: `notices:manage` (ADMIN y BEDELIA; EDITOR no). */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.role, 'notices:manage')) return <NoAccess title="Avisos académicos" />;
  return (
    <>
      <PageHeader
        title="Avisos académicos"
        description="Administrá los comunicados oficiales visibles en la cartelera de estudiantes y novedades."
      />
      <AvisosView role={session.role} />
    </>
  );
}
