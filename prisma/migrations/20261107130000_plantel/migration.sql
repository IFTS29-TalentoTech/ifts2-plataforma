-- CreateTable: plantel docente (RF10, US-29). Aditiva.
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photo" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Teacher_visible_order_idx" ON "Teacher"("visible", "order");

-- Datos: el permiso nuevo teachers:manage se concede a los roles ADMIN y EDITOR que ya existen
-- (después manda lo que el Superadministrador tilde en "Roles y permisos"). Idempotente.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'teachers:manage'
FROM "Role" r
WHERE r."key" IN ('ADMIN', 'EDITOR')
ON CONFLICT DO NOTHING;
