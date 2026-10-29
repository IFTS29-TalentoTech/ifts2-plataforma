import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Action, Role } from '@ifts2/shared';
import { api, ApiError } from './api';

export interface Session {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  permissions: Action[];
}

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'ifts2_session';

/** Cabecera Cookie para reenviar la sesión a la API desde un Server Component. */
export async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

/** Sesión actual (server-side) o null. Nunca lanza por 401. */
export async function getSession(): Promise<Session | null> {
  const cookie = await cookieHeader();
  if (!cookie.includes(`${SESSION_COOKIE}=`)) return null;
  try {
    return await api.get<Session>('/auth/me', { cookie, cache: 'no-store' });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

/** Para layouts/páginas del panel: redirige a /panel/login si no hay sesión. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/panel/login');
  return session;
}
