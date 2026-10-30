/**
 * Configuración · sección "Integraciones" (ADR-020). Solo ADMIN (`integrations:manage`):
 * la pantalla padre ni la monta para otros roles y la API igualmente responde 403.
 * Instagram y correo los configura el cliente; el almacenamiento es de infraestructura (DevOps) y
 * acá solo se informa su estado (`GET /health`), sin campos editables.
 */
'use client';

import { HardDrive } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { useResource } from '../lib/use-resource';
import { InstagramCard } from './instagram-card';
import { MailCard } from './mail-card';

interface Health {
  demoMode?: boolean;
  integrations?: { storage?: string; mailer?: string; instagram?: string };
}

export function IntegrationsPanel({
  instagramResult,
}: {
  instagramResult?: 'connected' | 'error';
}) {
  const health = useResource<Health>('/health');
  const storage = health.data?.integrations?.storage;
  return (
    <section aria-labelledby="integrations-title" className="flex flex-col gap-6">
      <div>
        <h2 id="integrations-title" className="font-display text-xl font-bold text-accent-3">
          Integraciones
        </h2>
        <p className="text-sm text-font-strong">
          Conectá las redes y el correo del instituto. Si algo falla, el sitio sigue funcionando.
        </p>
      </div>
      {health.data?.demoMode && (
        <p
          role="status"
          className="rounded-md border border-warning-strong bg-warning-back px-4 py-2 text-sm font-medium text-warning-strong"
        >
          Modo demostración: alguna integración todavía usa datos de ejemplo.
        </p>
      )}
      <InstagramCard result={instagramResult} />
      <MailCard />
      <Card className="flex flex-col gap-2" role="region" aria-labelledby="storage-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id="storage-title"
            className="flex items-center gap-2 font-display text-lg font-bold text-accent-3"
          >
            <HardDrive className="h-5 w-5" aria-hidden="true" />
            Almacenamiento de archivos
          </h3>
          {storage && <Badge>{storage}</Badge>}
        </div>
        <p className="text-sm text-font-strong">
          Solo informativo: el almacenamiento se define por entorno y lo administra el equipo
          técnico (DevOps). No se configura desde esta pantalla.
        </p>
      </Card>
    </section>
  );
}
