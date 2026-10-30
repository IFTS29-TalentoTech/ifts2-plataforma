/**
 * Configuración · Integraciones · Correo (ADR-020, solo ADMIN).
 *
 * - Destinatario del formulario de contacto (`contactToEmail`).
 * - SMTP opcional: host, puerto, usuario y contraseña. La API guarda UNA cadena `smtp(s)://usuario:clave@host:puerto`
 *   cifrada; acá se arma desde los campos. La contraseña no se vuelve a mostrar (solo una máscara del servidor).
 *   Sin SMTP el correo funciona en modo demostración (se registra en consola y el sitio no falla).
 * - "Enviar correo de prueba" manda un mensaje al destinatario guardado; si el SMTP falla responde 502 con
 *   un mensaje humano y el sitio sigue funcionando (el formulario de contacto guarda el mensaje igual).
 * - Pendiente (Q100): la API todavía no guarda un "remitente" propio.
 */
'use client';

import { Mail, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Input,
  LoadingRegion,
  Skeleton,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';

interface MailView {
  provider: 'console' | 'smtp';
  source: string;
  demoMode: boolean;
  contactToEmail: string | null;
  smtpConfigured: boolean;
  smtpMasked: string | null;
}

/** smtps si el puerto es 465 (TLS implícito); si no, smtp (STARTTLS). */
function buildSmtpUrl(host: string, port: string, user: string, pass: string): string {
  const scheme = port === '465' ? 'smtps' : 'smtp';
  const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : '';
  return `${scheme}://${auth}${host}:${port}`;
}

export function MailCard() {
  const { toast } = useToast();
  const view = useResource<MailView>('/integrations/mail');
  const v = view.data;
  const [to, setTo] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  useResetOn(v, () => {
    if (v) setTo(v.contactToEmail ?? '');
  });

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const body: Record<string, unknown> = {};
    if (to.trim() !== (v?.contactToEmail ?? '')) body.contactToEmail = to.trim();
    const anySmtp = host.trim() || user.trim() || pass;
    if (anySmtp) {
      const local: Record<string, string[]> = {};
      if (!host.trim()) local.host = ['Escribí el servidor SMTP (host).'];
      if (!/^\d{2,5}$/.test(port.trim()))
        local.port = ['El puerto debe ser un número, por ejemplo 587.'];
      if (user.trim() && !pass) local.pass = ['Escribí la contraseña del usuario SMTP.'];
      if (Object.keys(local).length) {
        setErrors(local);
        return;
      }
      body.smtpUrl = buildSmtpUrl(host.trim(), port.trim(), user.trim(), pass);
    }
    if (Object.keys(body).length === 0) {
      setFormError('No hay cambios para guardar.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/integrations/mail', body);
      setPass(''); // la contraseña no queda en pantalla
      setHost('');
      setUser('');
      toast({ tone: 'success', title: 'Configuración de correo guardada.' });
      view.reload();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors({
        ...fe,
        host: fe.smtpUrl ?? [],
        ...(fe.contactToEmail ? { to: fe.contactToEmail } : {}),
      });
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setProbe(null);
    try {
      const r = await api.post<{ ok: boolean; demo: boolean }>('/integrations/mail/test');
      setProbe(
        r.demo
          ? 'Prueba registrada en modo demostración: no se envió un correo real porque falta el SMTP.'
          : `Correo de prueba enviado a ${v?.contactToEmail ?? 'el destinatario'}.`,
      );
    } catch (err) {
      setProbe(errorText(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card accentBar className="flex flex-col gap-5" role="region" aria-labelledby="mail-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="mail-title"
          className="flex items-center gap-2 font-display text-lg font-bold text-accent-3"
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
          Correo
        </h3>
        {v && (
          <Badge tone={v.smtpConfigured ? 'success' : 'neutral'} data-testid="mail-status">
            {v.smtpConfigured ? 'SMTP configurado' : 'Modo demostración (sin SMTP)'}
          </Badge>
        )}
      </div>

      {view.status === 'loading' && (
        <LoadingRegion label="Cargando correo">
          <Skeleton className="h-24" />
        </LoadingRegion>
      )}
      {view.status === 'error' && !v && (
        <ErrorState onRetry={view.reload} description={errorText(view.error)} />
      )}

      {v && (
        <form
          onSubmit={save}
          className="flex flex-col gap-4"
          noValidate
          aria-label="Configuración de correo"
        >
          <Input
            label="Destinatario del formulario de contacto"
            type="email"
            hint="Acá llegan las consultas que se envían desde el sitio."
            value={to}
            onChange={(e) => setTo(e.target.value)}
            error={errors.to ?? errors.contactToEmail}
            autoComplete="off"
          />
          <fieldset className="flex flex-col gap-3 rounded-lg border border-accent-2 p-4">
            <legend className="px-1 text-sm font-semibold text-accent-3">
              Servidor SMTP (opcional)
            </legend>
            {v.smtpConfigured && (
              <p className="text-xs text-font-strong">
                Guardado: {v.smtpMasked}. Completá los campos solo si querés reemplazarlo.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <Input
                label="Servidor (host)"
                placeholder="smtp.ejemplo.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                error={errors.host}
                autoComplete="off"
              />
              <Input
                label="Puerto"
                inputMode="numeric"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                error={errors.port}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Usuario"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="off"
              />
              <Input
                label="Contraseña"
                type="password"
                hint="No se vuelve a mostrar después de guardar."
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                error={errors.pass}
                autoComplete="new-password"
              />
            </div>
          </fieldset>
          {formError && (
            <p
              role="alert"
              className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text"
            >
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={saving}>
              Guardar correo
            </Button>
            <Button variant="secondary" onClick={sendTest} loading={testing}>
              <Send className="h-4 w-4" aria-hidden="true" />
              Enviar correo de prueba
            </Button>
            {v.smtpConfigured && (
              <Button variant="ghost" onClick={() => setRemoveOpen(true)}>
                Quitar SMTP
              </Button>
            )}
          </div>
          {probe && (
            <p role="status" data-testid="mail-probe" className="text-sm text-accent-3">
              {probe}
            </p>
          )}
        </form>
      )}

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        tone="danger"
        title="¿Quitar el servidor SMTP?"
        description="El correo vuelve al modo demostración: los mensajes del sitio se guardan pero no se envían por correo."
        confirmLabel="Quitar SMTP"
        onConfirm={async () => {
          await api.put('/integrations/mail', { smtpUrl: null });
          toast({ tone: 'success', title: 'SMTP quitado.' });
          view.reload();
        }}
      />
    </Card>
  );
}
