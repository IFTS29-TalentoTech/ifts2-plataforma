-- CreateEnum
CREATE TYPE "GalleryArea" AS ENUM ('STUDENTS', 'CAREER');

-- CreateTable
CREATE TABLE "GalleryItem" (
    "id" TEXT NOT NULL,
    "area" "GalleryArea" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "alt" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalleryItem_area_order_idx" ON "GalleryItem"("area", "order");

-- Datos: el permiso nuevo gallery:manage se concede a los roles ADMIN y EDITOR que ya existen
-- (después manda lo que el Superadministrador tilde en "Roles y permisos"). Idempotente.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'gallery:manage'
FROM "Role" r
WHERE r."key" IN ('ADMIN', 'EDITOR')
ON CONFLICT DO NOTHING;
