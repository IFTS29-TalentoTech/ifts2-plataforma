'use client';

/**
 * Formulario de contacto (RF08, RNF08, E2E-14). Envía a `POST /public/contact`.
 *
 * Reglas:
 * - Consentimiento obligatorio (Ley 25.326): sin tildar el aviso no se envía; la API también lo exige.
 * - Campo señuelo `website`: oculto para personas (fuera de pantalla, sin foco ni lectura de pantalla);
 *   un bot que lo completa recibe 201 pero no se guarda nada. No se explica en la interfaz.
 * - Estados: libre -> enviando (botón con `loading`) -> enviado (mensaje en región `status`) o error
 *   (región `alert`, con los errores por campo si la API los devuelve). El texto del mensaje no se
 *   pierde ante un error para poder reintentar.
 * - La API guarda el mensaje aunque falle el correo (RNF03), así que "enviado" no depende del correo.
 */
import { CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Input, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

type Status = 'idle' | 'sending' | 'sent' | 'error';
type Errors = Partial<Record<'name' | 'email' | 'subject' | 'message' | 'consent', string>>;

const REQUIRED: Record<keyof Errors, string> = {
  name: 'Escribí tu nombre.',
  email: 'Escribí tu correo electrónico.',
  subject: 'Escribí el asunto de tu consulta.',
  message: 'Escribí tu consulta.',
  consent: 'Para enviar la consulta tenés que aceptar el aviso de uso de datos personales.',
};

export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const value = (k: string) => String(data.get(k) ?? '').trim();
    const body = {
      name: value('name'),
      email: value('email'),
      subject: value('subject'),
      message: value('message'),
      consent,
      website: value('website'),
    };

    // Validación en línea antes de molestar a la API (la API vuelve a validar todo).
    const found: Errors = {};
    for (const k of ['name', 'email', 'subject', 'message'] as const) {
      if (!body[k]) found[k] = REQUIRED[k];
    }
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      found.email = 'Revisá el correo: tiene que tener el formato nombre@dominio.';
    }
    if (!consent) found.consent = REQUIRED.consent;
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setStatus('sending');
    try {
      await api.post('/public/contact', body);
      form.reset();
      setConsent(false);
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      if (err instanceof ApiError) {
        const fe = err.fieldErrors;
        const mapped: Errors = {};
        for (const k of ['name', 'email', 'subject', 'message', 'consent'] as const) {
          if (fe[k]?.[0]) mapped[k] = fe[k][0];
        }
        setErrors(mapped);
        setFormError(
          err.status === 429
            ? 'Enviaste varias consultas en poco tiempo. Esperá un rato y probá de nuevo.'
            : err.status === 400 && Object.keys(mapped).length > 0
              ? 'Revisá los campos marcados.'
              : err.userMessage,
        );
      } else {
        setFormError('No pudimos enviar tu consulta. Intentá de nuevo en unos minutos.');
      }
    }
  }

  if (status === 'sent') {
    return (
      <div
        role="status"
        className="flex flex-col items-start gap-3 rounded-lg border border-success-text bg-success-back p-6 text-success-text"
      >
        <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        <p className="font-display text-lg font-bold">Recibimos tu consulta</p>
        <p className="text-sm">
          Gracias por escribirnos. Te vamos a responder al correo que indicaste.
        </p>
        <Button variant="secondary" onClick={() => setStatus('idle')}>
          Enviar otra consulta
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-label="Contacto">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="name"
          label="Nombre y apellido"
          autoComplete="name"
          required
          maxLength={120}
          error={errors.name}
        />
        <Input
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          required
          maxLength={254}
          error={errors.email}
        />
      </div>
      <Input name="subject" label="Asunto" required maxLength={160} error={errors.subject} />
      <Textarea
        name="message"
        label="Consulta"
        required
        rows={5}
        maxLength={4000}
        error={errors.message}
      />

      {/* Señuelo anti-spam: fuera de pantalla, sin foco y oculto a lectores de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar este campo
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Checkbox
        label="Acepto que el instituto use mis datos personales solo para responder esta consulta."
        hint="Ley 25.326 de Protección de Datos Personales. Pedimos únicamente los datos necesarios."
        checked={consent}
        onCheckedChange={(v) => setConsent(v === true)}
        required
        error={errors.consent}
      />

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-danger-back px-4 py-3 text-sm font-medium text-danger-text"
        >
          {formError}
        </p>
      )}

      <Button type="submit" loading={status === 'sending'} className="w-full sm:w-fit">
        {status === 'sending' ? 'Enviando…' : 'Enviar consulta'}
      </Button>
    </form>
  );
}
