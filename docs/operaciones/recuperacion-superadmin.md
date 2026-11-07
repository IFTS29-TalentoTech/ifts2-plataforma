# Inicialización y recuperación de SUPERADMIN (A03)

## Semilla

`pnpm db:seed` crea el SUPERADMIN inicial únicamente cuando no hay usuarios. Configurar
`SEED_MODE=prod`, `SEED_ADMIN_EMAIL` y una contraseña inicial segura en el entorno del operador.
El primer ingreso en producción exige cambiar esa contraseña.

Si el correo ya existe, debe pertenecer a un **SUPERADMIN activo**. Repetir la semilla conserva
su contraseña, estado, rol y obligación de cambio de clave; `SEED_ADMIN_PASSWORD` no restablece
credenciales. Cambiar el correo configurado tampoco crea otro administrador en una instalación
con usuarios: usar el correo actual de un SUPERADMIN activo. Las cuentas demo existentes también
se conservan, incluso si están desactivadas o fueron reasignadas. En producción siguen respetándose
los nombres y permisos editados y los roles ADMIN, BEDELIA y EDITOR eliminados.

Un error administrativo de la semilla tiene salida distinta de cero. La semilla no es una
transacción global: puede haber asegurado los roles antes del error; no altera cuentas para
resolverlo. El conteo de usuarios y la creación inicial usan la transacción Serializable con
reintentos de A02. Si hay un conflicto persistente, revisar el estado y volver a ejecutar.

## Resultado de la migración histórica

`20261106120000_roles_configurables` se conserva sin cambios: puede estar aplicada y no corresponde
alterar su checksum ni volver a ejecutarla.

| Estado anterior               | Resultado                                                         |
| ----------------------------- | ----------------------------------------------------------------- |
| Sin usuarios                  | Crea los roles; la semilla puede crear la primera cuenta.         |
| Usuarios, ningún ADMIN activo | No promueve a nadie; requiere recuperación explícita.             |
| Un ADMIN activo               | Lo convierte a SUPERADMIN, preservando contraseña y estado.       |
| Varios ADMIN activos          | Convierte solo al de menor `createdAt`; conserva los demás roles. |

Si dos ADMIN comparten el menor `createdAt`, la migración histórica no define un desempate por ID.
Revisar quién fue promovido antes de habilitar el servicio; con ese SUPERADMIN, reasignar desde el
panel al titular autorizado si corresponde. No corregirlo mediante una promoción automática nueva.

## Recuperación cuando no hay ningún SUPERADMIN activo

La API no permite a ADMIN asignar SUPERADMIN ni administrar una cuenta de mayor privilegio.
No agregar permisos reservados (`roles:manage`) a otro rol. Si existe un SUPERADMIN activo pero
se perdió su contraseña, este procedimiento se detiene: recuperar sus credenciales por el proceso
institucional autorizado, sin utilizar la semilla como restablecimiento.

1. Obtener autorización institucional y registrar su referencia, el operador y el ID exacto de la
   cuenta destinataria. Verificar identidad y acceso a sus credenciales actuales. No elegir al
   primer usuario disponible ni basarse solamente en un correo recibido.
2. Poner la API y los trabajos en mantenimiento; respaldar y verificar la base. Comprobar el
   destino de la conexión y revisar los usuarios y roles con un operador de base autorizado:

   ```sql
   SELECT current_database(), session_user;
   SELECT u."id", u."email", u."active", r."key" AS role
   FROM "User" u JOIN "Role" r ON r."id" = u."roleId"
   ORDER BY u."createdAt", u."id";
   ```

3. Elegir una cuenta **activa** con identidad verificada y ejecutar el SQL revisado desde la raíz
   del repositorio, mediante una conexión de psql administrada por el operador (por ejemplo,
   `PGSERVICE`/`.pgpass`; no poner contraseñas en el historial):

   ```bash
   psql -X --set=ON_ERROR_STOP=1 \
     --set=recovery_user_id='ID-EXACTO-VERIFICADO' \
     --set=recovery_reason='Referencia de autorización institucional' \
     --file=docs/operaciones/recuperar-superadmin.sql
   ```

   El script exige ausencia de SUPERADMIN activo, rol SUPERADMIN existente, cuenta destinataria
   activa y referencia no vacía. Ante cualquier incumplimiento revierte todo. Bloquea escrituras
   de roles y usuarios y usa Serializable; **no crea usuarios, reactiva cuentas ni cambia claves**.
   Promueve solo el ID indicado, revoca sus sesiones y registra `user.recover-superadmin`, rol
   anterior, referencia y usuario SQL. `userId` de auditoría es nulo porque actúa un operador
   externo, no una sesión de la cuenta recuperada.

4. Verificar el rol, la auditoría y el ingreso con las credenciales existentes; revisar los
   permisos desde el panel y salir de mantenimiento. Actualizar `SEED_ADMIN_EMAIL` con el correo
   actual de esa cuenta antes de repetir la semilla.

Si no hay ninguna cuenta activa verificable, detenerse: evaluar una restauración de respaldo
validado con acceso administrativo, o tramitar por separado una reactivación/recuperación de
identidad explícitamente autorizada y auditada. No reactivar una cuenta ni crear otra privilegiada
automáticamente. Una restauración requiere evaluar la pérdida de datos con los responsables.

La autorización del operador es el límite de confianza de esta recuperación: guardar el registro
institucional fuera de la base y restringir sus credenciales SQL. Nunca ejecutar el procedimiento
contra una base real para probarlo; las pruebas automatizadas usan exclusivamente el destino y la
marca descartables de A04.
