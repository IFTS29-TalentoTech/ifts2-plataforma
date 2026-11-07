/**
 * Panel · "Roles y permisos" (RF11, US-36, pantalla 12 sin Figma: Q123).
 *
 * Solo el SUPERADMIN (`roles:manage`). Se arma con componentes del kit: tabla de roles, diálogo con
 * casillas agrupadas por recurso y el ConfirmDialog único. Reglas (las aplica la API; acá se reflejan):
 * - Superadministrador: no se edita ni se elimina; siempre tiene todos los permisos.
 * - Roles del sistema (isSystem): se editan casilla por casilla, pero no se eliminan.
 * - Un rol con usuarios no se elimina: se avisa "Reasigná a los usuarios antes de eliminar el rol".
 * - Guardar y eliminar piden confirmación. Los cambios rigen en el próximo pedido de cada usuario,
 *   sin volver a iniciar sesión. Todo queda en la auditoría.
 * - `roles:manage` no aparece entre las casillas: es exclusivo del Superadministrador.
 */
'use client';

import type { Action, PermissionGroup } from '@ifts2/shared';
import { Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingRegion,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, fieldErrors } from '../lib/format';
import { useResource } from '../lib/use-resource';

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  editable: boolean;
  userCount: number;
  permissions: Action[];
}

/** Borrador del diálogo: `id` null = rol nuevo. */
interface Draft {
  id: string | null;
  name: string;
  description: string;
  permissions: Set<Action>;
  /** Para auditar/guardar solo lo que cambió. */
  original?: RoleDto;
}

type Confirm =
  | { type: 'save'; draft: Draft }
  | { type: 'delete'; role: RoleDto }
  | { type: 'blocked'; role: RoleDto }
  | null;

export function RolesScreen() {
  const { toast } = useToast();
  const roles = useResource<{ items: RoleDto[] }>('/roles');
  const catalog = useResource<{ groups: PermissionGroup[] }>('/permissions');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [lastConfirm, setLastConfirm] = useState<Confirm>(null);
  if (confirm && confirm !== lastConfirm) setLastConfirm(confirm);
  const c = confirm ?? lastConfirm; // mantiene el contenido mientras se cierra el diálogo

  const allActions = (catalog.data?.groups ?? []).flatMap((g) =>
    g.resources.flatMap((r) => r.permissions.map((p) => p.action)),
  );

  function openNew() {
    setErrors({});
    setDraft({ id: null, name: '', description: '', permissions: new Set() });
  }
  function openEdit(role: RoleDto) {
    setErrors({});
    setDraft({
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      permissions: new Set(role.permissions),
      original: role,
    });
  }
  function toggle(action: Action, on: boolean) {
    if (!draft) return;
    const next = new Set(draft.permissions);
    if (on) next.add(action);
    else next.delete(action);
    setDraft({ ...draft, permissions: next });
  }
  function requestSave() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setErrors({ name: ['Escribí un nombre para el rol.'] });
      return;
    }
    setConfirm({ type: 'save', draft });
  }

  async function save(d: Draft) {
    const permissions = allActions.filter((a) => d.permissions.has(a));
    try {
      if (!d.id) {
        await api.post('/roles', {
          name: d.name.trim(),
          description: d.description.trim() || null,
          permissions,
        });
        toast({ tone: 'success', title: `Rol "${d.name.trim()}" creado.` });
      } else {
        const o = d.original!;
        const changes: Record<string, string | null> = {};
        if (d.name.trim() !== o.name) changes.name = d.name.trim();
        if ((d.description.trim() || null) !== o.description)
          changes.description = d.description.trim() || null;
        if (Object.keys(changes).length) await api.patch(`/roles/${d.id}`, changes);
        await api.put(`/roles/${d.id}/permissions`, { permissions });
        toast({ tone: 'success', title: `Permisos de "${d.name.trim()}" guardados.` });
      }
      setDraft(null);
      roles.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      throw err; // el ConfirmDialog muestra el mensaje; el campo queda marcado en el formulario
    }
  }

  const loading = roles.status === 'loading' || catalog.status === 'loading';
  const failed =
    (roles.status === 'error' && !roles.data) || (catalog.status === 'error' && !catalog.data);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-font-strong">
          Cada usuario tiene un rol y puede hacer exactamente lo que ese rol tiene tildado. Los
          cambios rigen desde el próximo clic de cada persona, sin volver a iniciar sesión.
        </p>
        <Button onClick={openNew} disabled={!catalog.data}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo rol
        </Button>
      </div>

      {loading && (
        <LoadingRegion label="Cargando roles">
          <Skeleton className="mb-2 h-12" />
          <Skeleton className="mb-2 h-12" />
          <Skeleton className="h-12" />
        </LoadingRegion>
      )}
      {failed && (
        <ErrorState
          onRetry={() => {
            roles.reload();
            catalog.reload();
          }}
          description={errorText(roles.error ?? catalog.error)}
        />
      )}
      {roles.data && roles.data.items.length === 0 && (
        <EmptyState title="Todavía no hay roles" description="Creá el primero con Nuevo rol." />
      )}
      {roles.data && roles.data.items.length > 0 && (
        <Table caption="Roles del panel y cantidad de usuarios y permisos de cada uno">
          <THead>
            <tr>
              <TH>Rol</TH>
              <TH>Usuarios</TH>
              <TH>Permisos</TH>
              <TH className="text-right">Acciones</TH>
            </tr>
          </THead>
          <TBody>
            {roles.data.items.map((r) => (
              <TR key={r.id} data-testid="role-row">
                <TD>
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {r.name}
                    {r.isSystem && <Badge>Del sistema</Badge>}
                  </p>
                  {r.description && <p className="text-xs text-font-strong">{r.description}</p>}
                </TD>
                <TD>{r.userCount}</TD>
                <TD>
                  {!r.editable
                    ? 'Todos'
                    : r.permissions.length === allActions.length
                      ? `Todos (${r.permissions.length})`
                      : r.permissions.length}
                </TD>
                <TD>
                  <div className="flex flex-wrap justify-end gap-2">
                    {r.editable ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEdit(r)}
                        disabled={!catalog.data}
                        aria-label={`Editar permisos de ${r.name}`}
                      >
                        Editar permisos
                      </Button>
                    ) : (
                      <span className="text-xs text-font-strong">No se edita</span>
                    )}
                    {!r.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Eliminar el rol ${r.name}`}
                        onClick={() =>
                          setConfirm({ type: r.userCount > 0 ? 'blocked' : 'delete', role: r })
                        }
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {draft && catalog.data && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDraft(null)}
          size="lg"
          title={draft.id ? `Permisos de ${draft.original?.name}` : 'Nuevo rol'}
          description="Tildá lo que puede hacer quien tenga este rol. Lo que no está tildado, no lo ve ni lo puede usar."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              <Button onClick={requestSave}>{draft.id ? 'Guardar cambios' : 'Crear rol'}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Nombre"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                error={errors.name}
                required
              />
              <Textarea
                label="Descripción"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                error={errors.description}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-accent-3" aria-live="polite">
                {draft.permissions.size} de {allActions.length} permisos
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDraft({ ...draft, permissions: new Set(allActions) })}
                >
                  Marcar todo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft({ ...draft, permissions: new Set() })}
                >
                  Quitar todo
                </Button>
              </div>
            </div>
            {errors.permissions && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {errors.permissions[0]}
              </p>
            )}

            {catalog.data.groups.map((g) => (
              <fieldset key={g.title} className="rounded-lg border border-accent-2">
                <legend className="ml-3 px-1 text-xs font-semibold uppercase tracking-wider text-font-strong">
                  {g.title}
                </legend>
                <ul className="divide-y divide-accent-2">
                  {g.resources.map((r) => (
                    <li
                      key={r.resource}
                      className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-accent-3">{r.label}</p>
                        <p className="text-xs text-font-strong">{r.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {r.permissions.map((p) => (
                          <Checkbox
                            key={p.action}
                            checked={draft.permissions.has(p.action)}
                            onCheckedChange={(on) => toggle(p.action, on)}
                            label={
                              <span className="inline-flex items-center gap-1">
                                <span className="sr-only">{r.label}: </span>
                                {p.label}
                                {p.sensitive && (
                                  <Lock
                                    className="h-3.5 w-3.5 text-font-strong"
                                    aria-label="permiso sensible"
                                  />
                                )}
                              </span>
                            }
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
            <p className="flex items-center gap-1 text-xs text-font-strong">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Permiso sensible: da acceso a datos personales o a la configuración. Gestionar roles y
              permisos no figura porque es exclusivo del Superadministrador.
            </p>
          </div>
        </Dialog>
      )}

      {c && (
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => !o && setConfirm(null)}
          tone={c.type === 'delete' ? 'danger' : 'primary'}
          icon={c.type === 'blocked' ? 'info' : undefined}
          title={
            c.type === 'save'
              ? c.draft.id
                ? '¿Guardar los permisos del rol?'
                : '¿Crear el rol?'
              : c.type === 'delete'
                ? '¿Eliminar el rol?'
                : 'No se puede eliminar el rol'
          }
          description={
            c.type === 'save'
              ? `Rigen desde el próximo clic de ${
                  c.draft.original?.userCount
                    ? `las ${c.draft.original.userCount} personas con este rol`
                    : 'quien tenga este rol'
                }, sin volver a iniciar sesión. Queda en la auditoría.`
              : c.type === 'delete'
                ? 'No tiene usuarios asignados. Esta acción no se puede deshacer y queda en la auditoría.'
                : `Tiene ${c.role.userCount} ${
                    c.role.userCount === 1 ? 'usuario asignado' : 'usuarios asignados'
                  }. Reasigná a los usuarios antes de eliminar el rol.`
          }
          details={
            <strong>
              {c.type === 'save' ? c.draft.name.trim() : c.role.name}
              {c.type === 'save' && ` · ${c.draft.permissions.size} permisos`}
            </strong>
          }
          confirmLabel={
            c.type === 'save' ? 'Guardar' : c.type === 'delete' ? 'Sí, eliminar' : 'Entendido'
          }
          onConfirm={async () => {
            if (c.type === 'save') await save(c.draft);
            if (c.type === 'delete') {
              await api.delete(`/roles/${c.role.id}`);
              toast({ tone: 'success', title: `Rol "${c.role.name}" eliminado.` });
              roles.reload();
            }
          }}
        />
      )}
    </div>
  );
}
