import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/features/panel-a/login/auth-frame';
import { LoginForm } from '@/features/panel-a/login/login-form';
import { getSession } from '@/lib/session';
import { getSiteInfo } from '@/lib/site';

export const metadata: Metadata = { title: 'Ingresar al panel' };
// Depende de la cookie de sesión: nunca se prerenderiza.
export const dynamic = 'force-dynamic';

/**
 * /panel/login (Figma 13-login y Mobile · Login). Fuera del shell: sin menú lateral.
 * Si ya hay sesión válida se va directo al panel (o al cambio obligatorio de contraseña).
 * `?expired=1` lo agrega cualquier pantalla del panel que reciba un 401 (sesión vencida).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  const session = await getSession();
  if (session) redirect(session.mustChangePassword ? '/panel/login/cambiar-clave' : '/panel');
  const site = await getSiteInfo();
  return (
    <AuthFrame site={site}>
      <LoginForm expired={expired === '1'} />
    </AuthFrame>
  );
}
