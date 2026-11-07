# packages/shared — reglas compartidas entre API y web

**Qué es:** el código que tiene que ser _idéntico_ en el servidor y en el navegador: validaciones, enums, permisos y reglas de vigencia. Así una regla se escribe una sola vez y no puede desincronizarse.

**Cómo se usa:** se importa como `@ifts2/shared` (se consume como código fuente TypeScript, sin paso de build). Es TypeScript puro, sin dependencias de Node ni de React (salvo `zod`).

## Qué hay (`src/`)

| Archivo              | Contenido                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enums.ts`           | Roles, estados, tipos, claves de ajustes, límites de archivos y códigos de error. Están alineados con `prisma/schema.prisma` (una prueba de la API lo verifica)                                                                                                 |
| `permissions.ts`     | **Matriz de permisos por rol** como datos (`PERMISSIONS`) y el helper `can(role, 'notices:manage')`. La usan la API (`requirePermission`) y la web (ocultar opciones)                                                                                           |
| `visibility.ts`      | **Reglas de vigencia** puras: `isPublicationVisible`, `isNoticeVisible`, `isNoticeExpiringSoon` (7 días), `isScheduleVisible`, `isExamCallVisible`, `effectiveExamEnrollmentOpen` (A08: inscripción efectiva de un llamado). Reciben `now` para poder probarlas |
| `time.ts`            | Zona horaria `America/Argentina/Buenos_Aires` (UTC-3): `startOfDayBA`, `endOfDayBA`, `formatDateAR`…                                                                                                                                                            |
| `schemas.ts`         | Esquemas **zod** de entrada de todas las entidades, con mensajes de error en español claro (son parte de lo que evalúa la cátedra: campos obligatorios, duplicados, mensajes claros)                                                                            |
| `problem.ts`         | Tipos del error de la API (`ProblemDetails`) y de las páginas (`Page<T>`)                                                                                                                                                                                       |
| `instagram-guide.ts` | Guía paso a paso (en español) para que el cliente configure Instagram; la usa la pantalla y el Manual de Usuario                                                                                                                                                |

## Ejemplos

```ts
import { can, isNoticeVisible, noticeCreateInput, endOfDayBA } from '@ifts2/shared';

can('BEDELIA', 'notices:manage'); // true
can('EDITOR', 'users:manage'); // false

// La vigencia se calcula al consultar; nada se borra solo (ADR-07).
isNoticeVisible({ status: 'ACTIVE', visibleUntil: endOfDayBA('2026-11-25') }, new Date());

// Validación con mensajes claros: lanza ZodError con "El título es obligatorio."
noticeCreateInput.parse({ title: ' ', body: 'x' });
```

## Convenciones para cambiar este paquete

- **Reglas de vigencia**: convención de bordes `visibleFrom` inclusivo / `visibleUntil` exclusivo. Si la cambiás, actualizá `docs/specs/01-requerimientos.md` y los tests de borde.
- **Esquemas nuevos** en `schemas.ts`, en un bloque propio y con mensajes en español (`text('El título', 160)`, `email()`, `dateTime()`…). Exportá también el tipo (`z.infer`).
- **Permisos nuevos**: agregá la acción a `ACTIONS` y a los roles en `PERMISSIONS`; documentá en `docs/specs/04-api.md`.
- **Enums**: si cambia `prisma/schema.prisma`, cambiá `enums.ts` (la prueba `apps/api/test/unit/config.test.ts` falla si se desalinean).
- Cada función pública lleva TSDoc que explica la regla de negocio y no lo obvio.

## Pruebas

```bash
pnpm --filter @ifts2/shared test     # Vitest: bordes de vigencia, zona horaria, permisos y mensajes de validación
```
