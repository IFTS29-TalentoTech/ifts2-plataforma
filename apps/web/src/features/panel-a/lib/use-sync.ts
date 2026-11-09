'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { handleSessionExpired, humanError } from './errors';
import type { SyncResultDto } from './types';

/**
 * Botón "sincronizar con Instagram" (Resumen y Publicaciones). POST /social/sync.
 *  - 200: toast con cuántas publicaciones nuevas quedaron pendientes.
 *  - 422 (sin hashtag / sin cuenta) y 502 (Instagram falló, token vencido): toast de error con el motivo que
 *    manda la API; el llamador recarga para que el Resumen muestre "Instagram API: error" y ofrezca la carga
 *    manual (RF04, RNF03). El resto del panel sigue funcionando.
 *  - Por defecto la sincronización es incremental (solo lo posterior al último fetch exitoso); `sync({ full: true })`
 *    fuerza la carga completa (`?full=true`). El toast aclara cuál se hizo (ADR-038).
 *  - 429: la API limita a 6 sincronizaciones por minuto.
 */
export function useInstagramSync(onFinished: () => void) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(
    async (opts?: { full?: boolean }) => {
      setSyncing(true);
      try {
        const r = await api.post<SyncResultDto>(
          opts?.full ? '/social/sync?full=true' : '/social/sync',
        );
        toast({
          title:
            (r.mode === 'full' ? 'Sincronización completa lista' : 'Sincronización lista') +
            (r.created > 0 ? `: ${r.created} nueva(s)` : ''),
          description:
            r.created > 0
              ? 'Quedaron pendientes de moderación.'
              : 'No hay publicaciones nuevas con el hashtag configurado.',
          tone: 'success',
        });
      } catch (e) {
        if (handleSessionExpired(e)) return;
        // 502 = Instagram respondió y la API ya explica el motivo. La sincronización no cambia nada si falla,
        // así que no corresponde el aviso genérico "No pudimos confirmar el resultado" de las mutaciones.
        const reason =
          e instanceof ApiError && e.status === 502 && typeof e.problem.detail === 'string'
            ? e.problem.detail
            : humanError(e);
        toast({ title: 'No se pudo sincronizar', description: reason, tone: 'error' });
      } finally {
        setSyncing(false);
        onFinished();
      }
    },
    [onFinished, toast],
  );

  return { sync, syncing };
}
