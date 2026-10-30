import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/features/panel-a/login/auth-frame';
import { ChangePasswordForm } from '@/features/panel-a/login/change-password-form';
import { requireSession } from '@/lib/session';
import { getSiteInfo } from '@/lib/site';

export const metadata: Metadata = { title: 'Cambiar contraseña' };
export const dynamic = 'force-dynamic';

/** Pantalla propia del cambio obligatorio de contraseña (`mustChangePassword`). Fuera del shell. */
export default async function Page() {
  const session = await requireSession();
  if (!session.mustChangePassword) redirect('/panel');
  const site = await getSiteInfo();
  return (
    <AuthFrame site={site}>
      <ChangePasswordForm />
    </AuthFrame>
  );
}
