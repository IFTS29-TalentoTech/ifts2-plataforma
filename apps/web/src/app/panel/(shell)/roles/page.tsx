import { can } from '@ifts2/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { NoAccess } from '@/features/panel-a/no-access';
import { RolesScreen } from '@/features/panel-b/roles/roles-screen';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Roles y permisos' };

/**
 * /panel/roles (RF11, US-36). Solo SUPERADMIN (`roles:manage`). No está en el Figma (Q123): se arma
 * con componentes del kit. Cualquier otro rol ve "sin acceso" y la API responde 403.
 */
export default async function Page() {
  const session = await requireSession();
  if (!can(session.permissions, 'roles:manage')) return <NoAccess title="Roles y permisos" />;
  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Creá roles y elegí qué puede hacer cada uno. Solo lo ve el Superadministrador."
      />
      <RolesScreen />
    </>
  );
}
