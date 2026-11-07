/**
 * GET /api/session — quién está logueado, para la cabecera del sitio público.
 *
 * Las páginas públicas son estáticas (ISR, RNF09): su layout no puede leer cookies sin volverse
 * dinámico. Por eso la cabecera pregunta acá, desde el navegador, después de hidratar. Devuelve
 * siempre 200 con `{ name, roleName }` (ambos `null` sin sesión) (sin 401, para no ensuciar la consola de los
 * visitantes) y sin caché. No expone nada más que el nombre y el rol visible; si la API falla se trata como
 * "sin sesión" (el sitio público no depende de la API).
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession().catch(() => null);
  return NextResponse.json(
    { name: session?.name ?? null, roleName: session?.roleName ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
