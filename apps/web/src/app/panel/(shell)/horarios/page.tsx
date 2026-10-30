import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';
import { requireSession } from '@/lib/session';
import { HorariosScreen } from '@/features/panel-b/horarios/horarios-screen';

export const metadata: Metadata = { title: 'Horarios' };

/** RF06 (US-13..15). Solo ADMIN y BEDELIA (`schedules:manage`); EDITOR no ve el ítem ni la pantalla. */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.role, 'schedules:manage')) {
    return <Placeholder title="Horarios" description="No tenés permiso para ver esta sección." />;
  }
  return <HorariosScreen role={session.role} />;
}
