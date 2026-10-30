/**
 * Configuración · modal "Administrar usuarios y roles" (Figma 210:1011, US-25/26, RF01).
 *
 * Reglas (04-api.md "Usuarios"):
 * - Solo ADMIN (`users:manage`). Los usuarios NO se eliminan: se DESACTIVAN (se conserva la auditoría)
 *   y un usuario desactivado no puede ingresar.
 * - Alta con rol ADMIN / BEDELIA / EDITOR. Sin clave, la API genera una TEMPORAL y obliga a cambiarla:
 *   se muestra UNA sola vez (al cerrar el modal desaparece de la pantalla) y nunca se vuelve a pedir.
 * - Restablecer contraseña también genera una clave temporal (misma regla).
 * - Correo único: la API responde 409 con `errors.email` y se muestra bajo el campo.
 * - No se puede desactivar a uno mismo ni al último administrador activo (422 con mensaje claro).
 */
'use client';

import { ROLES, ROLE_LABELS, formatDateAR, type Page, type Role } from '@ifts2/shared';
import { Copy, KeyRound, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  ErrorState,
  Input,
  LoadingRegion,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, fieldErrors } from '../lib/format';
import { useResetOn } from '../lib/use-reset-on';
import { useResource } from '../lib/use-resource';

export interface PanelUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

type Pending = { type: 'deactivate' | 'activate' | 'reset'; user: PanelUser } | null;

export function UsersDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Avisa a la pantalla para que refresque el resumen de la tarjeta. */
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const users = useResource<Page<PanelUser>>(open ? '/users?pageSize=100' : null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('BEDELIA');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [lastPending, setLastPending] = useState<Pending>(null);
  /** Clave temporal visible una sola vez: { para quién, clave }. */
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);

  useResetOn(open, () => {
    if (!open) {
      setSecret(null); // al cerrar el modal la clave temporal desaparece
      setErrors({});
      setFormError(null);
    }
  });
  if (pending && pending !== lastPending) setLastPending(pending);

  async function create(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const res = await api.post<{ user: PanelUser; temporaryPassword?: string }>('/users', {
        name: name.trim(),
        email: email.trim(),
        role,
      });
      setName('');
      setEmail('');
      if (res.temporaryPassword) {
        setSecret({ who: res.user.email, password: res.temporaryPassword });
      }
      toast({ tone: 'success', title: `Usuario ${res.user.email} creado.` });
      users.reload();
      onChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(u: PanelUser, next: Role) {
    try {
      await api.patch(`/users/${u.id}`, { role: next });
      toast({ tone: 'success', title: `Ahora ${u.name} es ${ROLE_LABELS[next]}.` });
      users.reload();
      onChanged();
    } catch (err) {
      toast({ tone: 'error', title: errorText(err) });
      users.reload(); // vuelve a mostrar el rol real
    }
  }

  const p = pending ?? lastPending;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title="Gestión de accesos y roles"
        description="Asigná permisos a docentes y administrativos. Los usuarios no se eliminan: se desactivan."
        footer={<Button onClick={() => onOpenChange(false)}>Cerrar</Button>}
      >
        <div className="flex flex-col gap-6">
          <form
            onSubmit={create}
            className="grid gap-3 rounded-lg border border-accent-2 bg-base p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end"
            noValidate
            aria-label="Invitar nuevo usuario"
          >
            <Input
              label="Nombre y apellido"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              required
            />
            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              required
            />
            <Select
              label="Rol"
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              options={ROLE_OPTIONS}
              error={errors.role}
            />
            <Button type="submit" loading={saving}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Crear usuario
            </Button>
            {formError && Object.keys(errors).length === 0 && (
              <p role="alert" className="text-sm font-medium text-danger-text md:col-span-4">
                {formError}
              </p>
            )}
          </form>

          {secret && <TemporaryPassword secret={secret} onDismiss={() => setSecret(null)} />}

          <section aria-labelledby="users-list">
            <h3 id="users-list" className="mb-2 text-sm font-semibold text-accent-3">
              Usuarios con acceso al panel
            </h3>
            {users.status === 'loading' && (
              <LoadingRegion label="Cargando usuarios">
                <Skeleton className="mb-2 h-16" />
                <Skeleton className="h-16" />
              </LoadingRegion>
            )}
            {users.status === 'error' && !users.data && (
              <ErrorState onRetry={users.reload} description={errorText(users.error)} />
            )}
            <ul className="flex flex-col gap-2">
              {users.data?.items.map((u) => (
                <li
                  key={u.id}
                  data-testid="user-row"
                  className="flex flex-col gap-3 rounded-lg border border-accent-2 p-3 md:flex-row md:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-accent-3">
                      {u.name}
                      <Badge tone={u.active ? 'success' : 'neutral'}>
                        {u.active ? 'Activo' : 'Desactivado'}
                      </Badge>
                    </p>
                    <p className="break-all text-sm text-font-strong">{u.email}</p>
                    <p className="text-xs text-font-strong">
                      {u.lastLoginAt
                        ? `Último ingreso: ${formatDateAR(u.lastLoginAt)}`
                        : 'Nunca ingresó'}
                    </p>
                  </div>
                  <Select
                    className="md:w-56"
                    label={`Rol de ${u.name}`}
                    value={u.role}
                    disabled={!u.active}
                    onValueChange={(v) => changeRole(u, v as Role)}
                    options={ROLE_OPTIONS}
                  />
                  <div className="flex flex-wrap gap-2 md:self-end">
                    {u.active && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPending({ type: 'reset', user: u })}
                        aria-label={`Restablecer contraseña de ${u.name}`}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                        Restablecer clave
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPending({ type: u.active ? 'deactivate' : 'activate', user: u })
                      }
                      aria-label={`${u.active ? 'Desactivar' : 'Reactivar'} a ${u.name}`}
                    >
                      {u.active ? 'Desactivar' : 'Reactivar'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Dialog>

      {p && (
        <ConfirmDialog
          open={!!pending}
          onOpenChange={(o) => !o && setPending(null)}
          tone={p.type === 'deactivate' ? 'danger' : 'primary'}
          title={
            p.type === 'deactivate'
              ? '¿Desactivar este usuario?'
              : p.type === 'activate'
                ? '¿Reactivar este usuario?'
                : '¿Restablecer la contraseña?'
          }
          description={
            p.type === 'deactivate'
              ? 'No va a poder ingresar al panel. Sus datos y su historial se conservan.'
              : p.type === 'activate'
                ? 'Vuelve a poder ingresar al panel con su contraseña.'
                : 'Se genera una clave temporal que se muestra una sola vez. La persona tendrá que cambiarla al ingresar.'
          }
          details={
            <>
              <strong>{p.user.name}</strong> · {p.user.email}
            </>
          }
          confirmLabel={
            p.type === 'deactivate'
              ? 'Desactivar'
              : p.type === 'activate'
                ? 'Reactivar'
                : 'Restablecer'
          }
          onConfirm={async () => {
            if (p.type === 'reset') {
              const r = await api.post<{ temporaryPassword: string }>(
                `/users/${p.user.id}/reset-password`,
              );
              setSecret({ who: p.user.email, password: r.temporaryPassword });
            } else {
              await api.post(`/users/${p.user.id}/${p.type}`);
              toast({
                tone: 'success',
                title: p.type === 'deactivate' ? 'Usuario desactivado.' : 'Usuario reactivado.',
              });
            }
            users.reload();
            onChanged();
          }}
        />
      )}
    </>
  );
}

/** Muestra la clave temporal una sola vez, con botón "Copiar". */
function TemporaryPassword({
  secret,
  onDismiss,
}: {
  secret: { who: string; password: string };
  onDismiss: () => void;
}) {
  const { toast } = useToast();
  return (
    <div
      role="status"
      data-testid="temp-password"
      className="rounded-lg border border-warning-strong bg-warning-back p-4 text-sm text-warning-strong"
    >
      <p className="font-semibold">Clave temporal para {secret.who}</p>
      <p className="mt-1">
        Anotala o copiala ahora: <strong>no se vuelve a mostrar</strong>. La persona deberá
        cambiarla al ingresar.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-surface px-3 py-2 font-mono text-base text-accent-3">
          {secret.password}
        </code>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            navigator.clipboard
              .writeText(secret.password)
              .then(() => toast({ tone: 'success', title: 'Clave copiada.' }))
              .catch(() =>
                toast({ tone: 'error', title: 'No pudimos copiar. Seleccionala a mano.' }),
              )
          }
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Ya la anoté
        </Button>
      </div>
    </div>
  );
}
