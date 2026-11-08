'use client';

import { ErrorState } from '@/components/ui/states';

/**
 * Pantalla del panel cuando la API no responde (apagada, sin red o caída). Distinta del error
 * genérico "No pudimos cargar esta sección": acá sabemos que el problema es la conexión con el
 * servidor, y la persona puede reintentar sin perder nada.
 */
export function ApiUnavailable() {
  return (
    <main id="contenido" className="mx-auto max-w-container px-gutter py-section">
      <ErrorState
        title="No hay conexión con el servidor"
        description="El panel no pudo comunicarse con la API. Revisá tu conexión (o que el servidor esté en funcionamiento) y volvé a intentar."
        onRetry={() => window.location.reload()}
      />
    </main>
  );
}
