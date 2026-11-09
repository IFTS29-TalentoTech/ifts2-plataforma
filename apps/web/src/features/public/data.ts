/**
 * Capa de datos del sitio público (solo servidor).
 *
 * Reglas que implementa:
 * - ADR-10 / RNF09: todo se pide a `/public/*` con revalidación corta (ISR de 60 s) para que las
 *   páginas sean cacheables y soporten picos de visitas sin pegarle a la base en cada request.
 * - RNF03: si la API falla o no responde NUNCA se lanza una excepción hacia la página: se devuelve
 *   `{ ok: false }` y cada página muestra un estado de error claro y sigue renderizando el resto.
 *
 * Los tipos de respuesta vienen de `@ifts2/shared` (`import type`), no se duplican acá.
 */
import type {
  ContentPage,
  PublicContentDto,
  PublicTeachersDto,
  PublicHomeDto,
  PublicPublicationDetailDto,
  PublicPublicationsDto,
  PublicStudentsDto,
} from '@ifts2/shared';
import { api, ApiError } from '@/lib/api';

/** Segundos de revalidación de las páginas públicas. Debe coincidir con el `export const revalidate` de cada página. */
export const PUBLIC_REVALIDATE = 60;

export type Loaded<T> = { ok: true; data: T } | { ok: false; status: number };

/** Pide un recurso público; convierte cualquier falla (red, 4xx, 5xx) en `{ ok: false, status }`. */
export async function loadPublic<T>(path: string): Promise<Loaded<T>> {
  try {
    const data = await api.get<T>(`/public${path}`, {
      next: { revalidate: PUBLIC_REVALIDATE, tags: ['public'] },
    });
    // Una respuesta vacía o no JSON (proxy caído) también cuenta como falla.
    if (data === undefined || data === null) {
      console.error(`[public] respuesta vacía en ${path}`);
      return { ok: false, status: 502 };
    }
    return { ok: true, data };
  } catch (e) {
    // Se registra en el servidor para diagnóstico; el visitante solo ve el estado de error.
    console.error(`[public] no se pudo leer ${path}:`, e instanceof Error ? e.message : e);
    return { ok: false, status: e instanceof ApiError ? e.status : 0 };
  }
}

export const loadHome = () => loadPublic<PublicHomeDto>('/home');
export const loadStudents = (audience?: 'ASPIRANTS' | 'STUDENTS') =>
  loadPublic<PublicStudentsDto>(`/students${audience ? `?audience=${audience}` : ''}`);
/** Secciones de texto y de galería de una página (ADR-041). */
export const loadContent = (page: ContentPage) => loadPublic<PublicContentDto>(`/content/${page}`);
/** Plantel docente visible (RF10). Si falla, Institucional simplemente no muestra la sección. */
export const loadTeachers = () => loadPublic<PublicTeachersDto>('/teachers');
export const loadPublication = (id: string, archived: boolean) =>
  loadPublic<PublicPublicationDetailDto>(
    `/publications/${encodeURIComponent(id)}${archived ? '?archived=true' : ''}`,
  );

export interface NewsQuery {
  year?: number;
  category?: string;
  archived?: boolean;
  page?: number;
}

export const loadPublications = (q: NewsQuery) => {
  const p = new URLSearchParams();
  if (q.year) p.set('year', String(q.year));
  if (q.category) p.set('category', q.category);
  if (q.archived) p.set('archived', 'true');
  if (q.page && q.page > 1) p.set('page', String(q.page));
  const qs = p.toString();
  return loadPublic<PublicPublicationsDto>(`/publications${qs ? `?${qs}` : ''}`);
};

/** Peso legible de un archivo adjunto ("276 B", "1,4 MB"). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
