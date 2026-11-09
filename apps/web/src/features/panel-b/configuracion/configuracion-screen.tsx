/**
 * Pantalla /panel/configuracion (Figma 12-configuracion, RF01, RF05, US-25/26). Solo ADMIN.
 *
 * Arriba, las tres tarjetas del Figma:
 *  - Período académico: ciclo público vigente (solo lectura: se cambia en Horarios, con confirmación)
 *    e "Inscripciones a mesas SIU habilitadas" (`exam_enrollment_open`).
 *  - Datos institucionales (`GET/PUT /settings`): nombre, sigla, dirección, correos, teléfono, redes, pie
 *    y logo (se sube como archivo). Los textos e imágenes de cada página (titular y fotos de Inicio, La
 *    carrera, Ingreso) se editan en "Contenido de páginas" > "Ajustes de la página".
 *    Nada institucional está escrito en el código (ADR-022): todo sale de estos ajustes.
 *  - Seguridad y accesos: "Usuarios del panel". Cada persona se toca y abre su menú (cambiar rol,
 *    restablecer contraseña, desactivar); "Gestionar usuarios" abre la ventana con el alta y la
 *    lista completa. Las acciones y sus reglas viven en `user-actions.tsx`.
 * "Guardar cambios" valida con los esquemas compartidos (zod) y pide confirmación porque los cambios
 * son GLOBALES: impactan en el encabezado y el pie del sitio. Solo se envían los campos modificados.
 * Abajo, dos pestañas: Integraciones (Instagram y correo) y Enlaces de interés. Un botón lleva a "Páginas
 * del sitio" (textos, imágenes y galerías de cada página).
 */
'use client';

import {
  can,
  settingsUpdateInput,
  type Page,
  type PermissionList,
  type SettingKey,
  type SettingsDto,
  type TermDto,
} from '@ifts2/shared';
import { ChevronDown, FileText, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorState,
  Eyebrow,
  Input,
  LoadingRegion,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';
import { ImageSettingField } from './image-setting-field';
import { IntegrationsPanel } from './integrations-panel';
import { LinksEditor } from './links-editor';
import { useUserActions, type PanelUser } from './user-actions';
import { UsersDialog } from './users-dialog';

/** Cuántas personas muestra la tarjeta; el resto se ve en "Gestionar usuarios". */
const CARD_USERS = 6;

/** Iniciales para el círculo de cada persona ("Ana Pérez" -> "AP"). */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

type TextKey = Exclude<SettingKey, 'exam_enrollment_open'>;

/** Campos de texto editables, en el orden y con las etiquetas de la pantalla. */
const TEXT_FIELDS: { key: TextKey; label: string; hint?: string }[] = [
  { key: 'institution_name', label: 'Nombre de la institución' },
  {
    key: 'institution_short',
    label: 'Sigla',
    hint: 'Se usa en el encabezado y en el título de las pestañas.',
  },
  { key: 'address', label: 'Dirección de la sede' },
  { key: 'email_bedelia', label: 'Correo de bedelía' },
  { key: 'email_institutional', label: 'Correo institucional' },
  { key: 'phone', label: 'Teléfono institucional' },
  { key: 'instagram_url', label: 'Dirección de Instagram' },
  { key: 'facebook_url', label: 'Dirección de Facebook' },
  { key: 'footer_text', label: 'Texto del pie de página' },
];

/** Todos los campos de texto de la pantalla (para cargar, comparar y rotular). */
const ALL_FIELDS = TEXT_FIELDS;

const LABELS: Record<string, string> = {
  ...Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.label])),
  exam_enrollment_open: 'Inscripciones a mesas SIU habilitadas',
};

export function ConfiguracionScreen({
  perms,
  instagramResult,
}: {
  perms: PermissionList;
  instagramResult?: 'connected' | 'error';
}) {
  const { toast } = useToast();
  const canSettings = can(perms, 'settings:manage');
  const settings = useResource<SettingsDto>(canSettings ? '/settings' : null);
  const terms = useResource<Page<TermDto>>(canSettings ? '/terms?pageSize=100' : null);
  const users = useResource<Page<PanelUser>>(
    can(perms, 'users:manage') ? '/users?pageSize=100' : null,
  );
  const [form, setForm] = useState<Partial<Record<TextKey, string>>>({});
  const [enrollment, setEnrollment] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const userActions = useUserActions({
    enabled: can(perms, 'users:manage'),
    onChanged: users.reload,
  });

  // Cada vez que llegan datos nuevos, el formulario vuelve a coincidir con lo guardado.
  useResetOn(settings.data, () => {
    if (!settings.data) return;
    const next: Partial<Record<TextKey, string>> = {};
    for (const f of ALL_FIELDS) next[f.key] = settings.data[f.key] ?? '';
    setForm(next);
    setEnrollment(settings.data.exam_enrollment_open);
    setErrors({});
  });

  /** Solo lo que cambió respecto de lo guardado. */
  const changes = useMemo(() => {
    const out: Record<string, string | boolean> = {};
    if (!settings.data) return out;
    for (const f of ALL_FIELDS) {
      const now = (form[f.key] ?? '').trim();
      if (now !== (settings.data[f.key] ?? '')) out[f.key] = now;
    }
    if (enrollment !== settings.data.exam_enrollment_open) out.exam_enrollment_open = enrollment;
    return out;
  }, [form, enrollment, settings.data]);
  const changedKeys = Object.keys(changes);

  function requestSave() {
    if (!canSettings) return;
    // Validación con los mismos esquemas que usa la API: mensajes iguales, sin ida y vuelta.
    const parsed = settingsUpdateInput.safeParse(changes);
    if (!parsed.success) {
      const next: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '_');
        (next[key] ??= []).push(issue.message);
      }
      setErrors(next);
      toast({ tone: 'error', title: 'Revisá los campos marcados antes de guardar.' });
      return;
    }
    setErrors({});
    setConfirmOpen(true);
  }

  const publicTerm = terms.data?.items.find((t) => t.publicCurrent);
  const canUsers = can(perms, 'users:manage');
  const canIntegrations = can(perms, 'integrations:manage');
  // Solo dos pestañas, en este orden (ADR-041): los textos de las páginas, las galerías y el plantel
  // tienen su propia pantalla en el menú lateral y no se repiten acá.
  const tabs = [
    { value: 'integraciones', label: 'Integraciones', allowed: canIntegrations },
    { value: 'enlaces', label: 'Enlaces de interés', allowed: can(perms, 'links:manage') },
  ].filter((tab) => tab.allowed);

  return (
    <div>
      <PageHeader
        title="Configuración del sitio y sede"
        description="Administrá los parámetros globales, la información edilicia y los usuarios del panel."
        action={
          canSettings && (
            <Button onClick={requestSave} disabled={changedKeys.length === 0}>
              Guardar cambios
            </Button>
          )
        }
      />

      {canSettings && settings.status === 'loading' && (
        <LoadingRegion label="Cargando configuración">
          {/* Imita la forma real de las tarjetas (rótulo, título y renglones) en vez de bloques lisos. */}
          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="mt-2 h-10" />
              <Skeleton className="h-10" />
            </Card>
            <Card className="flex flex-col gap-3 lg:col-span-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-6 w-1/2" />
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
            </Card>
          </div>
        </LoadingRegion>
      )}
      {canSettings && settings.status === 'error' && !settings.data && (
        <ErrorState onRetry={settings.reload} description={errorText(settings.error)} />
      )}

      {(settings.data || canUsers) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {canSettings && settings.data && (
            <>
              <Card className="flex flex-col gap-4" role="region" aria-labelledby="card-period">
                <div>
                  <Eyebrow>Período académico</Eyebrow>
                  <h2 id="card-period" className="font-display text-lg font-bold text-accent-3">
                    Ciclo activo en cartelera
                  </h2>
                </div>
                <div className="border-t border-accent-2 pt-3">
                  <p className="text-sm font-semibold text-accent-3">Ciclo lectivo público</p>
                  <p className="text-sm text-font-strong" data-testid="cfg-public-term">
                    {terms.status === 'loading'
                      ? 'Cargando…'
                      : (publicTerm?.label ?? 'Sin definir')}
                  </p>
                  {can(perms, 'terms:setPublic') && (
                    <Link
                      href="/panel/horarios"
                      className="mt-1 inline-block text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      Cambiarlo en Horarios
                    </Link>
                  )}
                </div>
                <div className="border-t border-accent-2 pt-3">
                  <Checkbox
                    label="Inscripciones a mesas SIU habilitadas"
                    hint="Se muestra en el sitio como inscripción abierta."
                    checked={enrollment}
                    onCheckedChange={setEnrollment}
                  />
                </div>
              </Card>

              <Card
                className="flex flex-col gap-4 lg:col-span-2"
                role="region"
                aria-labelledby="card-inst"
              >
                <div>
                  <Eyebrow>Datos institucionales</Eyebrow>
                  <h2 id="card-inst" className="font-display text-lg font-bold text-accent-3">
                    Sede y canales oficiales
                  </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {TEXT_FIELDS.map((f) => (
                    <Input
                      key={f.key}
                      label={f.label}
                      hint={f.hint}
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                      error={errors[f.key]}
                      className={f.key === 'footer_text' ? 'md:col-span-2' : undefined}
                    />
                  ))}
                  <div className="md:col-span-2">
                    <ImageSettingField
                      settingKey="logo_url"
                      label="Logo del encabezado"
                      hint="Se ve en el encabezado del sitio y del panel. Sin logo se muestran las iniciales de la sigla."
                      value={settings.data.logo_url}
                      onChanged={settings.reload}
                    />
                  </div>
                </div>
              </Card>
            </>
          )}
          {canUsers && (
            <Card
              className="flex flex-col gap-4 lg:col-span-3"
              role="region"
              aria-labelledby="card-sec"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Eyebrow>Seguridad y accesos</Eyebrow>
                  <h2 id="card-sec" className="font-display text-lg font-bold text-accent-3">
                    Usuarios del panel
                  </h2>
                  {users.data && (
                    <p className="text-sm text-font-strong">
                      {users.data.total} {users.data.total === 1 ? 'usuario' : 'usuarios'} ·{' '}
                      {users.data.items.filter((u) => u.active).length} activos. Tocá a una persona
                      para ver sus opciones.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setUsersOpen(true)}>
                    <Users className="h-4 w-4" aria-hidden="true" />
                    Gestionar usuarios
                  </Button>
                  {/* RF11: definir qué puede hacer cada rol es solo del Superadministrador (Q123). */}
                  {can(perms, 'roles:manage') && (
                    <Button asChild variant="ghost">
                      <Link href="/panel/roles">
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        Roles y permisos
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
              {users.status === 'loading' && <Skeleton className="h-16" />}
              {users.status === 'error' && !users.data && (
                <ErrorState onRetry={users.reload} description={errorText(users.error)} />
              )}
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {users.data?.items.slice(0, CARD_USERS).map((u) => (
                  <li key={u.id} data-testid="card-user">
                    <UserTile
                      user={u}
                      isMe={userActions.isMe(u)}
                      blocked={userActions.blockedReason(u)}
                      ready={!!userActions.me.data && !!userActions.roles.data}
                      onAction={(a) => userActions.start(a, u)}
                    />
                  </li>
                ))}
              </ul>
              {users.data && users.data.total > CARD_USERS && (
                <button
                  type="button"
                  onClick={() => setUsersOpen(true)}
                  className="self-start text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
                >
                  Ver los {users.data.total - CARD_USERS} restantes
                </button>
              )}
            </Card>
          )}
        </div>
      )}

      {can(perms, 'content:manage') && (
        <Card className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-display text-lg font-bold text-accent-3">Páginas del sitio</h2>
            <p className="text-sm text-font-strong">
              Cambiá los textos, las imágenes y las galerías de Inicio, Institucional, La carrera,
              Estudiantes, Ingreso e Inscripciones.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/panel/paginas">
              <FileText className="h-5 w-5" aria-hidden="true" />
              Editar páginas del sitio
            </Link>
          </Button>
        </Card>
      )}

      {tabs.length > 0 && (
        <Tabs
          key={tabs.map((tab) => tab.value).join(':')}
          defaultValue={instagramResult && canIntegrations ? 'integraciones' : tabs[0]!.value}
          className="mt-10"
        >
          <TabsList aria-label="Más configuración">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="enlaces">
            {can(perms, 'links:manage') && <LinksEditor perms={perms} />}
          </TabsContent>
          {canIntegrations && (
            <TabsContent value="integraciones">
              <IntegrationsPanel instagramResult={instagramResult} />
            </TabsContent>
          )}
        </Tabs>
      )}

      {canSettings && (
        <p className="mt-8 rounded-lg border border-accent-2 bg-surface px-4 py-3 text-sm text-font-strong">
          Los cambios aplicados en los datos de la sede y el período lectivo impactan en el
          encabezado y el pie de página del portal estudiantil.
        </p>
      )}

      {canSettings && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Confirmar cambios globales"
          description="Estos datos se muestran en todo el sitio. ¿Querés guardarlos ahora?"
          details={
            <ul className="list-disc pl-5">
              {changedKeys.map((k) => (
                <li key={k}>{LABELS[k] ?? k}</li>
              ))}
            </ul>
          }
          confirmLabel="Guardar cambios"
          onConfirm={async () => {
            await api.put('/settings', changes);
            toast({ tone: 'success', title: 'Cambios guardados.' });
            settings.reload();
          }}
        />
      )}
      {canUsers && (
        <UsersDialog open={usersOpen} onOpenChange={setUsersOpen} onChanged={users.reload} />
      )}
      {/* Diálogos de las acciones del menú de cada persona (cambiar rol, confirmaciones, clave). */}
      {canUsers && userActions.element}
    </div>
  );
}

/**
 * Una persona en la tarjeta. Si se la puede administrar, toda la ficha es un botón que abre su menú
 * de acciones; si no (es uno mismo o tiene más permisos), se muestra igual pero sin menú y con el
 * motivo.
 */
function UserTile({
  user: u,
  isMe,
  blocked,
  ready,
  onAction,
}: {
  user: PanelUser;
  isMe: boolean;
  blocked: string | null;
  /** Roles y sesión cargados: recién ahí se sabe si se la puede administrar. */
  ready: boolean;
  onAction: (action: 'role' | 'reset' | 'deactivate' | 'activate') => void;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-2 text-sm font-bold text-accent-3"
      >
        {initials(u.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-accent-3">{u.name}</span>
        {/* "vos" va con el rol (no con el nombre) para que no se corte en nombres largos. */}
        <span className="block truncate text-xs text-font-strong">
          {u.roleName}
          {isMe && ' · vos'}
        </span>
      </span>
      <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Desactivado'}</Badge>
    </>
  );
  const box =
    'flex w-full items-center gap-3 rounded-lg border border-accent-2 bg-base px-3 py-2 text-left';

  if (!ready || blocked) {
    return (
      <div className={box} title={blocked ?? undefined}>
        {body}
        {blocked && <span className="sr-only">{blocked}</span>}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${box} min-h-14 hover:border-primary-strong focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:border-primary-strong`}
        >
          <span className="sr-only">Opciones de </span>
          {body}
          <ChevronDown className="h-4 w-4 shrink-0 text-font-strong" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent label={u.email}>
        {u.active && (
          <>
            <DropdownMenuItem onSelect={() => onAction('role')}>Cambiar rol</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction('reset')}>
              Restablecer contraseña
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {u.active ? (
          <DropdownMenuItem tone="danger" onSelect={() => onAction('deactivate')}>
            Desactivar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onAction('activate')}>Reactivar</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
