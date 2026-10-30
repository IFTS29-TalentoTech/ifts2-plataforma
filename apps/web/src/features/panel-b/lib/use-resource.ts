/**
 * Panel B · hook de lectura de la API con los estados que exige la spec (05-ui-y-pantallas.md):
 * cargando, listo, error (con "Reintentar") y recarga sin parpadeo.
 *
 * Por qué un hook propio: el panel es 100 % cliente (ConfirmDialog, formularios, toasts) y solo
 * necesita "traer, mostrar, volver a traer tras una mutación". Mantenemos los datos anteriores
 * mientras recarga para que la tabla no salte a un esqueleto después de cada acción.
 * `refreshing` se DERIVA (clave pedida vs. clave cargada) en vez de guardarse: así no hay setState
 * síncrono dentro del efecto (regla react-hooks/set-state-in-effect del lint).
 *
 * Uso:
 *   const r = useResource<Page<DocumentDto>>(`/documents?page=${page}`);
 *   if (r.status === 'loading') return <Skeleton/>;
 *   if (r.status === 'error') return <ErrorState onRetry={r.reload} />;
 *   r.data ... ; await mutar(); r.reload();
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

type Loaded<T> =
  | { status: 'loading'; data: undefined; error: undefined; key: string }
  | { status: 'ready'; data: T; error: undefined; key: string }
  | { status: 'error'; data: T | undefined; error: ApiError; key: string };

export type ResourceState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: T; error: undefined }
  | { status: 'error'; data: T | undefined; error: ApiError };

export function useResource<T>(path: string | null): ResourceState<T> & {
  reload: () => void;
  /** true mientras vuelve a pedir datos teniendo ya una versión anterior. */
  refreshing: boolean;
} {
  const [state, setState] = useState<Loaded<T>>({
    status: 'loading',
    data: undefined,
    error: undefined,
    key: '',
  });
  const [tick, setTick] = useState(0);
  const key = `${path}#${tick}`;

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    api
      .get<T>(path, { signal: ctrl.signal, cache: 'no-store' })
      .then((data) => setState({ status: 'ready', data, error: undefined, key }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const error =
          e instanceof ApiError
            ? e
            : new ApiError({ title: 'Error', status: 0, code: 'internal' }, 0);
        setState((prev) => ({ status: 'error', data: prev.data, error, key }));
      });
    return () => ctrl.abort();
  }, [path, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const { key: loadedKey, ...rest } = state;
  return { ...(rest as ResourceState<T>), reload, refreshing: path !== null && loadedKey !== key };
}
