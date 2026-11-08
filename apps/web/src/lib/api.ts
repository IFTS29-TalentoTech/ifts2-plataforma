import type { ProblemDetails } from '@ifts2/shared';
import { mutationContract } from './mutation-contracts';

/**
 * Cliente de la API REST (fetch con credenciales y manejo de Problem Details).
 *
 * - En el navegador usa `/api/v1/...` (mismo origen; Next lo reenvía a la API: ver next.config.ts).
 * - En el servidor (Server Components) llama directo a `API_ORIGIN` y reenvía la cookie de sesión.
 *
 * Uso:
 *   const notices = await api.get<Page<Notice>>('/notices?status=ACTIVE');
 *   await api.post('/notices', body);
 *   try { ... } catch (e) { if (e instanceof ApiError) e.fieldErrors  // { email: ['...'] }
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: Partial<ProblemDetails> & Record<string, unknown>;

  constructor(
    problem: Partial<ProblemDetails> & Record<string, unknown>,
    status: number,
    readonly outcome: 'rejected' | 'unknown' = 'rejected',
  ) {
    super(problem.detail ?? problem.title ?? 'Ocurrió un error inesperado.');
    this.name = 'ApiError';
    this.status = status;
    this.code = (problem.code as string) ?? 'internal';
    this.problem = problem;
  }

  /** Errores por campo, listos para mostrar debajo de cada input. */
  get fieldErrors(): Record<string, string[]> {
    return this.problem.errors ?? {};
  }
  /** Mensaje para el usuario (sin códigos técnicos). */
  get userMessage(): string {
    if (
      this.outcome === 'unknown' &&
      this.status === 502 &&
      typeof this.problem.detail === 'string'
    )
      return `${this.problem.detail} No pudimos confirmar el resultado. Revisá el estado antes de volver a enviar la operación.`;
    if (this.outcome === 'unknown')
      return `${this.status >= 500 ? 'Algo salió mal de nuestro lado. ' : ''}No pudimos confirmar el resultado. El servidor puede haber guardado los cambios. Revisá el estado antes de volver a enviar la operación.`;
    if (this.status === 0)
      return 'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.';
    if (this.status >= 500)
      return 'Algo salió mal de nuestro lado. Intentá de nuevo en unos minutos.';
    return this.message;
  }
}

const isServer = typeof window === 'undefined';

function baseUrl(): string {
  if (!isServer) return '/api/v1';
  return `${process.env.API_ORIGIN ?? 'http://localhost:4000'}/api/v1`;
}

interface RequestOptions {
  /** Server Components: cookies a reenviar (ver getSession / serverApi). */
  cookie?: string;
  /** Opciones de caché de Next (solo servidor), p. ej. { revalidate: 60, tags: ['notices'] }. */
  next?: { revalidate?: number | false; tags?: string[] };
  cache?: RequestCache;
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const mutation = method !== 'GET';
  const contract = mutation ? mutationContract(method, path) : undefined;
  if (mutation && !contract) {
    throw new ApiError(
      { title: 'Esta operación no tiene un contrato de respuesta definido.' },
      400,
    );
  }
  const unconfirmed = () =>
    new ApiError(
      {
        title: mutation
          ? 'No pudimos confirmar el resultado.'
          : 'El servidor envió una respuesta inválida.',
        code: 'bad-gateway',
      },
      mutation ? 0 : 502,
      mutation ? 'unknown' : 'rejected',
    );
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (isServer && opts.cookie) headers.Cookie = opts.cookie;

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'include',
      cache: opts.cache,
      signal: opts.signal,
      ...(isServer && opts.next ? { next: opts.next } : {}),
    });
  } catch {
    if (mutation) throw unconfirmed();
    throw new ApiError({ title: 'Sin conexión', code: 'bad-gateway', status: 0 }, 0);
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    throw unconfirmed();
  }
  const data = safeJson(text);
  if (!res.ok) {
    const problem =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Partial<ProblemDetails>)
        : { title: res.statusText || 'La solicitud falló.', status: res.status };
    throw new ApiError(problem, res.status, mutation && res.status >= 500 ? 'unknown' : 'rejected');
  }
  if (contract?.status === 204) {
    if (res.status !== 204 || text !== '') throw unconfirmed();
    return undefined as T;
  }
  if (
    res.status === 204 ||
    (contract && ![contract.status, ...(contract.alsoStatuses ?? [])].includes(res.status))
  )
    throw unconfirmed();
  const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!(type === 'application/json' || type?.endsWith('+json')) || data === undefined)
    throw unconfirmed();
  if (contract?.schema && !contract.schema.safeParse(data).success) throw unconfirmed();
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post: <T = void>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('POST', path, body, opts),
  put: <T = void>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PUT', path, body, opts),
  patch: <T = void>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PATCH', path, body, opts),
  delete: <T = void>(path: string, opts?: RequestOptions) =>
    request<T>('DELETE', path, undefined, opts),
};
