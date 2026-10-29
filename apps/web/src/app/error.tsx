'use client';

import { ErrorState } from '@/components/ui/states';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="contenido" className="mx-auto max-w-container px-gutter py-section">
      <ErrorState onRetry={reset} />
    </main>
  );
}
