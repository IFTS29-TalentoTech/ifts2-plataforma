'use client';

/**
 * Cambio OBLIGATORIO de contraseña (ADR-06): un administrador restableció la clave y el usuario debe
 * elegir una propia antes de usar el panel. Mientras `mustChangePassword` esté activo, la API responde 403
 * (`password-change-required`) en todo lo demás, y el layout del panel redirige acá.
 * Endpoint: POST /auth/change-password { current, next } -> 204. Reglas de `next`: mínimo 10 caracteres,
 * letras y números, distinta de la actual (las valida la API con el esquema compartido; acá se repiten
 * las mismas respuestas por campo).
 */
import { KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { fieldMessages, humanError } from '../lib/errors';

export function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (next !== confirm) {
      setErrs({ confirm: 'Las contraseñas no coinciden.' });
      return;
    }
    setErrs({});
    setLoading(true);
    try {
      await api.post('/auth/change-password', { current, next });
      router.replace('/panel');
      router.refresh();
    } catch (err) {
      setLoading(false);
      const fields = fieldMessages(err);
      setErrs(fields);
      if (Object.keys(fields).length === 0) setFormError(humanError(err));
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-2 text-accent"
        >
          <KeyRound className="h-5 w-5" />
        </span>
        <h1 className="font-display text-2xl font-extrabold text-accent-3">
          Elegí una contraseña nueva
        </h1>
        <p className="mt-1 text-sm text-font-strong">
          Un administrador restableció tu clave. Para seguir, reemplazala por una que solo vos
          conozcas.
        </p>
      </div>
      {formError && (
        <p
          role="alert"
          className="rounded-md bg-danger-back px-3 py-2 text-sm font-medium text-danger-text"
        >
          {formError}
        </p>
      )}
      <Input
        label="Contraseña actual (la temporal)"
        type="password"
        autoComplete="current-password"
        required
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={errs.current}
      />
      <Input
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        required
        hint="Mínimo 10 caracteres, combinando letras y números."
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={errs.next}
      />
      <Input
        label="Repetí la contraseña nueva"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errs.confirm}
      />
      <Button type="submit" size="lg" loading={loading} className="w-full">
        Guardar y entrar al panel
      </Button>
    </form>
  );
}
