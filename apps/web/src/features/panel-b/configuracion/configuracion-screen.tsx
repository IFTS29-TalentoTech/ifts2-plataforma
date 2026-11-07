/**
 * Pantalla /panel/configuracion (Figma 12-configuracion, RF01, RF05, US-25/26). Solo ADMIN.
 *
 * Arriba, las tres tarjetas del Figma:
 *  - Período académico: ciclo público vigente (solo lectura: se cambia en Horarios, con confirmación)
 *    e "Inscripciones a mesas SIU habilitadas" (`exam_enrollment_open`).
 *  - Datos institucionales (`GET/PUT /settings`): nombre, sigla, dirección, correos, teléfono, redes y pie.
 *    Nada institucional está escrito en el código (ADR-022): todo sale de estos ajustes.
 *  - Seguridad y accesos: resumen de usuarios + modal "Administrar usuarios y roles".
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
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
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
import { ContentEditor } from './content-editor';
import { IntegrationsPanel } from './integrations-panel';
import { LinksEditor } from './links-editor';
import { UsersDialog, type PanelUser } from './users-dialog';

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

const LABELS: Record<string, string> = {
  ...Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, f.label])),
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

  // Cada vez que llegan datos nuevos, el formulario vuelve a coincidir con lo guardado.
  useResetOn(settings.data, () => {
    if (!settings.data) return;
    const next: Partial<Record<TextKey, string>> = {};
    for (const f of TEXT_FIELDS) next[f.key] = settings.data[f.key] ?? '';
    setForm(next);
    setEnrollment(settings.data.exam_enrollment_open);
    setErrors({});
  });

  /** Solo lo que cambió respecto de lo guardado. */
  const changes = useMemo(() => {
    const out: Record<string, string | boolean> = {};
    if (!settings.data) return out;
    for (const f of TEXT_FIELDS) {
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

          {canUsers && (
            <Card
              className="flex flex-col gap-4 lg:col-span-3"
              role="region"
              aria-labelledby="card-sec"
            >
              <div>
                <Eyebrow>Seguridad y accesos</Eyebrow>
                <h2 id="card-sec" className="font-display text-lg font-bold text-accent-3">
                  Administradores del sistema
                </h2>
              </div>
              {users.status === 'loading' && <Skeleton className="h-16" />}
              {users.status === 'error' && !users.data && (
                <ErrorState onRetry={users.reload} description={errorText(users.error)} />
              )}
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {users.data?.items.slice(0, 6).map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-accent-2 bg-base px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-accent-3">{u.name}</p>
                      <p className="truncate text-xs text-font-strong">{u.roleName}</p>
                    </div>
                    <Badge tone={u.active ? 'success' : 'neutral'}>
                      {u.active ? 'Activo' : 'Desactivado'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={() => setUsersOpen(true)}>
                  + Administrar usuarios y roles
                </Button>
                {/* RF11: definir roles y permisos es solo del Superadministrador (Q123). */}
                {can(perms, 'roles:manage') && (
                  <Link
                    href="/panel/roles"
                    className="text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    Roles y permisos
                  </Link>
                )}
              </div>
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
    </div>
  );
}
