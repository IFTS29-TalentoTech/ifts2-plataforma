import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { Card, Eyebrow } from '@/components/ui';
import { ChangePasswordForm } from '@/features/panel-a/login/change-password-form';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Mi cuenta' };

/**
 * /panel/cuenta: datos de la propia cuenta y cambio de contraseña voluntario. Lo usa cualquier persona
 * logueada, sin permiso especial (se llega desde el menú de la cuenta, no desde el menú lateral). El cambio
 * pide la contraseña actual y cierra las demás sesiones (POST /auth/change-password).
 */
export default async function Page() {
  const session = await requireSession();
  return (
    <>
      <PageHeader title="Mi cuenta" description="Tus datos de acceso al panel." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="cuenta-datos">
          <div>
            <Eyebrow>Datos</Eyebrow>
            <h2 id="cuenta-datos" className="font-display text-lg font-bold text-accent-3">
              Tu usuario
            </h2>
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt className="font-semibold text-accent-3">Nombre</dt>
              <dd className="break-words text-font-strong">{session.name}</dd>
            </div>
            <div>
              <dt className="font-semibold text-accent-3">Correo</dt>
              <dd className="break-words text-font-strong">{session.email}</dd>
            </div>
            <div>
              <dt className="font-semibold text-accent-3">Rol</dt>
              <dd className="text-font-strong">{session.roleName}</dd>
            </div>
          </dl>
          <p className="text-xs text-font-strong">
            El nombre, el correo y el rol los cambia un administrador.
          </p>
        </Card>
        <Card
          className="flex flex-col gap-4 lg:col-span-2"
          role="region"
          aria-labelledby="cuenta-clave"
        >
          <div>
            <Eyebrow>Seguridad</Eyebrow>
            <h2 id="cuenta-clave" className="font-display text-lg font-bold text-accent-3">
              Cambiar contraseña
            </h2>
            <p className="text-sm text-font-strong">
              Al cambiarla se cierran tus otras sesiones abiertas (por ejemplo, en otra
              computadora). Esta sigue activa.
            </p>
          </div>
          <div className="max-w-md">
            <ChangePasswordForm mode="voluntary" />
          </div>
        </Card>
      </div>
    </>
  );
}
