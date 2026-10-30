/**
 * Configuración · Integraciones · Instagram (ADR-020, solo ADMIN).
 *
 * El CLIENTE crea su propia app de Meta y carga acá las credenciales; no hay que tocar código ni
 * variables de entorno. Reglas que implementa esta tarjeta:
 * - El App Secret NUNCA se muestra: la API solo devuelve una máscara y acá no existe ningún camino
 *   para leerlo. El campo es de contraseña, vive solo en el estado del formulario y se vacía al guardar.
 *   Para cambiarlo hay que pulsar "Reemplazar".
 * - Estados (`status`): demo (sin configurar) · credentials_saved (falta conectar) · connected ·
 *   expiring (token por vencer) · error (con motivo). La API los calcula; acá solo se muestran.
 * - Conectar: `GET /integrations/instagram/connect` devuelve la URL de autorización OAuth y se redirige.
 *   Meta vuelve al callback de la API, que guarda el token cifrado y regresa a
 *   `/panel/configuracion?instagram=connected|error`.
 * - Alternativa sin OAuth: pegar un token de larga duración (`accessToken`).
 * - "Desconectar" borra credenciales y token y vuelve a modo demostración (pide confirmación).
 * - La `redirectUri` es la dirección EXACTA que el cliente debe registrar en su app de Meta.
 * - Nada de redes llega al sitio sin aprobación humana, con o sin conexión (la moderación vive en Publicaciones).
 */
'use client';

import { INSTAGRAM_SETUP_GUIDE, formatDateTimeAR } from '@ifts2/shared';
import { Copy, Camera, Link2, PlugZap, Unplug } from 'lucide-react';
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
  type BadgeTone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, fieldErrors } from '../lib/format';
import { useResource } from '../lib/use-resource';

export interface InstagramView {
  status: 'demo' | 'credentials_saved' | 'connected' | 'expiring' | 'error';
  statusLabel: string;
  demoMode: boolean;
  mode: 'demo' | 'real';
  source: 'panel' | 'env' | 'none';
  appIdMasked: string | null;
  appSecretMasked: string | null;
  hasAccessToken: boolean;
  accessTokenMasked: string | null;
  username: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastError: string | null;
  hashtag: string | null;
  redirectUri: string;
  scopes: readonly string[];
}

const TONES: Record<InstagramView['status'], BadgeTone> = {
  demo: 'neutral',
  credentials_saved: 'warning',
  connected: 'success',
  expiring: 'warning',
  error: 'danger',
};

export function InstagramCard({ result }: { result?: 'connected' | 'error' }) {
  const { toast } = useToast();
  const view = useResource<InstagramView>('/integrations/instagram');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [hashtag, setHashtag] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [replaceSecret, setReplaceSecret] = useState(false);
  const [replaceId, setReplaceId] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'test' | 'token' | null>(null);
  const [probe, setProbe] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const v = view.data;
  const hasId = !!v?.appIdMasked;
  const hasSecret = !!v?.appSecretMasked;

  async function save(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const body: Record<string, unknown> = {};
    if (appId.trim()) body.appId = appId.trim();
    if (appSecret.trim()) body.appSecret = appSecret.trim();
    const tag = hashtag ?? v?.hashtag ?? '';
    if (hashtag !== null && tag.trim() !== (v?.hashtag ?? '')) body.hashtag = tag.trim();
    // Al cargar credenciales se pasa a modo real; el hashtag solo no cambia el modo.
    if (body.appId || body.appSecret) body.mode = 'real';
    if (Object.keys(body).length === 0) {
      setFormError('No hay cambios para guardar.');
      return;
    }
    setSaving(true);
    try {
      await api.put('/integrations/instagram', body);
      setAppId('');
      setAppSecret(''); // el secreto no queda en pantalla ni en el estado
      setReplaceId(false);
      setReplaceSecret(false);
      setHashtag(null);
      toast({ tone: 'success', title: 'Configuración de Instagram guardada.' });
      view.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function connect() {
    setBusy('connect');
    setFormError(null);
    try {
      const { url } = await api.get<{ url: string }>('/integrations/instagram/connect', {
        cache: 'no-store',
      });
      window.location.assign(url); // Meta pide el permiso y vuelve al callback de la API
    } catch (err) {
      setFormError(errorText(err));
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setProbe(null);
    try {
      const r = await api.post<{
        ok: boolean;
        demo: boolean;
        username: string | null;
        error: string | null;
      }>('/integrations/instagram/test');
      setProbe(
        r.ok
          ? r.demo
            ? 'Prueba correcta en modo demostración (no se contactó a Instagram).'
            : `Conexión correcta${r.username ? ` con @${r.username}` : ''}.`
          : `No se pudo conectar: ${r.error ?? 'error desconocido'}.`,
      );
      view.reload();
    } catch (err) {
      setProbe(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveToken() {
    setBusy('token');
    setErrors({});
    try {
      await api.put('/integrations/instagram', { accessToken: token.trim() });
      setToken('');
      toast({ tone: 'success', title: 'Token guardado.' });
      view.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast({ tone: 'success', title: 'Copiado.' }))
      .catch(() => toast({ tone: 'error', title: 'No pudimos copiar. Seleccionalo a mano.' }));
  }

  return (
    <Card accentBar className="flex flex-col gap-5" aria-labelledby="ig-title" role="region">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="ig-title"
          className="flex items-center gap-2 font-display text-lg font-bold text-accent-3"
        >
          <Camera className="h-5 w-5" aria-hidden="true" />
          Instagram
        </h3>
        {v && (
          <Badge tone={TONES[v.status]} data-testid="ig-status">
            {v.statusLabel}
          </Badge>
        )}
      </div>

      {result === 'connected' && (
        <p role="status" className="rounded-md bg-success-back px-3 py-2 text-sm text-success-text">
          Listo: la cuenta de Instagram quedó conectada.
        </p>
      )}
      {result === 'error' && (
        <p role="alert" className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text">
          No se pudo completar la conexión con Instagram. Revisá las credenciales e intentá de
          nuevo.
        </p>
      )}

      {view.status === 'loading' && (
        <LoadingRegion label="Cargando Instagram">
          <Skeleton className="h-32" />
        </LoadingRegion>
      )}
      {view.status === 'error' && !v && (
        <ErrorState onRetry={view.reload} description={errorText(view.error)} />
      )}

      {v && (
        <>
          {v.demoMode && (
            <p
              role="status"
              className="rounded-md border border-warning-strong bg-warning-back px-3 py-2 text-sm text-warning-strong"
            >
              Modo demostración: el sitio funciona con publicaciones de ejemplo. Cargá las
              credenciales de tu app de Meta para conectar la cuenta real del instituto.
            </p>
          )}
          {v.lastError && (
            <p
              role="alert"
              className="rounded-md bg-danger-back px-3 py-2 text-sm text-danger-text"
            >
              {v.lastError}
            </p>
          )}

          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <Info label="Cuenta conectada" value={v.username ? `@${v.username}` : '—'} />
            <Info
              label="El token vence"
              value={v.tokenExpiresAt ? formatDateTimeAR(v.tokenExpiresAt) : '—'}
            />
            <Info
              label="Última sincronización"
              value={
                v.lastSyncAt
                  ? `${formatDateTimeAR(v.lastSyncAt)}${v.lastSyncOk === false ? ' (con error)' : ''}`
                  : '—'
              }
            />
          </dl>

          <div className="flex flex-col gap-2 rounded-lg border border-accent-2 bg-base p-4">
            <p className="text-sm font-semibold text-accent-3">
              Dirección de redirección (registrala en tu app de Meta)
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <code
                data-testid="redirect-uri"
                className="flex-1 break-all rounded-md border border-accent-2 bg-surface px-3 py-2 font-mono text-sm text-accent-3"
              >
                {v.redirectUri}
              </code>
              <Button variant="secondary" onClick={() => copy(v.redirectUri)}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar
              </Button>
            </div>
            <p className="text-xs text-font-strong">
              Permisos requeridos: <strong>{v.scopes.join(', ')}</strong>
            </p>
          </div>

          <form
            onSubmit={save}
            className="flex flex-col gap-4"
            noValidate
            aria-label="Credenciales de Instagram"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <SecretField
                label="App ID"
                masked={hasId ? v.appIdMasked : null}
                replacing={replaceId}
                onReplace={() => setReplaceId(true)}
                value={appId}
                onChange={setAppId}
                error={errors.appId}
                type="text"
              />
              <SecretField
                label="App Secret"
                masked={hasSecret ? v.appSecretMasked : null}
                replacing={replaceSecret}
                onReplace={() => setReplaceSecret(true)}
                value={appSecret}
                onChange={setAppSecret}
                error={errors.appSecret}
                type="password"
                hint="Se guarda cifrado y no se vuelve a mostrar."
              />
            </div>
            <Input
              label="Hashtag de selección"
              hint="Solo se detectan publicaciones que lo incluyan. Ejemplo: #ifts2"
              value={hashtag ?? v.hashtag ?? ''}
              onChange={(e) => setHashtag(e.target.value)}
              error={errors.hashtag}
              autoComplete="off"
            />
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
                Guardar credenciales
              </Button>
              <Button
                variant="secondary"
                onClick={connect}
                loading={busy === 'connect'}
                disabled={v.status === 'demo'}
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Conectar con Instagram
              </Button>
              <Button variant="secondary" onClick={test} loading={busy === 'test'}>
                <PlugZap className="h-4 w-4" aria-hidden="true" />
                Probar conexión
              </Button>
              {v.status !== 'demo' && (
                <Button variant="ghost" onClick={() => setDisconnectOpen(true)}>
                  <Unplug className="h-4 w-4" aria-hidden="true" />
                  Desconectar
                </Button>
              )}
            </div>
            {v.status === 'demo' && (
              <p className="text-xs text-font-strong">
                Guardá primero el App ID y el App Secret para poder conectar la cuenta.
              </p>
            )}
            {probe && (
              <p role="status" data-testid="ig-probe" className="text-sm text-accent-3">
                {probe}
              </p>
            )}
          </form>

          <details className="rounded-lg border border-accent-2 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-accent-3 focus-visible:outline-none focus-visible:shadow-focus">
              Alternativa: pegar un token de acceso
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-font-strong">{INSTAGRAM_SETUP_GUIDE.manualTokenNote}</p>
              {v.hasAccessToken && (
                <p className="text-xs text-font-strong">Token guardado: {v.accessTokenMasked}</p>
              )}
              <Input
                label="Token de acceso"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                error={errors.accessToken}
              />
              <div>
                <Button
                  variant="secondary"
                  onClick={saveToken}
                  loading={busy === 'token'}
                  disabled={token.trim().length < 10}
                >
                  Guardar token
                </Button>
              </div>
            </div>
          </details>

          <details className="rounded-lg border border-accent-2 p-4" data-testid="ig-guide">
            <summary className="cursor-pointer text-sm font-semibold text-accent-3 focus-visible:outline-none focus-visible:shadow-focus">
              Cómo obtener estas credenciales
            </summary>
            <div className="mt-3">
              <h4 className="font-display text-lg font-bold text-accent-3">
                {INSTAGRAM_SETUP_GUIDE.title}
              </h4>
              <p className="mt-1 text-sm text-font-strong">{INSTAGRAM_SETUP_GUIDE.intro}</p>
              <ol className="mt-3 flex flex-col gap-3">
                {INSTAGRAM_SETUP_GUIDE.steps.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-primary-strong text-sm font-bold text-surface"
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-accent-3">{s.title}</p>
                      <p className="text-sm text-font-strong">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-sm text-font-strong">
                {INSTAGRAM_SETUP_GUIDE.manualTokenNote}
              </p>
            </div>
          </details>
        </>
      )}

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        tone="danger"
        title="¿Desconectar Instagram?"
        description="Se borran las credenciales y el token guardados y el sitio vuelve al modo demostración. Las publicaciones ya aprobadas siguen en el sitio."
        confirmLabel="Desconectar"
        onConfirm={async () => {
          await api.post('/integrations/instagram/disconnect');
          setProbe(null);
          toast({ tone: 'success', title: 'Instagram desconectado.' });
          view.reload();
        }}
      />
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-font-strong">{label}</dt>
      <dd className="text-accent-3">{value}</dd>
    </div>
  );
}

/**
 * Campo de credencial: si ya hay una guardada muestra solo la máscara y un botón "Reemplazar";
 * recién al reemplazar aparece el input vacío. Así un valor guardado jamás vuelve a la pantalla.
 */
function SecretField({
  label,
  masked,
  replacing,
  onReplace,
  value,
  onChange,
  error,
  type,
  hint,
}: {
  label: string;
  masked: string | null;
  replacing: boolean;
  onReplace: () => void;
  value: string;
  onChange: (v: string) => void;
  error?: string[];
  type: 'text' | 'password';
  hint?: string;
}) {
  if (masked && !replacing) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-accent-3">{label}</span>
        <div className="flex items-center gap-2">
          <span
            className="flex-1 rounded-md border border-accent-2 bg-base px-3 py-2.5 font-mono text-sm text-accent-3"
            aria-label={`${label} guardado (oculto)`}
          >
            {masked}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={onReplace}
            aria-label={`Reemplazar ${label}`}
          >
            Reemplazar
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Input
      label={label}
      type={type}
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={hint}
    />
  );
}
