import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui';

/**
 * Pantalla "sin permiso" para quien llega por la dirección a una sección que su rol no puede usar
 * (RF05, RNF06, E2E-11). El menú ya oculta esas secciones, y la API responde 403 igual: esto solo evita
 * mostrar una pantalla rota. Sin códigos técnicos.
 */
export function NoAccess({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center gap-3 rounded-lg border border-accent-2 bg-surface px-6 py-10 text-center">
        <ShieldAlert className="h-8 w-8 text-accent" aria-hidden="true" />
        <p className="font-display text-lg font-bold text-accent-3">
          Tu rol no tiene acceso a esta sección
        </p>
        <p className="max-w-md text-sm text-font-strong">
          Si lo necesitás para tu trabajo, pedile a un administrador del sitio que revise tus
          permisos.
        </p>
        <Button asChild variant="secondary">
          <Link href="/panel">Volver al Resumen</Link>
        </Button>
      </div>
    </>
  );
}
