import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { GalleryEditor } from '@/features/panel-b/configuracion/gallery-editor';
import { NoAccess } from '@/features/panel-a/no-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Galerías' };

/**
 * /panel/galerias (RF09, ADR-036, ADR-041). Permiso `gallery:manage` (ADMIN y EDITOR por defecto). Es el
 * único lugar donde se editan galerías (ya no hay pestaña en Configuración).
 */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.permissions, 'gallery:manage')) return <NoAccess title="Galerías" />;
  return (
    <>
      <PageHeader
        title="Galerías"
        description="Creá galerías de fotos y subí las imágenes. Después elegí en qué página se muestran."
      />
      <GalleryEditor canPages={can(session.permissions, 'content:manage')} />
    </>
  );
}
