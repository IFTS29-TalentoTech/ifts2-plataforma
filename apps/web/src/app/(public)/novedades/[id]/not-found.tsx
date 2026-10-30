import Link from 'next/link';
import { Button } from '@/components/ui';
import { Container } from '@/features/public/parts';

/** 404 amable de una publicación (no existe, venció o todavía no se publicó). Va dentro del layout público. */
export default function NotFound() {
  return (
    <Container className="max-w-3xl py-section text-center">
      <h1 className="font-display text-3xl font-extrabold text-accent-3">
        No encontramos esta publicación
      </h1>
      <p className="mt-3 text-font-strong">
        Puede que ya no esté disponible o que la dirección esté mal escrita. Mirá las novedades
        vigentes o buscala en el archivo.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/novedades">Ver novedades</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/novedades?archived=true">Ir al archivo</Link>
        </Button>
      </div>
    </Container>
  );
}
