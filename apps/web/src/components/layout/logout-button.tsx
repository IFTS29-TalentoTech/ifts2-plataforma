'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '../ui/button';

/**
 * Botón de cierre de sesión. `tone="dark"` es para fondos oscuros (menú lateral del panel, texto claro);
 * `tone="light"` para fondos claros (menú de cuenta). El color va en una sola rama: `text-base` es un
 * color claro en este tema y no se debe mezclar con otro color de texto.
 */
export function LogoutButton({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        loading={loading}
        className={
          tone === 'dark'
            ? 'w-full justify-start text-base hover:bg-accent-3'
            : 'w-full justify-start text-accent-3 hover:bg-accent-2'
        }
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await api.post('/auth/logout');
          } catch (e) {
            // Logout es idempotente: el reintento manual no duplica registros ni concede éxito.
            setError(
              `No pudimos confirmar el cierre de sesión. ${e instanceof ApiError ? e.userMessage : 'Revisá la conexión.'} Revisá tu conexión. Intentá de nuevo para cerrar la sesión.`,
            );
            return;
          } finally {
            setLoading(false);
          }
          router.replace('/panel/login');
          router.refresh();
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Cerrar sesión
      </Button>
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text"
        >
          {error}
        </p>
      )}
    </div>
  );
}
