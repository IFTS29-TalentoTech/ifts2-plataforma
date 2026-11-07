import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { NoAccess } from '@/features/panel-a/no-access';
import { PublicacionesView } from '@/features/panel-a/publicaciones/publicaciones-view';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Publicaciones' };

/** /panel/publicaciones (Figma 08). Permiso: `publications:manage` (EDITOR y ADMIN; BEDELIA no, E2E-11). */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.permissions, 'publications:manage')) return <NoAccess title="Publicaciones" />;
  return (
    <>
      <PageHeader
        title="Publicaciones seleccionadas"
        description="Elegí qué novedades de las redes sociales se mostrarán en el sitio institucional y gestioná las publicaciones propias."
      />
      <PublicacionesView perms={session.permissions} />
    </>
  );
}
