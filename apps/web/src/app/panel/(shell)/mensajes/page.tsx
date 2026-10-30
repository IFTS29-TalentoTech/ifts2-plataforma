import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { MensajesView } from '@/features/panel-a/mensajes/mensajes-view';
import { NoAccess } from '@/features/panel-a/no-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Mensajes de contacto' };

/** /panel/mensajes (RF08, Should). Permiso `contact:read` (ADMIN y BEDELIA); eliminar: solo ADMIN. */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.role, 'contact:read')) return <NoAccess title="Mensajes de contacto" />;
  return (
    <>
      <PageHeader
        title="Mensajes de contacto"
        description="Consultas que llegan desde el formulario de contacto del sitio."
      />
      <MensajesView canDelete={session.role === 'ADMIN'} />
    </>
  );
}
