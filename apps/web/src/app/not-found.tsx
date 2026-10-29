import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="contenido" className="mx-auto max-w-container px-gutter py-section text-center">
      <h1 className="font-display text-3xl font-extrabold text-accent-3">
        No encontramos esa página
      </h1>
      <p className="mt-3 text-font-strong">
        Puede que la dirección esté mal escrita o que el contenido ya no esté disponible.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
