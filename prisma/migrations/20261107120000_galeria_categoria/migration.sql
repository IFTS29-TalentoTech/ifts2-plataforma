-- AlterTable: categoría de cada diapositiva de la galería (RF09, US-30). Aditiva y sin datos que migrar.
ALTER TABLE "GalleryItem" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
