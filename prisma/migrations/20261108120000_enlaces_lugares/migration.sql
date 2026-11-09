-- ADR-039: dónde se muestra cada enlace de interés. Los existentes se ven en Inicio y Estudiantes,
-- igual que hasta ahora (no cambia lo publicado).
ALTER TABLE "ExternalLink" ADD COLUMN "showHome" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ExternalLink" ADD COLUMN "showStudents" BOOLEAN NOT NULL DEFAULT true;
