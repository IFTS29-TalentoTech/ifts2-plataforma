import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { GalleryEditor } from '@/features/panel-b/configuracion/gallery-editor';
import { NoAccess } from '@/features/panel-a/no-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Galerías' };

/**
 * /panel/galerias (RF09, ADR-036). Permiso `gallery:manage` (ADMIN y EDITOR por defecto). Es una página
 * propia porque el rol EDITOR no tiene `settings:manage` y por lo tanto no entra a Configuración; la
 * misma pantalla también está como pestaña dentro de Configuración.
 */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.permissions, 'gallery:manage')) return <NoAccess title="Galerías" />;
  return (
    <>
      <PageHeader
        title="Galerías"
        description="Elegí las fotos del carrusel de Estudiantes y de La carrera."
      />
      <GalleryEditor />
    </>
  );
}
