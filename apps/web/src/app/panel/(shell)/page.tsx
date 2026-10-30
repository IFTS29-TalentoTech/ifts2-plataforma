import type { Metadata } from 'next';
import { DashboardView } from '@/features/panel-a/dashboard/dashboard-view';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Resumen' };

/** /panel (Figma 07): Resumen. Los bloques que se muestran dependen del rol (ver DashboardView). */
export default async function Page() {
  const session = await requireSession();
  return <DashboardView role={session.role} />;
}
