'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '../ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={loading}
      className="w-full justify-start text-base hover:bg-accent-3"
      onClick={async () => {
        setLoading(true);
        try {
          await api.post('/auth/logout');
        } finally {
          router.replace('/panel/login');
          router.refresh();
        }
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Cerrar sesión
    </Button>
  );
}
