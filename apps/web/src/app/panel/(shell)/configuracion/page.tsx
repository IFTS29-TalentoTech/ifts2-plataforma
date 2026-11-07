import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';
import { requireSession } from '@/lib/session';
import { ConfiguracionScreen } from '@/features/panel-b/configuracion/configuracion-screen';

export const metadata: Metadata = { title: 'Configuración' };

/**
 * RF01, RF05 (US-25/26). Solo ADMIN (`settings:manage`). `?instagram=connected|error` lo agrega la API
 * al volver del flujo OAuth de Meta (ver /integrations/instagram/callback).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ instagram?: string }>;
}) {
  const session = await requireSession();
  if (!can(session.permissions, 'settings:manage')) {
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
