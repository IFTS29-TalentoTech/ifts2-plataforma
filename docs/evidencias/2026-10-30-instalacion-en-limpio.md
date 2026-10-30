# Verificación de instalación en limpio — 2026-10-30

Objetivo: comprobar que alguien sin contexto puede instalar y ejecutar el proyecto **siguiendo solo la documentación** (Manual Técnico, sección 2, y `README.md`), a partir del `.zip` de la entrega.

## Entorno

- Windows 10, Git Bash, Node 24.15, pnpm 11.8, Docker Desktop con el contenedor `ifts2-db` (PostgreSQL 17) ya existente.
- Se extrajo `dist-entrega/ifts2-plataforma-2026-10-30.zip` (generado con `pnpm package` desde `HEAD`) en un directorio temporal **fuera del repositorio**, sin `node_modules`, sin `.env` y sin `uploads/`.
- Puertos y base propios para no pisar nada: base nueva `ifts2_limpia` (puerto 5433), API en 4150 y web en 3150 (el 3000 lo ocupa un programa ajeno).

## Pasos y resultado

| # | Paso (según la documentación) | Resultado |
| --- | --- | --- |
| 1 | `cp .env.example .env` y ajuste de `DATABASE_URL` (`ifts2_limpia`), `API_PORT=4150`, `API_ORIGIN`, `APP_ORIGIN=http://localhost:3150` (sección 2.3, nota de puertos ocupados) | OK |
| 2 | `pnpm install` | OK (45,7 s; genera el cliente de Prisma, sin advertencias de scripts bloqueados) |
| 3 | `pnpm db:up` | **No ejecutable en esta máquina**: ya existe el contenedor `ifts2-db` (nombre fijo en `docker-compose.yml`) y Docker rechazaría crear otro. Se reemplazó por `docker exec ifts2-db psql -U ifts2 -c "CREATE DATABASE ifts2_limpia"` (OK). En una máquina sin ese contenedor `pnpm db:up` es el camino documentado; **no se pudo probar aquí** |
| 4 | `pnpm db:migrate` | OK (aplica las dos migraciones) |
| 5 | `pnpm db:seed` | OK: administrador, ajustes (14), enlaces (5), contenido (14 secciones) y usuarios de demostración |
| 6 | `PORT=3150 pnpm dev` | OK: API y web levantan |
| 7 | `GET :4150/health` | `{"status":"ok","api":"ok","db":"ok",…,"demoMode":true}` |
| 8 | Sitio público `:3150/` y `/estudiantes` | 200; `/estudiantes` muestra «Turno extraordinario de Diciembre 2026» |
| 9 | Login con `admin@ifts2.local` / `Cambiame-123!`, `bedelia@ifts2.local` y `editor@ifts2.local` / `Demo-2026-ifts2` | 204 en los tres; `/auth/me` devuelve cada usuario |
| 10 | `/panel` sin sesión | 307 (redirige al login); `/panel/avisos` con sesión de ADMIN: 200 |
| 11 | Copia y restauración de la base (sección 2.6): `pg_dump -Fc`, `createdb`, `pg_restore --no-owner` | OK: la base restaurada tiene las 3 filas de `User` |
| 12 | `pnpm build` | OK (API, shared y web) |

## Lo que faltaba o no funcionaba en la documentación (y se corrigió)

1. **`pnpm db:up` falla si ya existe un contenedor `ifts2-db`** (de este u otro proyecto): no estaba contemplado. Se agregó a _Problemas frecuentes_ del Manual Técnico (2.8) y del `README.md` cómo reutilizar el contenedor y crear una base propia (es justamente lo que se hizo en esta verificación).
2. El Manual decía que el binario de Cypress «se descarga solo con `pnpm install`» y que hacía falta Chrome para las pruebas: Cypress lo descarga la primera vez que se ejecuta y Chrome solo hace falta para `pnpm docs:pdf`. Corregido en 2.1.

No hubo otros pasos que fallaran: con esas dos correcciones el recorrido instalar → migrar → semilla → levantar → login → ver el sitio funciona de punta a punta siguiendo solo la documentación.

## Limpieza

Se cerraron los procesos de Node/esbuild que corrían desde el directorio temporal (por línea de comando; ninguno escuchaba ya en 3150 ni 4150), se eliminó el directorio temporal y se borró la base `ifts2_limpia` (y la `ifts2_restaurada` de la prueba de restauración).
