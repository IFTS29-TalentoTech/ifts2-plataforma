/**
 * Configuración · modal "Administrar usuarios y roles" (Figma 210:1011, US-25/26, RF01, RF11).
 *
 * Cómo se reparte el trabajo entre pantallas:
 * - QUÉ PUEDE HACER cada rol se define en Panel → Roles y permisos (solo SUPERADMIN).
 * - QUÉ ROL TIENE cada persona se asigna acá.
 *
 * Reglas (04-api.md "Usuarios"):
 * - Permiso `users:manage` (SUPERADMIN y ADMIN). Los usuarios NO se eliminan: se DESACTIVAN (se
 *   conserva la auditoría) y un usuario desactivado no puede ingresar.
 * - Los roles salen de `GET /roles`. El selector ofrece solo los roles con `assignable: true`: quien no
 *   es SUPERADMIN ve solo roles cuyos permisos también tiene, y nunca Superadministrador. A los
 *   usuarios con un rol que no puede asignar no los puede administrar (la API igual responde 403).
 * - Cambiar el rol pasa por un formulario y una confirmación (regla general del proyecto): no se
 *   guarda al tocar el desplegable. Al cambiarlo, la API cierra las sesiones abiertas de esa persona.
 * - Sobre el propio usuario no se ofrecen acciones: no se puede desactivar a uno mismo (422) y
 *   cambiarse el rol podría dejar al sistema sin Superadministrador (409).
 * - Alta con un rol. Sin clave, la API genera una TEMPORAL y obliga a cambiarla: se muestra UNA sola
 *   vez (al cerrar el modal desaparece de la pantalla) y nunca se vuelve a pedir. Restablecer la
 *   contraseña sigue la misma regla.
 * - Correo único: la API responde 409 con `errors.email` y se muestra bajo el campo.
 */
'use client';

import { can, formatDateAR, type Action, type Page } from '@ifts2/shared';
import { Copy, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
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
  /** Clave del rol (SUPERADMIN, ADMIN, BEDELIA, EDITOR o una propia). */
  role: string;
  roleId: string;
  roleName: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Lo que el diálogo necesita de `GET /roles`. */
interface RoleOption {
  id: string;
  key: string;
  name: string;
  description: string | null;
  assignable: boolean;
}

type Pending =
  | { type: 'deactivate' | 'activate' | 'reset'; user: PanelUser }
  | { type: 'role'; user: PanelUser; role: RoleOption }
  | null;

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
  const roles = useResource<{ items: RoleOption[] }>(open ? '/roles' : null);
  // Quién soy: para no ofrecer acciones sobre mi propio usuario y saber si veo "Roles y permisos".
  const me = useResource<{ id: string; permissions: Action[] }>(open ? '/auth/me' : null);

  const allRoles = roles.data?.items ?? [];
  const assignable = allRoles.filter((r) => r.assignable);
  const roleOptions = assignable.map((r) => ({ value: r.id, label: r.name }));
  const canAssignId = new Set(assignable.map((r) => r.id));
  /** Hay roles que esta persona no puede asignar: se le explica por qué no los ve. */
  const restricted = allRoles.length > assignable.length;
  const describe = (id: string) => allRoles.find((r) => r.id === id)?.description ?? undefined;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [chosenRoleId, setChosenRoleId] = useState<string | null>(null);
  // Por defecto, el rol con menos alcance de los conocidos (Bedelía) o el primero asignable.
  const roleId =
    chosenRoleId ?? assignable.find((r) => r.key === 'BEDELIA')?.id ?? assignable[0]?.id ?? '';
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [lastPending, setLastPending] = useState<Pending>(null);
  /** Formulario "Cambiar rol": a quién y qué rol está eligiendo. */
  const [roleEdit, setRoleEdit] = useState<{ user: PanelUser; roleId: string } | null>(null);
  /** Clave temporal visible una sola vez: { para quién, clave }. */
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);

  useResetOn(open, () => {
    if (!open) {
      setSecret(null); // al cerrar el modal la clave temporal desaparece
      setErrors({});
      setFormError(null);
      setRoleEdit(null);
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
        roleId,
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

  const p = pending ?? lastPending;
  const editingRole = roleEdit ? allRoles.find((r) => r.id === roleEdit.roleId) : undefined;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title="Usuarios y roles"
        description="Creá usuarios, asigná a cada uno un rol y desactivalos cuando ya no necesiten entrar. Los usuarios no se eliminan."
        footer={<Button onClick={() => onOpenChange(false)}>Cerrar</Button>}
      >
        <div className="flex flex-col gap-6">
          <form
            onSubmit={create}
            className="flex flex-col gap-3 rounded-lg border border-accent-2 bg-base p-4"
            noValidate
            aria-label="Crear usuario"
          >
            <h3 className="text-sm font-semibold text-accent-3">Nuevo usuario</h3>
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <Select
                label="Rol"
                value={roleId}
                onValueChange={setChosenRoleId}
                options={roleOptions}
                hint={describe(roleId)}
                error={errors.roleId}
              />
              <Button type="submit" loading={saving} className="md:mt-7">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Crear usuario
              </Button>
            </div>
            {formError && Object.keys(errors).length === 0 && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {formError}
              </p>
            )}
            {restricted && (
              <p className="text-xs text-font-strong">
                Solo ves los roles cuyos permisos también tenés vos. El rol Superadministrador lo
                asigna únicamente otro Superadministrador.
              </p>
            )}
            {can(me.data?.permissions, 'roles:manage') && (
              <Link
                href="/panel/roles"
                className="inline-flex items-center gap-1 self-start text-sm font-semibold text-accent underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Ver qué puede hacer cada rol
              </Link>
            )}
          </form>

          {secret && <TemporaryPassword secret={secret} onDismiss={() => setSecret(null)} />}

          <section aria-labelledby="users-list">
            <h3 id="users-list" className="mb-2 text-sm font-semibold text-accent-3">
              Usuarios con acceso al panel
              {users.data && (
                <span className="font-normal text-font-strong"> ({users.data.total})</span>
              )}
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
              {users.data?.items.map((u) => {
                const isMe = u.id === me.data?.id;
                const manageable = !isMe && canAssignId.has(u.roleId);
                return (
                  <li
                    key={u.id}
                    data-testid="user-row"
                    className="flex flex-col gap-3 rounded-lg border border-accent-2 p-4"
                  >
                    {/* Persona y rol en la misma línea: el rol es una etiqueta, no un campo. */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-accent-3">
                          {u.name}
                          {isMe && <span className="font-normal text-font-strong">(vos)</span>}
                          <Badge tone={u.active ? 'success' : 'neutral'}>
                            {u.active ? 'Activo' : 'Desactivado'}
                          </Badge>
                        </p>
                        <p className="break-words text-sm text-font-strong">{u.email}</p>
                        <p className="text-xs text-font-strong">
                          {u.lastLoginAt
                            ? `Último ingreso: ${formatDateAR(u.lastLoginAt)}`
                            : 'Nunca ingresó'}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm text-font-strong sm:text-right">
                        <span className="sr-only">Rol: </span>
                        <Badge>{u.roleName}</Badge>
                      </p>
                    </div>

                    {manageable ? (
                      <div className="flex flex-wrap gap-2 border-t border-accent-2 pt-3">
                        {u.active && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setRoleEdit({ user: u, roleId: u.roleId })}
                            aria-label={`Cambiar rol de ${u.name}`}
                          >
                            Cambiar rol
                          </Button>
                        )}
                        {u.active && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPending({ type: 'reset', user: u })}
                            aria-label={`Restablecer contraseña de ${u.name}`}
                          >
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                            Restablecer contraseña
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
                    ) : (
                      <p className="border-t border-accent-2 pt-3 text-xs text-font-strong">
                        {isMe
                          ? 'Es tu usuario: no podés desactivarte ni cambiarte el rol desde acá.'
                          : 'Tiene más permisos que vos: solo lo administra un Superadministrador.'}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </Dialog>

      {/* Formulario "Cambiar rol": elegir y ver qué implica; guardar pide confirmación. */}
      {roleEdit && (
        <Dialog
          open
          onOpenChange={(o) => !o && setRoleEdit(null)}
          size="sm"
          title="Cambiar rol"
          description={`${roleEdit.user.name} · ${roleEdit.user.email}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRoleEdit(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!editingRole || roleEdit.roleId === roleEdit.user.roleId}
                onClick={() => {
                  if (!editingRole) return;
                  setPending({ type: 'role', user: roleEdit.user, role: editingRole });
                }}
              >
                Guardar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-font-strong">
              Rol actual: <strong className="text-accent-3">{roleEdit.user.roleName}</strong>
            </p>
            <Select
              label="Nuevo rol"
              value={roleEdit.roleId}
              onValueChange={(v) => setRoleEdit({ ...roleEdit, roleId: v })}
              options={roleOptions}
              hint={editingRole?.description ?? undefined}
            />
          </div>
        </Dialog>
      )}

      {p && (
        <ConfirmDialog
          open={!!pending}
          onOpenChange={(o) => !o && setPending(null)}
          tone={p.type === 'deactivate' ? 'danger' : 'primary'}
          title={
            p.type === 'role'
              ? '¿Cambiar el rol?'
              : p.type === 'deactivate'
                ? '¿Desactivar este usuario?'
                : p.type === 'activate'
                  ? '¿Reactivar este usuario?'
                  : '¿Restablecer la contraseña?'
          }
          description={
            p.type === 'role'
              ? `Pasa de ${p.user.roleName} a ${p.role.name}. Se cierran sus sesiones abiertas y al volver a entrar ve solo lo que permite el rol nuevo. Queda en la auditoría.`
              : p.type === 'deactivate'
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
            p.type === 'role'
              ? 'Cambiar rol'
              : p.type === 'deactivate'
                ? 'Desactivar'
                : p.type === 'activate'
                  ? 'Reactivar'
                  : 'Restablecer'
          }
          onConfirm={async () => {
            if (p.type === 'role') {
              await api.patch(`/users/${p.user.id}`, { roleId: p.role.id });
              setRoleEdit(null);
              toast({
                tone: 'success',
                title: `Ahora ${p.user.name} tiene el rol ${p.role.name}.`,
              });
            } else if (p.type === 'reset') {
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
        <code className="rounded-md bg-surface px-3 py-2 font-mono text-lg text-accent-3">
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
