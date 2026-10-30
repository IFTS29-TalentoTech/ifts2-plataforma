'use client';

/**
 * Formulario de ingreso al panel (RNF06, ADR-06, E2E-02). Endpoint: POST /auth/login -> 204 + cookie.
 *
 * Decisiones de seguridad que se reflejan en la interfaz:
 *  - 401: mensaje GENÉRICO ("Correo o contraseña incorrectos"); nunca se revela si el correo existe.
 *  - 429: bloqueo tras 5 intentos fallidos en 15 minutos (por IP y por correo): mensaje claro con el plazo.
 *  - "¿Olvidaste tu clave?" no manda correos: la restablece un administrador (ADR-06); se explica en pantalla.
 *  - "Recordar sesión" solo alarga la cookie (14 días en vez de 8 h).
 */
import { HelpCircle, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Input } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { fieldMessages } from '../lib/errors';

export function LoginForm({
  expired,
  loginWindowMinutes = 15,
}: {
  /** Llegó por una sesión vencida (401 en otra pantalla). */
  expired?: boolean;
  loginWindowMinutes?: number;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [help, setHelp] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await api.post('/auth/login', { email, password, remember });
      // El layout del panel decide el destino: Resumen, o el cambio obligatorio de contraseña.
      router.replace('/panel');
      router.refresh();
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError && err.status === 429) {
        setFormError(
          `Demasiados intentos fallidos. Por seguridad, el acceso queda bloqueado unos ${loginWindowMinutes} minutos. Probá de nuevo más tarde o pedile a un administrador que revise tu cuenta.`,
        );
      } else if (err instanceof ApiError && err.status === 401) {
        setFormError('Correo o contraseña incorrectos.');
      } else if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(fieldMessages(err));
      } else if (err instanceof ApiError && err.status === 0) {
        setFormError(err.userMessage);
      } else {
        setFormError(
          'No pudimos iniciar sesión por un problema nuestro. Intentá de nuevo en unos minutos.',
        );
      }
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-2 text-accent"
        >
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="font-display text-2xl font-extrabold text-accent-3">
          Panel de Gestión Académica
        </h1>
        <p className="mt-1 text-sm text-font-strong">
          Acceso restringido para personal directivo, administrativo y de bedelía.
        </p>
      </div>

      {expired && (
        <p
          role="status"
          className="rounded-md bg-warning-back px-3 py-2 text-sm text-warning-strong"
        >
          Tu sesión venció. Ingresá de nuevo para continuar.
        </p>
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
        label="Correo institucional"
        type="email"
        name="email"
        autoComplete="username"
        placeholder="usuario@dominio.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
      />
      <div className="flex flex-col gap-1.5">
        <Input
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <button
          type="button"
          aria-expanded={help}
          aria-controls="ayuda-clave"
          onClick={() => setHelp((v) => !v)}
          className="flex items-center gap-1 self-end rounded-sm text-xs font-medium text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ¿Olvidaste tu clave?
        </button>
        {help && (
          <p id="ayuda-clave" className="rounded-md bg-base px-3 py-2 text-sm text-accent-3">
            Por seguridad, la clave no se recupera por correo: la restablece un administrador del
            sitio. Pedíselo a quien administra el panel; te dará una clave temporal y el sistema te
            pedirá cambiarla al ingresar.
          </p>
        )}
      </div>

      <Checkbox
        label="Recordar sesión en este equipo"
        hint="Solo en equipos personales: la sesión dura 14 días en lugar de 8 horas."
        checked={remember}
        onCheckedChange={(v) => setRemember(v === true)}
      />

      <Button type="submit" size="lg" loading={loading} className="w-full">
        Ingresar al panel
      </Button>
    </form>
  );
}
