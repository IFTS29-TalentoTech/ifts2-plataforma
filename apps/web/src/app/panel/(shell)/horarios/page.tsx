import { canAccessPanel, PANEL_CAPABILITIES } from '@/lib/nav';
import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';
import { requireSession } from '@/lib/session';
import { HorariosScreen } from '@/features/panel-b/horarios/horarios-screen';

export const metadata: Metadata = { title: 'Horarios' };

/** Horarios, llamados y ciclos: el contenedor admite cualquiera de sus capacidades. */
export default async function Page() {
  const session = await requireSession();
  if (!canAccessPanel(session.permissions, PANEL_CAPABILITIES.schedules)) {
    return <Placeholder title="Horarios" description="No tenés permiso para ver esta sección." />;
  }
  return <HorariosScreen perms={session.permissions} />;
}
