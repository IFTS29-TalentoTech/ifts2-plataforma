import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'Ingresar al panel' };

export default function Page() {
  return (
    <main id="contenido" className="min-h-dvh bg-base">
      <Placeholder title="Panel de Gestión" description="Ingreso al panel. En construcción." />
    </main>
  );
}
