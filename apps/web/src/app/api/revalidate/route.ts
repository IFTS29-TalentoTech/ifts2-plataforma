/**
 * POST /api/revalidate — revalidación bajo demanda del sitio público.
 *
 * Lo llama la API (middleware `revalidate-web`) después de cada cambio del panel (moderar una
 * publicación, crear un aviso, cambiar el ciclo público...) para que el cambio se vea al instante
 * en lugar de esperar los 60 s de la caché ISR. Se autentica con el secreto compartido
 * `REVALIDATE_SECRET` (cabecera `x-revalidate-secret`); sin él o si no coincide responde 401. No
 * recibe datos: siempre invalida las mismas etiquetas (`public` y `settings`, ver
 * `features/public/data.ts` y `lib/site.ts`).
 */
import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function POST(req: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !sameSecret(req.headers.get('x-revalidate-secret'), expected)) {
    return new Response(null, { status: 401 });
  }
  revalidateTag('public');
  revalidateTag('settings');
  return new Response(null, { status: 204 });
}
