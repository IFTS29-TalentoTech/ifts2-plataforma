/**
 * Configuración · ventana "Usuarios y roles" (Figma 210:1011, US-25/26, RF01, RF11).
 *
 * Cómo se reparte el trabajo entre pantallas:
 * - QUÉ PUEDE HACER cada rol se define en Panel → Roles y permisos (solo SUPERADMIN).
 * - QUÉ ROL TIENE cada persona se asigna acá o desde el menú de cada persona en la tarjeta
 *   "Usuarios del panel". Las acciones sobre un usuario viven en `user-actions.tsx` (mismas reglas
 *   en los dos lugares).
 *
 * Reglas propias de esta ventana (04-api.md "Usuarios"):
 * - Permiso `users:manage` (SUPERADMIN y ADMIN). Los usuarios NO se eliminan: se DESACTIVAN.
 * - Alta con un rol: el selector ofrece solo los roles con `assignable: true` (quien no es
 *   SUPERADMIN ve solo roles cuyos permisos también tiene, y nunca Superadministrador).
 * - Sin clave, la API genera una TEMPORAL y obliga a cambiarla: se muestra UNA sola vez (al cerrar la
 *   ventana desaparece) y nunca se vuelve a pedir.
 * - Correo único: la API responde 409 con `errors.email` y se muestra bajo el campo.
 */
'use client';

import { can, formatDateAR, type Page } from '@ifts2/shared';
import { KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
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
import { TemporaryPassword, useUserActions, type PanelUser } from './user-actions';

export type { PanelUser } from './user-actions';

export function UsersDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Avisa a la pantalla para que refresque la tarjeta. */
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const users = useResource<Page<PanelUser>>(open ? '/users?pageSize=100' : null);
  const actions = useUserActions({
    enabled: open,
    onChanged: () => {
      users.reload();
      onChanged();
    },
  });
  const { allRoles, assignable, roleOptions } = actions;
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
  /** Clave temporal del usuario recién creado, visible una sola vez. */
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);

  useResetOn(open, () => {
    if (!open) {
      setSecret(null); // al cerrar la ventana la clave temporal desaparece
      setErrors({});
      setFormError(null);
    }
  });

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
            {can(actions.me.data?.permissions, 'roles:manage') && (
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
                const blocked = actions.blockedReason(u);
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
                          {actions.isMe(u) && (
                            <span className="font-normal text-font-strong">(vos)</span>
                          )}
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

                    {blocked ? (
                      <p className="border-t border-accent-2 pt-3 text-xs text-font-strong">
                        {blocked}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2 border-t border-accent-2 pt-3">
                        {u.active && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => actions.start('role', u)}
                            aria-label={`Cambiar rol de ${u.name}`}
                          >
                            Cambiar rol
                          </Button>
                        )}
                        {u.active && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => actions.start('reset', u)}
                            aria-label={`Restablecer contraseña de ${u.name}`}
                          >
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                            Restablecer contraseña
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => actions.start(u.active ? 'deactivate' : 'activate', u)}
                          aria-label={`${u.active ? 'Desactivar' : 'Reactivar'} a ${u.name}`}
                        >
                          {u.active ? 'Desactivar' : 'Reactivar'}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </Dialog>

      {actions.element}
    </>
  );
}
