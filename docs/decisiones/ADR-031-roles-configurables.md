# ADR-031 · Implementación de roles y permisos configurables

**Estado:** aceptada (06/11/2026) · **Relacionada con:** ADR-18 ampliada (`docs/specs/02-decisiones-tecnicas.md`), RF11, US-36, Q123 a Q127.

## Contexto

La ADR-18 ampliada define el modelo: el catálogo de permisos es fijo y los roles pasan a ser datos que define el Superadministrador. Esta ADR registra cómo se implementó y las decisiones que la spec no fijaba.

## Decisiones

1. **Catálogo en `packages/shared/src/permissions.ts`.**
   - `ACTIONS` es el catálogo completo de 27 acciones, incluido `roles:manage`.
   - `ASSIGNABLE_ACTIONS` son las 26 que se pueden tildar.
   - `PERMISSION_GROUPS` agrupa las casillas por recurso con rótulos en español, en 16 filas y 3 secciones. Una prueba verifica que cubre cada acción asignable exactamente una vez.
   - `DEFAULT_ROLE_PERMISSIONS` es la matriz inicial que usan la semilla y la migración.
2. **SUPERADMIN tiene todo por código** (`effectivePermissions`), sin filas en `RolePermission`. Así, un error de datos no puede dejarlo sin acceso. `roles:manage` se descarta para cualquier otro rol aunque esté guardado.
3. **Los permisos se leen en cada pedido.** `attachAuth` incluye el rol y sus permisos con la sesión, sin caché: un cambio rige en el próximo pedido. Es una consulta con dos `include` sobre tablas chicas.
4. **Migración con datos** (`20261106120000_roles_configurables`).
   - Crea las tablas y los 4 roles del sistema con sus permisos iniciales.
   - Pasa cada usuario del enum a `roleId`.
   - Promueve a SUPERADMIN al ADMIN activo más antiguo, para que el sistema nunca quede sin Superadministrador.
   - El enum viejo se renombra antes de crear la tabla `Role`, porque en PostgreSQL chocan los nombres.
5. **Anti-escalada también al administrar usuarios, no solo al asignar.** Quien no es SUPERADMIN no puede editar, desactivar, reactivar ni restablecer la clave de un usuario cuyo rol tenga permisos que él no tiene (403). Si no fuera así, un ADMIN podría restablecer la clave del Superadministrador y entrar con su cuenta (Q126).
6. **Forma de las respuestas.**
   - `/users` y `/auth/me` siguen devolviendo `role` como **clave** (por ejemplo `"BEDELIA"`), para no romper a quien ya la usa.
   - Suman `roleId` y `roleName`.
   - Las entradas usan `roleId`.
   - `GET /roles` devuelve `assignable` según quién pregunta, y la web lo usa para el selector.
7. **Claves de roles propios.** Se derivan del nombre ("Comunicación sin archivo" → `COMUNICACION_SIN_ARCHIVO`), con sufijo si ya existe. La clave no cambia al renombrar.
8. **Prueba de "toda ruta declara permiso"** (`apps/api/test/api/route-permissions.test.ts`).
   - Recorre los routers autodescubiertos y busca los middlewares marcados por `requirePermission` / `requireAnyPermission` (`PERMISSION_GUARDS`).
   - Las excepciones están listadas con su motivo: `POST /public/contact`, `POST /social/cron` (secreto `CRON_SECRET`) y `GET /settings` (solo sesión) (Q127).
9. **Pantalla web.**
   - `/panel/roles` tiene su propio ítem de menú, visible solo con `roles:manage`, y un enlace desde Configuración (Seguridad y accesos).
   - Se arma con `Table`, `Dialog`, `Checkbox` y el `ConfirmDialog` único (Q123).
10. **Usuarios de demostración.**
    - `admin@ifts2.local` pasa a ser el Superadministrador.
    - Se agrega `direccion@ifts2.local` como ADMIN.
    - Cypress usa `SUPERADMIN` y `ADMIN` por separado.

## Consecuencias

- Al volver a una rama sin esta migración, la base de desarrollo queda adelantada. Se recrea con `pnpm db:reset`, que debe correr una persona.
- Agregar un permiso nuevo requiere tocar tres cosas: `ACTIONS`, una casilla en `PERMISSION_GROUPS` y, si corresponde, `DEFAULT_ROLE_PERMISSIONS`. Para que un rol ya existente lo tenga, el Superadministrador lo tilda desde el panel o se agrega una migración de datos.
