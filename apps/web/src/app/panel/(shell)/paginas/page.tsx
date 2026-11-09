import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { NoAccess } from '@/features/panel-a/no-access';
import { ContentEditor } from '@/features/panel-b/configuracion/content-editor';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Páginas del sitio' };

/**
 * /panel/paginas (RF01, RF02, ADR-041). Permiso `content:manage` (ADMIN por defecto). Es el único lugar
 * donde se editan los textos, las imágenes y las secciones (de texto o de galería) de cada página del
 * sitio; ya no está dentro de Configuración.
 */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.permissions, 'content:manage')) return <NoAccess title="Páginas del sitio" />;
  return (
    <>
      <PageHeader
        title="Páginas del sitio"
        description="Cambiá los textos, las imágenes y las galerías que se ven en cada página del sitio."
      />
      <ContentEditor perms={session.permissions} />
    </>
  );
}
