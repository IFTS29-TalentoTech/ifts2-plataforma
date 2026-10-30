'use client';

/**
 * Carga de datos del panel con tres estados explícitos (cargando / error / datos), pedidos por toda
 * pantalla en docs/specs/05-ui-y-pantallas.md ("Estados que toda pantalla debe resolver").
 *
 *   const { data, error, loading, reload } = useResource(`posts:${status}:${page}`, () => api.get(...));
 *
 * - `key` identifica la consulta: cuando cambia (filtros, página) se vuelve a pedir.
 * - `reload()` repite la consulta conservando lo que ya hay en pantalla (sin volver al esqueleto).
 * - El resultado se asocia a la clave que lo pidió, así `loading` se DERIVA (no hay setState síncrono en
 *   efectos) y una respuesta tardía de una consulta vieja nunca pisa a la nueva.
 * - Un 401 (sesión vencida) lleva al login con un aviso; ver `handleSessionExpired`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { handleSessionExpired } from './errors';

interface Result<T> {
  key: string;
  data?: T;
  error?: unknown;
}

export function useResource<T>(key: string, loader: () => Promise<T>) {
  const [tick, setTick] = useState(0);
  const fullKey = `${key}#${tick}`;
  const [result, setResult] = useState<Result<T> | null>(null);
  const [lastData, setLastData] = useState<T | undefined>(undefined);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let cancelled = false;
    loaderRef
      .current()
      .then((data) => {
        if (cancelled) return;
        setResult({ key: fullKey, data });
        setLastData(data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (handleSessionExpired(error)) return;
        setResult({ key: fullKey, error });
      });
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const settled = result?.key === fullKey;
  const error = settled ? result.error : undefined;
  return {
    /** Último dato recibido (se conserva mientras se recarga o si la recarga falla). */
    data: lastData,
    error,
    /** true solo mientras no hay ningún dato para mostrar (primer pedido). */
    loading: !settled && lastData === undefined,
    /** true mientras se actualiza (puede haber datos viejos en pantalla). */
    refreshing: !settled,
    reload,
  };
}
