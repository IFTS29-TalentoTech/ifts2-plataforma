/**
 * GET /api/session — quién está logueado, para la cabecera del sitio público.
 *
 * Las páginas públicas son estáticas (ISR, RNF09): su layout no puede leer cookies sin volverse
 * dinámico. Por eso la cabecera pregunta acá, desde el navegador, después de hidratar. Devuelve
 * siempre 200 con `{ name: string | null }` (sin 401, para no ensuciar la consola de los
 * visitantes) y sin caché. No expone nada más que el nombre; si la API falla se trata como
 * "sin sesión" (el sitio público no depende de la API).
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const name = await getSession()
    .then((s) => s?.name ?? null)
    .catch(() => null);
  return NextResponse.json({ name }, { headers: { 'Cache-Control': 'no-store' } });
}
