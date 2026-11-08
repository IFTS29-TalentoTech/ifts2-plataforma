import { canAccessPanel, PANEL_CAPABILITIES } from '@/lib/nav';
import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';
import { requireSession } from '@/lib/session';
import { ConfiguracionScreen } from '@/features/panel-b/configuracion/configuracion-screen';

export const metadata: Metadata = { title: 'Configuración' };

/** Configuración: usuarios, contenido, enlaces, integraciones y ajustes según capacidad. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ instagram?: string }>;
}) {
  const session = await requireSession();
  if (!canAccessPanel(session.permissions, PANEL_CAPABILITIES.configuration)) {
    return (
      <Placeholder title="Configuración" description="No tenés permiso para ver esta sección." />
    );
  }
  const { instagram } = await searchParams;
  return (
    <ConfiguracionScreen
      perms={session.permissions}
      instagramResult={instagram === 'connected' || instagram === 'error' ? instagram : undefined}
    />
  );
}
