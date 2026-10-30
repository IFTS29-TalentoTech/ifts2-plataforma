import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { PanelShell } from '@/components/layout/panel-shell';
import { api } from '@/lib/api';
import { cookieHeader, requireSession } from '@/lib/session';
import { getSiteInfo } from '@/lib/site';

// El panel es siempre dinámico (depende de la sesión).
export const dynamic = 'force-dynamic';

interface Dashboard {
  pendingPosts?: number;
  activeNotices?: number;
}

/** Protege todo /panel/* (excepto /panel/login): sin sesión válida redirige al login. */
export default async function Layout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  // Tras un restablecimiento de clave la API bloquea todo (403) hasta que se cambie: pantalla propia.
  if (session.mustChangePassword) redirect('/panel/login/cambiar-clave');
  const cookie = await cookieHeader();
  const site = await getSiteInfo();

  // Datos opcionales del menú: si fallan, el panel igual se muestra.
  const [dashboard, health] = await Promise.all([
    api.get<Dashboard>('/dashboard', { cookie, cache: 'no-store' }).catch(() => ({}) as Dashboard),
    api
      .get<{ demoMode?: boolean }>('/health', { cache: 'no-store' })
      .catch(() => ({}) as { demoMode?: boolean }),
  ]);

  return (
    <PanelShell
      session={session}
      site={site}
      counts={{ publications: dashboard.pendingPosts, notices: dashboard.activeNotices }}
      demoMode={health.demoMode}
    >
      {children}
    </PanelShell>
  );
}
