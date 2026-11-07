'use client';

import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { can, type PermissionList } from '@ifts2/shared';
import { OwnPublicationsTab } from './own-publications-tab';
import { SocialPostsTab } from './social-posts-tab';

/**
 * /panel/publicaciones (RF04). Dos pestañas:
 *  - "De redes sociales": moderación (pendientes, aprobadas, descartadas) y carga manual.
 *  - "Propias del sitio": publicaciones del sitio (editar, pausar, programar, reactivar, eliminar).
 * Tras cada cambio se refresca el layout (`router.refresh`) para que el contador del menú se actualice.
 */
export function PublicacionesView({ perms }: { perms: PermissionList }) {
  const router = useRouter();
  const refreshNav = () => router.refresh();
  const canSocial = can(perms, 'social:moderate');
  const canOwn = can(perms, 'publications:manage');
  return (
    <Tabs key={`${canSocial}:${canOwn}`} defaultValue={canSocial ? 'redes' : 'propias'}>
      <TabsList aria-label="Tipo de publicaciones">
        {canSocial && <TabsTrigger value="redes">De redes sociales</TabsTrigger>}
        {canOwn && <TabsTrigger value="propias">Propias del sitio</TabsTrigger>}
      </TabsList>
      {canSocial && (
        <TabsContent value="redes">
          <SocialPostsTab perms={perms} onChanged={refreshNav} />
        </TabsContent>
      )}
      {canOwn && (
        <TabsContent value="propias">
          <OwnPublicationsTab perms={perms} onChanged={refreshNav} />
        </TabsContent>
      )}
    </Tabs>
  );
}
