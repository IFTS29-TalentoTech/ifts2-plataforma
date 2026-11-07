'use client';

import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import type { PermissionList } from '@ifts2/shared';
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
  return (
    <Tabs defaultValue="redes">
      <TabsList aria-label="Tipo de publicaciones">
        <TabsTrigger value="redes">De redes sociales</TabsTrigger>
        <TabsTrigger value="propias">Propias del sitio</TabsTrigger>
      </TabsList>
      <TabsContent value="redes">
        <SocialPostsTab perms={perms} onChanged={refreshNav} />
      </TabsContent>
      <TabsContent value="propias">
        <OwnPublicationsTab onChanged={refreshNav} />
      </TabsContent>
    </Tabs>
  );
}
