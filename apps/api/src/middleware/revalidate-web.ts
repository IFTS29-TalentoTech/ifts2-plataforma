import type { NextFunction, Request, Response } from 'express';

/**
 * Avisa a la web que el contenido público cambió (revalidación bajo demanda).
 *
 * POR QUÉ: las páginas públicas son ISR con 60 s de revalidación (RNF05/RNF09: soportar picos sin
 * pegarle a la base). Sin este aviso, quien modera una publicación o crea un aviso en el panel tendría
 * que esperar hasta un minuto para verla en el sitio. Con él, el cambio se ve al instante y el sitio
 * mantiene la caché para el resto de las visitas.
 *
 * CÓMO: tras cualquier mutación EXITOSA del panel (POST/PUT/PATCH/DELETE con 2xx) se hace un
 * `POST {APP_ORIGIN}/api/revalidate` con el secreto compartido `REVALIDATE_SECRET`; la web invalida las
 * etiquetas `public` y `settings`. Es "dispara y olvida": si la web no responde, no pasa nada (la
 * caché vence sola en 60 s) y nunca demora ni rompe la respuesta de la API. Varias mutaciones seguidas
 * se agrupan en un solo aviso. Sin `REVALIDATE_SECRET` queda desactivado.
 */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Mutaciones que no cambian lo que ve el público. */
const IGNORED = [/^\/api\/v1\/auth\//, /^\/api\/v1\/contact-messages/, /^\/api\/v1\/public\//];
const COALESCE_MS = 300;

export function revalidateWeb(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING.has(req.method)) return next();
  const { config, logger } = req.ctx;
  const secret = config.revalidateSecret;
  if (!secret || IGNORED.some((re) => re.test(req.originalUrl))) return next();

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    schedule(req.ctx.fetch, `${config.appOrigin}/api/revalidate`, secret, (e) =>
      logger.debug({ err: String(e) }, 'no se pudo avisar a la web (la caché vence sola en 60 s)'),
    );
  });
  next();
}

const pending = new Map<string, NodeJS.Timeout>();

function schedule(
  fetchFn: typeof fetch,
  url: string,
  secret: string,
  onError: (e: unknown) => void,
) {
  if (pending.has(url)) return; // ya hay un aviso en camino: este cambio entra en el mismo
  pending.set(
    url,
    setTimeout(() => {
      pending.delete(url);
      fetchFn(url, {
        method: 'POST',
        headers: { 'x-revalidate-secret': secret },
        signal: AbortSignal.timeout(3000),
      }).catch(onError);
    }, COALESCE_MS).unref(),
  );
}
