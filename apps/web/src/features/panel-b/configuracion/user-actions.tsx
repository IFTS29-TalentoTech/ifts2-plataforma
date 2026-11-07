/**
 * Acciones sobre UN usuario (US-26, RF11): cambiar rol, restablecer contraseña, desactivar y
 * reactivar. Las usan el menú de cada persona en la tarjeta "Usuarios del panel" de Configuración y la
 * ventana "Usuarios y roles": un solo lugar con las reglas, para que ambas pantallas se comporten igual.
 *
 * Reglas (las aplica la API; acá se reflejan para no ofrecer lo que no se puede hacer):
 * - Sobre el propio usuario no hay acciones: no se puede desactivar a uno mismo (422) y cambiarse el
 *   rol podría dejar al sistema sin Superadministrador (409).
 * - Solo se administra a quien tiene un rol que uno puede asignar (`assignable` de `GET /roles`,
 *   anti-escalada): a un usuario con más permisos lo administra un Superadministrador (403).
 * - Toda acción pasa por el <ConfirmDialog> único. Cambiar el rol tiene antes un formulario que
 *   muestra qué permite el rol elegido; al guardarlo, la API cierra las sesiones de esa persona.
 * - Restablecer la contraseña genera una clave temporal que se muestra UNA sola vez.
 */
'use client';

import type { Action } from '@ifts2/shared';
import { Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, ConfirmDialog, Dialog, Select, useToast } from '@/components/ui';
import { api } from '@/lib/api';
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

/** Lo que hace falta de `GET /roles`. */
export interface RoleOption {
  id: string;
  key: string;
  name: string;
  description: string | null;
  assignable: boolean;
}

export type UserAction = 'role' | 'reset' | 'deactivate' | 'activate';

type Pending =
  | { type: 'deactivate' | 'activate' | 'reset'; user: PanelUser }
  | { type: 'role'; user: PanelUser; role: RoleOption }
  | null;

/**
 * Carga roles y sesión (solo si `enabled`) y devuelve:
 * - `can(user)`: si se le ofrecen acciones a esa persona (y por qué no, en `blockedReason`);
 * - `start(acción, user)`: abre el formulario o la confirmación correspondiente;
 * - `element`: los diálogos, para montarlos una vez en la pantalla.
 */
export function useUserActions({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  /** Se llama después de cada cambio guardado (para recargar listas). */
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const roles = useResource<{ items: RoleOption[] }>(enabled ? '/roles' : null);
  const me = useResource<{ id: string; permissions: Action[] }>(enabled ? '/auth/me' : null);

  const allRoles = roles.data?.items ?? [];
  const assignable = allRoles.filter((r) => r.assignable);
  const roleOptions = assignable.map((r) => ({ value: r.id, label: r.name }));
  const canAssignId = new Set(assignable.map((r) => r.id));

  const [pending, setPending] = useState<Pending>(null);
  const [lastPending, setLastPending] = useState<Pending>(null);
  const [roleEdit, setRoleEdit] = useState<{ user: PanelUser; roleId: string } | null>(null);
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  if (pending && pending !== lastPending) setLastPending(pending);
  const p = pending ?? lastPending; // conserva el contenido mientras se cierra la confirmación

  const isMe = (u: PanelUser) => u.id === me.data?.id;
  const manageable = (u: PanelUser) => !isMe(u) && canAssignId.has(u.roleId);
  /** Texto que explica por qué no hay acciones (o `null` si las hay). */
  const blockedReason = (u: PanelUser): string | null =>
    isMe(u)
      ? 'Es tu usuario: no podés desactivarte ni cambiarte el rol desde acá.'
      : canAssignId.has(u.roleId)
        ? null
        : 'Tiene más permisos que vos: solo lo administra un Superadministrador.';

  function start(action: UserAction, user: PanelUser) {
    if (action === 'role') setRoleEdit({ user, roleId: user.roleId });
    else setPending({ type: action, user });
  }

  const editingRole = roleEdit ? allRoles.find((r) => r.id === roleEdit.roleId) : undefined;

  const element: ReactNode = (
    <>
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
            onChanged();
          }}
        />
      )}

      {/* La clave temporal se muestra una sola vez: al cerrar este diálogo desaparece. */}
      {secret && (
        <Dialog
          open
          onOpenChange={(o) => !o && setSecret(null)}
          size="sm"
          title="Contraseña restablecida"
          footer={<Button onClick={() => setSecret(null)}>Listo</Button>}
        >
          <TemporaryPassword secret={secret} />
        </Dialog>
      )}
    </>
  );

  return {
    roles,
    me,
    allRoles,
    assignable,
    roleOptions,
    isMe,
    manageable,
    blockedReason,
    start,
    element,
  };
}

/** Muestra la clave temporal una sola vez, con botón "Copiar". */
export function TemporaryPassword({
  secret,
  onDismiss,
}: {
  secret: { who: string; password: string };
  /** Si se pasa, agrega el botón "Ya la anoté". */
  onDismiss?: () => void;
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
        <code className="break-all rounded-md bg-surface px-3 py-2 font-mono text-lg text-accent-3">
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
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Ya la anoté
          </Button>
        )}
      </div>
    </div>
  );
}
