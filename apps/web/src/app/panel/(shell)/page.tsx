import { can } from '@ifts2/shared';
import { redirect } from 'next/navigation';
import { PANEL_NAV, canAccessNav } from '@/lib/nav';
import type { Metadata } from 'next';
import { DashboardView } from '@/features/panel-a/dashboard/dashboard-view';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Resumen' };

/** /panel (Figma 07): Resumen. Los bloques que se muestran dependen del rol (ver DashboardView). */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.permissions, 'dashboard:read')) {
    const target = PANEL_NAV.find(
      (item) => item.href !== '/panel' && canAccessNav(session.permissions, item),
    );
    if (target) redirect(target.href);
  }
  return <DashboardView perms={session.permissions} />;
}
