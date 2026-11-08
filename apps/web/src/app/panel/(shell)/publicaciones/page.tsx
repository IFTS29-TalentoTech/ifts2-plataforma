import { canAccessPanel, PANEL_CAPABILITIES } from '@/lib/nav';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { NoAccess } from '@/features/panel-a/no-access';
import { PublicacionesView } from '@/features/panel-a/publicaciones/publicaciones-view';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Publicaciones' };

/** Publicaciones: moderación de redes y gestión de publicaciones propias son independientes. */
export default async function Page() {
  const session = await requireSession();
  if (!canAccessPanel(session.permissions, PANEL_CAPABILITIES.publications))
    return <NoAccess title="Publicaciones" />;
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
