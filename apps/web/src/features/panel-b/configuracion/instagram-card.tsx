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

import {
  INSTAGRAM_SETUP_GUIDE,
  INSTAGRAM_TOKEN_GUIDE,
  formatDateTimeAR,
  type SetupStep,
} from '@ifts2/shared';
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
  connectionMethod: 'oauth' | 'token';
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
  /** Último fetch EXITOSO y su tipo (ADR-038). */
  lastFetchAt?: string | null;
  lastSyncMode?: 'incremental' | 'full' | null;
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
  // Método elegido en pantalla (null = el guardado). Cambiarlo no toca nada hasta guardar.
  const [methodChoice, setMethodChoice] = useState<'oauth' | 'token' | null>(null);
  const [replaceSecret, setReplaceSecret] = useState(false);
  const [replaceId, setReplaceId] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'test' | 'token' | null>(null);
  const [probe, setProbe] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const v = view.data;
  const savedMethod = v?.connectionMethod ?? 'oauth';
  const method = methodChoice ?? savedMethod;
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

  /** Guarda el método "token": pegar el token alcanza (sin App ID ni Secret) y pasa a modo real. */
  async function saveToken(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const body: Record<string, unknown> = { connectionMethod: 'token' };
    if (token.trim()) body.accessToken = token.trim();
    const tag = hashtag ?? v?.hashtag ?? '';
    if (hashtag !== null && tag.trim() !== (v?.hashtag ?? '')) body.hashtag = tag.trim();
    // Cambiar de OAuth a token (o no tener token todavía) exige pegar uno.
    if (!token.trim() && (savedMethod !== 'token' || !v?.hasAccessToken)) {
      setErrors({ accessToken: ['Pegá el token de acceso.'] });
      return;
    }
    if (!token.trim() && Object.keys(body).length === 1) {
      setFormError('No hay cambios para guardar.');
      return;
    }
    setBusy('token');
    try {
      await api.put('/integrations/instagram', body);
      setToken('');
      setHashtag(null);
      setMethodChoice(null);
      toast({ tone: 'success', title: 'Instagram configurado con el token.' });
      view.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  /** Cambia el método guardado (descarta lo conectado con el otro método). */
  async function switchToOauth() {
    setBusy('token');
    setFormError(null);
    try {
      await api.put('/integrations/instagram', { connectionMethod: 'oauth' });
      setMethodChoice(null);
      toast({ tone: 'success', title: 'Ahora se conecta con inicio de sesión de Meta.' });
      view.reload();
    } catch (err) {
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
              Modo demostración: el sitio funciona con publicaciones de ejemplo. Elegí cómo conectar
              la cuenta real del instituto: con el inicio de sesión de Meta o pegando un token de
              acceso.
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

          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <Info
              label="Cuenta conectada"
              value={v.username ? `@${v.username}` : 'Ninguna todavía'}
            />
            <Info
              label="El token vence"
              value={v.tokenExpiresAt ? formatDateTimeAR(v.tokenExpiresAt) : 'Sin datos todavía'}
            />
            <Info
              label="Última sincronización"
              value={
                v.lastSyncAt
                  ? `${formatDateTimeAR(v.lastSyncAt)}${v.lastSyncOk === false ? ' (con error)' : ''}`
                  : 'Sin datos todavía'
              }
            />
            <Info
              label="Último fetch exitoso"
              value={
                v.lastFetchAt
                  ? `${formatDateTimeAR(v.lastFetchAt)} (${v.lastSyncMode === 'full' ? 'completo' : 'incremental'})`
                  : 'Sin datos todavía'
              }
            />
          </dl>

          <fieldset className="flex flex-col gap-2" data-testid="ig-method">
            <legend className="mb-1 text-sm font-semibold text-accent-3">
              ¿Cómo querés conectar la cuenta?
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              <MethodOption
                value="oauth"
                checked={method === 'oauth'}
                onSelect={() => setMethodChoice('oauth')}
                title="Inicio de sesión de Meta (OAuth)"
                description="Usás el App ID y el App Secret de tu app de Meta; Meta pide permiso y vuelve al sitio. Requiere una dirección pública con HTTPS."
              />
              <MethodOption
                value="token"
                checked={method === 'token'}
                onSelect={() => setMethodChoice('token')}
                title="Token de acceso"
                description="Pegás un token generado en el panel de Meta. No hacen falta App ID ni App Secret y sirve también en un equipo local."
              />
            </div>
            {method !== savedMethod && (
              <p role="status" className="text-xs text-font-strong">
                Hoy está configurado con {savedMethod === 'token' ? 'token' : 'OAuth'}. Al guardar
                con el otro método se descarta la conexión actual.
              </p>
            )}
          </fieldset>

          {method === 'oauth' && savedMethod === 'token' ? (
            <div className="flex flex-col gap-3 rounded-lg border border-accent-2 bg-base p-4">
              <p className="text-sm text-font-strong">
                La cuenta está conectada con un token. Para usar el inicio de sesión de Meta hay que
                cambiar el método: se descarta el token actual y se vuelve a modo demostración hasta
                conectar.
              </p>
              <div>
                <Button variant="secondary" onClick={switchToOauth} loading={busy === 'token'}>
                  Cambiar a OAuth
                </Button>
              </div>
            </div>
          ) : method === 'oauth' ? (
            <>
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
            </>
          ) : null}
          {method === 'token' && (
            <form
              onSubmit={saveToken}
              className="flex flex-col gap-4"
              noValidate
              aria-label="Token de acceso de Instagram"
            >
              <p className="text-sm text-font-strong">
                Pegá acá el token que generaste en Meta. Si todavía no lo tenés, abrí la ayuda de
                más abajo: explica cada paso.
              </p>
              {savedMethod === 'token' && v.hasAccessToken && (
                <p className="text-xs text-font-strong">
                  Token guardado: {v.accessTokenMasked}. Pegá uno nuevo solo si querés reemplazarlo.
                </p>
              )}
              <Input
                label="Token de acceso"
                type="password"
                autoComplete="off"
                hint="Se guarda cifrado y no se vuelve a mostrar."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                error={errors.accessToken}
              />
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
                <Button type="submit" loading={busy === 'token'}>
                  Guardar y conectar
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
              {probe && (
                <p role="status" data-testid="ig-probe" className="text-sm text-accent-3">
                  {probe}
                </p>
              )}
            </form>
          )}

          <SetupGuide key={method} method={method} />
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

/**
 * Guía desplegable de la forma de conexión ELEGIDA: la del inicio de sesión de Meta (App ID y App Secret)
 * o la del token de acceso. Cada opción muestra solo sus pasos (antes se veía siempre la de OAuth).
 * Se remonta al cambiar de opción (`key`), así arranca cerrada. Letra grande y pasos numerados: la usan
 * personas mayores.
 */
function SetupGuide({ method }: { method: 'oauth' | 'token' }) {
  const isToken = method === 'token';
  const guide = isToken ? INSTAGRAM_TOKEN_GUIDE : INSTAGRAM_SETUP_GUIDE;
  return (
    <details
      className="rounded-lg border-2 border-accent-2 p-4"
      data-testid="ig-guide"
      data-method={method}
    >
      <summary className="cursor-pointer text-lg font-semibold text-accent-3 focus-visible:outline-none focus-visible:shadow-focus">
        {isToken
          ? 'Ayuda: cómo conseguir el token de acceso'
          : 'Ayuda: cómo conseguir el App ID y el App Secret'}
      </summary>
      <div className="mt-3">
        <h4 className="font-display text-xl font-bold text-accent-3">{guide.title}</h4>
        <p className="mt-1 text-lg leading-relaxed text-font-strong">{guide.intro}</p>
        <GuideSteps steps={guide.steps} />
        {isToken ? (
          <p className="mt-4 text-lg leading-relaxed text-font-strong">
            {INSTAGRAM_TOKEN_GUIDE.note}{' '}
            <a
              href={INSTAGRAM_TOKEN_GUIDE.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
            >
              Guía oficial de Meta (se abre en otra pestaña)
            </a>
          </p>
        ) : (
          <p className="mt-4 text-lg leading-relaxed text-font-strong">
            {INSTAGRAM_SETUP_GUIDE.manualTokenNote}
          </p>
        )}
      </div>
    </details>
  );
}

function GuideSteps({ steps }: { steps: SetupStep[] }) {
  return (
    <ol className="mt-4 flex flex-col gap-4">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-primary-strong text-lg font-bold text-surface"
          >
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-accent-3">{s.title}</p>
            <p className="text-sm leading-relaxed text-font-strong">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-font-strong">{label}</dt>
      <dd className="text-sm text-accent-3">{value}</dd>
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

/**
 * Opción de método de conexión: radio nativo (teclado y lectores de pantalla) con aspecto de tarjeta.
 * La etiqueta del radio es solo el título; la descripción va aparte y se asocia con aria-describedby
 * (así una etiqueta no repite textos como "App ID" que pertenecen a los campos del formulario).
 */
function MethodOption({
  value,
  checked,
  onSelect,
  title,
  description,
}: {
  /** Identifica la opción y arma los ids (fijos: dos opciones por pantalla). */
  value: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  const id = `ig-method-${value}`;
  return (
    <div
      onClick={onSelect}
      className={
        'flex cursor-pointer gap-3 rounded-lg border p-4 focus-within:shadow-focus ' +
        (checked ? 'border-accent bg-base' : 'border-accent-2 bg-surface hover:bg-base')
      }
    >
      <input
        id={id}
        type="radio"
        name="ig-method"
        checked={checked}
        onChange={onSelect}
        aria-describedby={`${id}-desc`}
        className="mt-1 h-4 w-4 shrink-0 accent-primary-strong"
      />
      <span className="flex flex-col gap-1">
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold text-accent-3">
          {title}
        </label>
        <span id={`${id}-desc`} className="text-xs text-font-strong">
          {description}
        </span>
      </span>
    </div>
  );
}
