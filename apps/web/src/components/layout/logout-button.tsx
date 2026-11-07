'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '../ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        loading={loading}
        className="w-full justify-start text-base hover:bg-accent-3"
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await api.post('/auth/logout');
          } catch (e) {
            setError(
              `No pudimos confirmar el cierre de sesión. ${e instanceof ApiError ? e.userMessage : 'Intentá de nuevo.'}`,
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
