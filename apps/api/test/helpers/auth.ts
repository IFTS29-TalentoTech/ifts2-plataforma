import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '@ifts2/shared';
import { createUser, TEST_PASSWORD } from './factories';

export interface LoggedIn {
  /** Valor para el encabezado Cookie: `.set('Cookie', cookie)`. */
  cookie: string;
  user: Awaited<ReturnType<typeof createUser>>['user'];
  password: string;
}

/** Inicia sesión con una cookie real: `.set('Cookie', cookie)`. */
export async function loginWith(app: Express, email: string, password: string, remember = false) {
  return request(app).post('/api/v1/auth/login').send({ email, password, remember });
}

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const pair = list.map((c) => c.split(';')[0]).find((c) => c && !c.endsWith('='));
  if (!pair) throw new Error('La respuesta no trae cookie de sesión.');
  return pair;
}

/** Crea un usuario con ese rol, inicia sesión y devuelve la cookie. */
export async function loginAs(app: Express, role: Role, over: Parameters<typeof createUser>[0] = {}): Promise<LoggedIn> {
  const { user, password } = await createUser({ role, ...over });
  const res = await loginWith(app, user.email, password ?? TEST_PASSWORD);
  if (res.status !== 204) throw new Error(`loginAs(${role}) falló con ${res.status}: ${JSON.stringify(res.body)}`);
  return { cookie: cookieFrom(res), user, password };
}
