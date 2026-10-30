import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';
import { requireSession } from '@/lib/session';
import { ArchivoScreen } from '@/features/panel-b/archivo/archivo-screen';

export const metadata: Metadata = { title: 'Archivo' };

/** RF03 (US-16..18, US-33). Solo ADMIN y BEDELIA (`documents:manage`). */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.role, 'documents:manage')) {
    return <Placeholder title="Archivo" description="No tenés permiso para ver esta sección." />;
  }
  return <ArchivoScreen role={session.role} />;
}
