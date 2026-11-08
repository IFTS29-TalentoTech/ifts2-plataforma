# Módulo `teachers` — plantel docente (RF10, ADR-037)

Docentes y materias a cargo que se muestran en Institucional. Permiso `teachers:manage` (ADMIN y EDITOR por defecto).

- `GET /teachers` — `{ items: TeacherDto[] }` (visibles y ocultas) con `photoSrc` ya resuelto.
- `POST /teachers` — `{ name, role?, subjects?, visible? }`. 201. Se agrega al final.
- `PATCH /teachers/:id` — cualquier campo; `visible:false` es la **baja lógica** (la persona se conserva pero no se ve en el sitio).
- `POST /teachers/:id/photo` — multipart `file` (JPG/PNG/WebP, máx. 5 MB). `DELETE /teachers/:id/photo` quita la foto.
- `PUT /teachers/order` — `{ ids }` con los ids de **todas** las personas (409 si el plantel cambió).
- `DELETE /teachers/:id` — 204; manual, auditado (`teachers.delete`) y **solo si está oculta** (409 si sigue visible).
- Lectura pública: `GET /public/teachers` (módulo `public`): solo las visibles.

Foto: dato personal (Ley 25.326), opcional. `Teacher.photo` guarda una ruta del sitio o una clave del almacenamiento, nunca una URL firmada (vence).

Probar: `pnpm --filter @ifts2/api exec vitest run --project integration test/api/teachers.test.ts`
