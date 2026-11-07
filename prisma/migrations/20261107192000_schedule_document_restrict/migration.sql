-- B08: la comprobación de referencias de DELETE puede quedar obsoleta por una asignación concurrente.
-- No permitir que el borrado anule el documento obligatorio de un horario publicado.
-- No modifica filas existentes; conserva la regla de API que prohíbe borrar documentos referenciados.
BEGIN;
ALTER TABLE "Schedule" DROP CONSTRAINT "Schedule_documentId_fkey";
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
