-- RF11 / ADR-18 ampliada: los roles pasan de un enum fijo a datos configurables.
-- Migra los datos existentes sin perder usuarios:
--   1. crea Role y RolePermission con los roles del sistema y sus permisos iniciales
--      (los mismos de DEFAULT_ROLE_PERMISSIONS en packages/shared/src/permissions.ts);
--   2. pasa cada usuario de la columna "role" (enum) a "roleId";
--   3. promueve a SUPERADMIN al ADMIN activo más antiguo, para que el sistema nunca quede sin
--      alguien que pueda gestionar roles (regla "siempre al menos un SUPERADMIN activo").

-- El enum viejo se llama igual que la tabla nueva: se renombra primero y se elimina al final.
ALTER TYPE "Role" RENAME TO "Role_old";

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Datos: roles del sistema. Los nombres visibles son los de la semilla y se pueden cambiar desde el panel.
INSERT INTO "Role" ("id", "key", "name", "description", "isSystem", "updatedAt") VALUES
  (gen_random_uuid()::text, 'SUPERADMIN', 'Superadministrador', 'Crea roles y define sus permisos. Tiene acceso a todo.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ADMIN', 'Rectoría / Dirección', 'Configuración, usuarios, archivo y todo el contenido.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BEDELIA', 'Bedelía Académica', 'Horarios, mesas, avisos y cartelera.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'EDITOR', 'Comunicación', 'Publicaciones, redes y novedades.', true, CURRENT_TIMESTAMP);

-- Datos: permisos iniciales (SUPERADMIN no lleva filas: tiene todo por código).
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "Role" r
JOIN (VALUES
  ('ADMIN', 'dashboard:read'), ('ADMIN', 'publications:manage'), ('ADMIN', 'publications:delete'),
  ('ADMIN', 'social:moderate'), ('ADMIN', 'social:delete'), ('ADMIN', 'notices:manage'),
  ('ADMIN', 'notices:delete'), ('ADMIN', 'schedules:manage'), ('ADMIN', 'schedules:delete'),
  ('ADMIN', 'examCalls:manage'), ('ADMIN', 'examCalls:delete'), ('ADMIN', 'documents:manage'),
  ('ADMIN', 'documents:delete'), ('ADMIN', 'terms:manage'), ('ADMIN', 'terms:setPublic'),
  ('ADMIN', 'settings:manage'), ('ADMIN', 'integrations:manage'), ('ADMIN', 'content:manage'),
  ('ADMIN', 'content:delete'), ('ADMIN', 'links:manage'), ('ADMIN', 'links:delete'),
  ('ADMIN', 'users:manage'), ('ADMIN', 'contact:read'), ('ADMIN', 'contact:delete'),
  ('ADMIN', 'audit:read'), ('ADMIN', 'categories:manage'),
  ('BEDELIA', 'dashboard:read'), ('BEDELIA', 'notices:manage'), ('BEDELIA', 'notices:delete'),
  ('BEDELIA', 'schedules:manage'), ('BEDELIA', 'schedules:delete'), ('BEDELIA', 'examCalls:manage'),
  ('BEDELIA', 'examCalls:delete'), ('BEDELIA', 'documents:manage'), ('BEDELIA', 'documents:delete'),
  ('BEDELIA', 'terms:manage'), ('BEDELIA', 'contact:read'), ('BEDELIA', 'categories:manage'),
  ('EDITOR', 'dashboard:read'), ('EDITOR', 'publications:manage'), ('EDITOR', 'publications:delete'),
  ('EDITOR', 'social:moderate'), ('EDITOR', 'social:delete'), ('EDITOR', 'categories:manage')
) AS p(role_key, permission) ON p.role_key = r."key";

-- User: de enum a referencia.
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
UPDATE "User" u SET "roleId" = r."id" FROM "Role" r WHERE r."key" = u."role"::text;
UPDATE "User" SET "roleId" = (SELECT "id" FROM "Role" WHERE "key" = 'SUPERADMIN')
WHERE "id" = (
  SELECT "id" FROM "User" WHERE "role" = 'ADMIN' AND "active" = true ORDER BY "createdAt" ASC LIMIT 1
);
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN "role";

-- DropEnum
DROP TYPE "Role_old";

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
