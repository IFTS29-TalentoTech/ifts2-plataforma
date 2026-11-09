-- Galerías con nombre (ADR-041): el administrador puede crear varias galerías y agregarlas a cualquier
-- página como una sección. Las dos galerías fijas anteriores (STUDENTS, CAREER) pasan a ser galerías con
-- nombre ya asociadas a su página, para que el sitio se vea igual.

-- CreateTable
CREATE TABLE "Gallery" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gallery_pkey" PRIMARY KEY ("id")
);

-- Datos: una galería por cada área que tenga diapositivas (si no hay ninguna, la semilla las crea).
INSERT INTO "Gallery" ("id", "name", "order", "updatedAt")
SELECT gen_random_uuid()::text, 'Vida en la cocina', 0, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "GalleryItem" WHERE "area" = 'STUDENTS');
INSERT INTO "Gallery" ("id", "name", "order", "updatedAt")
SELECT gen_random_uuid()::text, 'Fotos de La carrera', 1, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "GalleryItem" WHERE "area" = 'CAREER');

-- AlterTable GalleryItem: de "área" a "galería"
ALTER TABLE "GalleryItem" ADD COLUMN "galleryId" TEXT;
UPDATE "GalleryItem" SET "galleryId" = (SELECT "id" FROM "Gallery" WHERE "name" = 'Vida en la cocina') WHERE "area" = 'STUDENTS';
UPDATE "GalleryItem" SET "galleryId" = (SELECT "id" FROM "Gallery" WHERE "name" = 'Fotos de La carrera') WHERE "area" = 'CAREER';
ALTER TABLE "GalleryItem" ALTER COLUMN "galleryId" SET NOT NULL;
DROP INDEX "GalleryItem_area_order_idx";
ALTER TABLE "GalleryItem" DROP COLUMN "area";
DROP TYPE "GalleryArea";
CREATE INDEX "GalleryItem_galleryId_order_idx" ON "GalleryItem"("galleryId", "order");
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable ContentSection: tipo de sección (texto o galería)
ALTER TABLE "ContentSection" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'TEXT';
ALTER TABLE "ContentSection" ADD COLUMN "galleryId" TEXT;
CREATE INDEX "ContentSection_galleryId_idx" ON "ContentSection"("galleryId");
ALTER TABLE "ContentSection" ADD CONSTRAINT "ContentSection_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos: las galerías existentes quedan como sección de su página (Estudiantes y La carrera).
INSERT INTO "ContentSection" ("id", "page", "slug", "title", "body", "order", "visible", "kind", "galleryId")
SELECT gen_random_uuid()::text, 'estudiantes', 'vida-en-la-cocina', "name", '', 10, true, 'GALLERY', "id"
FROM "Gallery" WHERE "name" = 'Vida en la cocina';
INSERT INTO "ContentSection" ("id", "page", "slug", "title", "body", "order", "visible", "kind", "galleryId")
SELECT gen_random_uuid()::text, 'carrera', 'fotos', "name", '', 90, true, 'GALLERY', "id"
FROM "Gallery" WHERE "name" = 'Fotos de La carrera';
