import { notFound } from 'next/navigation';
import { UiKitDemo } from './demo';

export const dynamic = 'force-dynamic'; // se decide en cada petición (ENABLE_UI_KIT)
export const metadata = { title: 'Kit de UI', robots: { index: false, follow: false } };

/** Catálogo de componentes (solo desarrollo). En producción responde 404. */
export default function Page() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_UI_KIT !== 'true') notFound();
  return <UiKitDemo />;
}
