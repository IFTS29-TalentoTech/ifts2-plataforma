/**
 * Pantalla /panel/configuracion (Figma 12-configuracion, RF01, RF05, US-25/26). Solo ADMIN.
 *
 * Arriba, las tres tarjetas del Figma:
 *  - Período académico: ciclo público vigente (solo lectura: se cambia en Horarios, con confirmación)
 *    e "Inscripciones a mesas SIU habilitadas" (`exam_enrollment_open`).
 *  - Datos institucionales (`GET/PUT /settings`): nombre, sigla, dirección, correos, teléfono, redes y pie.
 *    Nada institucional está escrito en el código (ADR-022): todo sale de estos ajustes.
 *  - Seguridad y accesos: "Usuarios del panel". Cada persona se toca y abre su menú (cambiar rol,
 *    restablecer contraseña, desactivar); "Gestionar usuarios" abre la ventana con el alta y la
 *    lista completa. Las acciones y sus reglas viven en `user-actions.tsx`.
 * "Guardar cambios" valida con los esquemas compartidos (zod) y pide confirmación porque los cambios
 * son GLOBALES: impactan en el encabezado y el pie del sitio. Solo se envían los campos modificados.
 * Abajo, pestañas: Contenido de páginas, Enlaces de interés e Integraciones (Instagram y correo).
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
import { ChevronDown, ShieldCheck, Users } from 'lucide-react';
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
  Textarea,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';
import { ContentEditor } from './content-editor';
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

/** Encabezado de Inicio (titular corto + frase institucional como subtítulo; resuelve Q64). */
const HOME_FIELDS: { key: TextKey; label: string; hint?: string }[] = [
  {
    key: 'hero_eyebrow',
    label: 'Rótulo sobre el titular de Inicio',
    hint: 'Ejemplo: Educación pública · Formación técnica. Vacío = se usa el subtítulo institucional.',
  },
  {
    key: 'hero_title',
    label: 'Titular de Inicio',
    hint: 'Título corto y destacado. Vacío = se usa la frase institucional como titular.',
  },
  {
    key: 'tagline',
    label: 'Frase institucional',
    hint: 'Se muestra debajo del titular de Inicio.',
  },
];

/** Imágenes del sitio público: ruta del sitio (/img/...) o dirección https. Vacío = sin imagen. */
const IMAGE_FIELDS: { key: TextKey; label: string; hint?: string }[] = [
  { key: 'logo_url', label: 'Logo del encabezado' },
  { key: 'hero_image_1', label: 'Inicio: imagen principal' },
  { key: 'hero_image_2', label: 'Inicio: imagen secundaria' },
  { key: 'career_image', label: 'La carrera: imagen del perfil' },
  { key: 'ingreso_image', label: 'Ingreso: imagen del encabezado' },
];

/** Galería "Vida en la cocina" de Estudiantes: una tarjeta por línea (ruta | título | descripción). */
const GALLERY_FIELD: { key: TextKey; label: string; hint: string } = {
  key: 'student_gallery',
  label: 'Galería de Estudiantes',
  hint: 'Una tarjeta por línea con este formato: /img/foto.webp | Título | Descripción. Hasta 6.',
};

/** Todos los campos de texto de la pantalla (para cargar, comparar y rotular). */
const ALL_FIELDS = [...TEXT_FIELDS, ...HOME_FIELDS, ...IMAGE_FIELDS, GALLERY_FIELD];

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
  const settings = useResource<SettingsDto>('/settings');
  const terms = useResource<Page<TermDto>>('/terms?pageSize=100');
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

  return (
    <div>
      <PageHeader
        title="Configuración del sitio y sede"
        description="Administrá los parámetros globales, la información edilicia y los usuarios del panel."
        action={
          <Button onClick={requestSave} disabled={changedKeys.length === 0}>
            Guardar cambios
          </Button>
        }
      />

      {settings.status === 'loading' && (
        <LoadingRegion label="Cargando configuración">
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </LoadingRegion>
      )}
      {settings.status === 'error' && !settings.data && (
        <ErrorState onRetry={settings.reload} description={errorText(settings.error)} />
      )}

      {settings.data && (
        <div className="grid gap-4 lg:grid-cols-3">
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
                {terms.status === 'loading' ? 'Cargando…' : (publicTerm?.label ?? 'Sin definir')}
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
            </div>
          </Card>

          <Card
            className="flex flex-col gap-4 lg:col-span-3"
            role="region"
            aria-labelledby="card-sitio"
          >
            <div>
              <Eyebrow>Sitio público</Eyebrow>
              <h2 id="card-sitio" className="font-display text-lg font-bold text-accent-3">
                Encabezado de Inicio e imágenes
              </h2>
              <p className="text-sm text-font-strong">
                Las imágenes son una ruta del sitio (por ejemplo /img/foto.webp) o una dirección
                https completa. Las que vienen cargadas son provisorias hasta tener las del
                instituto.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[...HOME_FIELDS, ...IMAGE_FIELDS].map((f) => (
                <Input
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  error={errors[f.key]}
                  className={f.key === 'tagline' ? 'md:col-span-2' : undefined}
                />
              ))}
              <Textarea
                label={GALLERY_FIELD.label}
                hint={GALLERY_FIELD.hint}
                rows={4}
                value={form[GALLERY_FIELD.key] ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, [GALLERY_FIELD.key]: e.target.value }))}
                error={errors[GALLERY_FIELD.key]}
                className="md:col-span-2"
              />
            </div>
          </Card>

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

      <Tabs defaultValue={instagramResult ? 'integraciones' : 'contenido'} className="mt-10">
        <TabsList aria-label="Más configuración">
          <TabsTrigger value="contenido">Contenido de páginas</TabsTrigger>
          <TabsTrigger value="enlaces">Enlaces de interés</TabsTrigger>
          {canIntegrations && <TabsTrigger value="integraciones">Integraciones</TabsTrigger>}
        </TabsList>
        <TabsContent value="contenido">
          {can(perms, 'content:manage') && <ContentEditor perms={perms} />}
        </TabsContent>
        <TabsContent value="enlaces">
          {can(perms, 'links:manage') && <LinksEditor perms={perms} />}
        </TabsContent>
        {canIntegrations && (
          <TabsContent value="integraciones">
            <IntegrationsPanel instagramResult={instagramResult} />
          </TabsContent>
        )}
      </Tabs>

      <p className="mt-8 rounded-lg border border-accent-2 bg-surface px-4 py-3 text-sm text-font-strong">
        Los cambios aplicados en los datos de la sede y el período lectivo impactan en el encabezado
        y el pie de página del portal estudiantil.
      </p>

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
