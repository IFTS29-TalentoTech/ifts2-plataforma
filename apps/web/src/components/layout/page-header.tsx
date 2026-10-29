import type { ReactNode } from 'react';

/**
 * Encabezado de página del panel: título, descripción y acción principal.
 *   <PageHeader title="Avisos académicos" description="Administrá los comunicados..." action={<Button>Nuevo aviso</Button>} />
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-accent-3">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-font-strong">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Marcador de pantalla pendiente de implementar. Reemplazar por el contenido real. */
export function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-container px-gutter py-section lg:px-gutter-lg">
      <h1 className="font-display text-3xl font-extrabold text-accent-3">{title}</h1>
      <p className="mt-3 text-font-strong">{description ?? 'En construcción.'}</p>
    </div>
  );
}
