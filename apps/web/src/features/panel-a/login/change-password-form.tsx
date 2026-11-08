'use client';

/**
 * Cambio de contraseña. Dos modos:
 * - `forced` (por defecto): cambio OBLIGATORIO (ADR-06). Un administrador restableció la clave y el
 *   usuario debe elegir una propia antes de usar el panel. Mientras `mustChangePassword` esté activo, la
 *   API responde 403 (`password-change-required`) en todo lo demás, y el layout del panel redirige acá.
 *   Al terminar, entra al panel.
 * - `voluntary`: desde "Mi cuenta" (/panel/cuenta), cualquier persona logueada cambia su clave cuando
 *   quiere. Al terminar se queda en la página, con un aviso.
 * Endpoint (el mismo en los dos): POST /auth/change-password { current, next } -> 204. La API cierra las
 * DEMÁS sesiones de la persona (la actual sigue abierta) y lo audita. Reglas de `next`: mínimo 10
 * caracteres, letras y números, distinta de la actual (las valida la API con el esquema compartido; acá
 * se muestran sus respuestas por campo).
 */
import { KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { fieldMessages, humanError } from '../lib/errors';

export function ChangePasswordForm({ mode = 'forced' }: { mode?: 'forced' | 'voluntary' }) {
  const router = useRouter();
  const { toast } = useToast();
  const forced = mode === 'forced';
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
      if (forced) {
        router.replace('/panel');
        router.refresh();
        return;
      }
      setLoading(false);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast({
        tone: 'success',
        title: 'Contraseña cambiada.',
        description: 'Por seguridad cerramos tus otras sesiones abiertas; esta sigue activa.',
      });
    } catch (err) {
      setLoading(false);
      const fields = fieldMessages(err);
      setErrs(fields);
      if (Object.keys(fields).length === 0) setFormError(humanError(err));
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
      aria-label={forced ? undefined : 'Cambiar contraseña'}
    >
      {forced && (
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
      )}
      {formError && (
        <p
          role="alert"
          className="rounded-md bg-danger-back px-3 py-2 text-sm font-medium text-danger-text"
        >
          {formError}
        </p>
      )}
      <Input
        label={forced ? 'Contraseña actual (la temporal)' : 'Contraseña actual'}
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
      {forced ? (
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Guardar y entrar al panel
        </Button>
      ) : (
        <Button type="submit" loading={loading} className="self-start">
          Cambiar contraseña
        </Button>
      )}
    </form>
  );
}
