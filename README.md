# Plataforma web del IFTS N.° 2

> Si llegás a este proyecto sin contexto, leé este archivo de arriba a abajo: te lleva de "qué es" a "tengo todo corriendo en mi máquina" y a "cómo agrego mi parte". Todo está en español rioplatense a propósito: el producto, los mensajes y la documentación.

## 1. Qué es y para quién

Es el **sitio institucional + panel de gestión** del **IFTS N.° 2 DE 20** (Instituto de Formación Técnica Superior del Gobierno de la Ciudad de Buenos Aires, Tecnicatura Superior en Emprendimientos Gastronómicos). Lo construye el equipo **Talento Tech** (IFTS N.° 29) como proyecto integrador de la tecnicatura en Desarrollo de Software.

Tiene dos caras:

- **Sitio público** (aspirantes, estudiantes, familias): Inicio, Institucional, La carrera, Estudiantes (horarios, mesas de examen y avisos del ciclo vigente), Ingreso (aspirantes), Inscripciones (alumnos), Novedades.
- **Panel de administración** (personal del instituto, no técnico): cargar avisos, horarios y llamados a examen, aprobar publicaciones de Instagram, archivar documentos, configurar el sitio y las integraciones.

Ideas de negocio que gobiernan todo el código (no las rompas):

1. **Nada se borra solo.** Lo vencido se oculta y se archiva; la eliminación es siempre manual, con confirmación y auditoría.
2. **La vigencia se calcula al consultar** (estado + fechas), no con tareas programadas.
3. **Nada de redes llega al sitio sin aprobación humana.**
4. **El sitio sigue funcionando** si fallan Instagram, el correo o el almacenamiento.
5. **El producto es genérico**: nada de "IFTS" escrito en el código; los datos institucionales son configuración.

Pantallas (referencia visual en `docs/design/`, capturas del Figma): `desktop/01-inicio…06-novedades` son el sitio público; `07-resumen…13-login` el panel (Resumen, Publicaciones, Avisos académicos, Horarios, Archivo, Configuración, Login) y los `modal-*` los diálogos. `docs/design/mobile/` tiene las versiones a 390 px (el panel también es responsive).

## 2. Stack y por qué

| Pieza      | Tecnología                                               | Por qué                                                                                                   |
| ---------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Monorepo   | pnpm workspaces                                          | Un repositorio para web, API y código compartido; revisiones y CI simples                                 |
| Web        | Next.js 15 (App Router) + React 19, Tailwind 3, Radix UI | SEO y caché para el sitio público, rutas protegidas para el panel; Radix da accesibilidad (foco, teclado) |
| API        | Node + Express 5 + TypeScript                            | API REST separada, simple de testear                                                                      |
| Base       | PostgreSQL 17 + Prisma 6                                 | Migraciones versionadas y tipos generados                                                                 |
| Compartido | `packages/shared` (zod, enums, permisos, vigencia)       | Una sola fuente de reglas para API y web                                                                  |
| Pruebas    | Vitest, Supertest, Cypress + axe                         | Unitarias, API y extremo a extremo con accesibilidad                                                      |
| Calidad    | ESLint, Prettier, TypeScript estricto, GitHub Actions    | Todo se verifica en cada pull request                                                                     |

Las decisiones están justificadas en `docs/specs/02-decisiones-tecnicas.md` y `docs/decisiones/ADR-02x`.

## 3. Estructura de carpetas

```
apps/
  api/            API REST (Express). src/modules/<nombre>/ = un módulo por carpeta (se montan solos)
                  src/infra/ = servicios externos (almacenamiento, correo, Instagram, cifrado, logger)
                  src/middleware/ = auth, permisos, validación, CSRF, límites de frecuencia, errores
                  test/ = pruebas unitarias y de API
  web/            Next.js. src/app/ = rutas; src/components/ui = kit de UI; src/components/layout = layouts
                  src/lib/ = cliente de API, sesión, fechas; src/styles/tokens.css = paleta y tipografías
                  cypress/ = pruebas extremo a extremo
packages/
  shared/         Esquemas zod, enums, matriz de permisos, reglas de vigencia, guía de Instagram
prisma/           schema.prisma, migrations/, seed.ts (demo/prod) y seed-data.ts (datos reales del IFTS)
scripts/          generate-tokens.mjs, check-no-hardcoded-styles.mjs, contrast.mjs
docs/
  specs/          ESPECIFICACIONES: la fuente de verdad (leer en orden, ver sección 12)
  design/         Capturas del Figma (desktop y mobile)
  decisiones/     ADR: por qué se decidió cada cosa
  ARQUITECTURA.md Diagrama de capas y módulos
  avance.md       Bitácora de lo hecho, pendiente y problemas
  evidencias/     Salidas de pruebas con fecha (se piden en la entrega de la cátedra)
docker-compose.yml  Base de desarrollo (contenedor ifts2-db)
```

## 4. Requisitos previos

- **Node 24** (mínimo 20), **pnpm 11** (`corepack enable` o `npm i -g pnpm`).
- **Docker Desktop** (solo para la base PostgreSQL). No hace falta instalar PostgreSQL.
- Git. Funciona en Windows (Git Bash o PowerShell), macOS y Linux.

## 5. Instalación y puesta en marcha

```bash
git clone <url-del-repositorio> && cd ifts2-plataforma

cp .env.example .env     # valores de desarrollo listos para usar (nunca se versiona el .env)
pnpm install             # instala todo y genera el cliente de Prisma
pnpm db:up               # levanta PostgreSQL 17 en Docker (puerto 5433) y crea ifts2 e ifts2_test
pnpm db:migrate          # aplica las migraciones
pnpm db:seed             # carga datos de demostración (SEED_MODE=demo)
pnpm dev                 # API en http://localhost:4000 y web en http://localhost:3000
```

Comprobá: `http://localhost:4000/health` responde `{"status":"ok","db":"ok",…}` y `http://localhost:3000` muestra el sitio.

**Usuarios de demostración** (solo desarrollo):

| Rol     | Correo                | Clave                                   | Puede                               |
| ------- | --------------------- | --------------------------------------- | ----------------------------------- |
| ADMIN   | `admin@ifts2.local`   | `Cambiame-123!` (`SEED_ADMIN_PASSWORD`) | Todo                                |
| BEDELIA | `bedelia@ifts2.local` | `Demo-2026-ifts2`                       | Avisos, horarios, llamados, archivo |
| EDITOR  | `editor@ifts2.local`  | `Demo-2026-ifts2`                       | Publicaciones y moderación de redes |

La semilla **demo** crea ciclo 2026-2.º público, avisos (vigente, urgente y vencido), publicaciones de redes detectadas, documentos archivados, llamado "Turno extraordinario de Diciembre 2026", contenido de páginas y enlaces. La semilla **prod** (`SEED_MODE=prod`) crea solo el administrador (con cambio de clave obligatorio), ajustes y enlaces reales; **nunca** datos de demostración. Ambas son idempotentes (se pueden repetir).

Mientras no haya pantallas implementadas verás páginas "en construcción": es esperado, cada una la completa quien tenga esa historia (`docs/specs/07-backlog-y-plan.md`).

## 6. Comandos útiles

| Comando                                              | Qué hace                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | API y web en modo desarrollo                                                                      |
| `pnpm build`                                         | Compila todo                                                                                      |
| `pnpm lint`                                          | ESLint + Prettier + regla de "sin colores ni fuentes escritos a mano" + `tokens.css` sincronizado |
| `pnpm format`                                        | Formatea con Prettier                                                                             |
| `pnpm typecheck`                                     | TypeScript estricto en los tres paquetes                                                          |
| `pnpm test`                                          | Pruebas de `shared` y de la API                                                                   |
| `pnpm test:api`                                      | Solo API (Supertest sobre `ifts2_test`)                                                           |
| `pnpm test:e2e`                                      | Cypress (390 y 1440 px, axe) contra una web ya levantada                                          |
| `pnpm db:up` / `db:migrate` / `db:seed` / `db:reset` | Base: levantar, migrar, sembrar, reiniciar (borra y resiembra)                                    |
| `pnpm db:migrate:dev`                                | Crear una migración nueva tras editar `prisma/schema.prisma`                                      |
| `pnpm tokens`                                        | Regenera `apps/web/src/styles/tokens.css` desde `docs/specs/design-tokens.json`                   |
| `pnpm contrast`                                      | Calcula contrastes WCAG de la paleta                                                              |

## 7. Pruebas

```bash
pnpm test           # unitarias (vigencia, permisos, esquemas, cifrado, almacenamiento) + API (auth, usuarios, auditoría, integraciones)
pnpm test:api       # solo API; la base ifts2_test se migra sola
pnpm dev            # en otra terminal, y luego:
pnpm test:e2e       # Cypress contra http://localhost:3000 (CYPRESS_BASE_URL para otro puerto)
```

Para guardar evidencia (la cátedra la pide) volcá la salida a `docs/evidencias/AAAA-MM-DD-<cosa>.txt`. Cómo escribir pruebas de API: `apps/api/README.md`. Cómo escribir pruebas de Cypress: `apps/web/README.md`.

## 8. Cómo agregar una pieza

### Un módulo de API

Creá `apps/api/src/modules/<nombre>/index.ts` que exporte `mountPath` y `router`: se monta solo bajo `/api/v1`, **sin editar archivos compartidos**.

```ts
import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';

export const mountPath = '/notices';
export const router = Router();

router.get('/', requirePermission('notices:manage'), async (req, res) => {
  res.json(await req.ctx.prisma.notice.findMany()); // req.ctx = prisma, storage, mailer, instagram…
});
```

Plantilla completa con validación zod, auditoría, paginación y pruebas: **`apps/api/README.md`**. Esquemas de entrada nuevos van en `packages/shared/src/schemas.ts`.

### Una pantalla

Cada ruta ya existe como placeholder (`apps/web/src/app/(public)/…` y `apps/web/src/app/panel/(shell)/…`). Editá su `page.tsx`, reemplazá `<Placeholder />` y armá la pantalla con el kit (`Button`, `Card`, `Table`, `Dialog`, `ConfirmDialog`, `Input`, `useToast`…):

```tsx
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, useConfirm } from '@/components/ui';

export default function Page() {
  return (
    <PageHeader
      title="Avisos académicos"
      description="Administrá los comunicados."
      action={<Button>Nuevo aviso</Button>}
    />
  );
}
```

Catálogo visual: levantá la web y abrí `http://localhost:3000/ui-kit`. Guía completa: **`apps/web/README.md`**.

## 9. Cambiar la paleta y las tipografías

1. Editá `docs/specs/design-tokens.json` (colores, radios, sombras, espaciados, fuentes).
2. `pnpm tokens` regenera `apps/web/src/styles/tokens.css` (único archivo con colores hex).
3. Tipografía: `apps/web/src/app/fonts.ts` (único lugar donde se elige la fuente de Google Fonts).
4. Para probar otra paleta sin tocar nada más: agregá `data-theme="alt"` al `<html>` (tema de ejemplo ya definido).

En componentes **no se escriben hex ni nombres de fuente**: solo clases de Tailwind (`bg-primary-strong`, `text-accent`, `font-display`). `pnpm lint` falla si lo hacés. Los pares de color se verifican contra WCAG AA (`pnpm contrast`, `docs/decisiones/ADR-021`).

## 10. Configurar integraciones

La regla: **cambiar de proveedor es cambiar configuración, nunca código**. Sin configuración real, todo funciona en **modo demostración** y el panel lo avisa.

| Integración                    | Quién la configura                                         | Cómo                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Instagram**                  | El **cliente**, desde el panel (Configuración, solo ADMIN) | App ID/Secret de su app de Meta, conexión por OAuth o token pegado, hashtag. Se guarda cifrado (AES-256-GCM)                              |
| **Correo** (contacto)          | El **cliente**, desde el panel                             | Correo de destino y, opcionalmente, SMTP (`smtp://usuario:clave@host:587`)                                                                |
| **Almacenamiento de archivos** | DevOps, por variables de entorno                           | `STORAGE_PROVIDER=local` (disco `uploads/`), `memory` (pruebas) o `s3` (compatible S3: Supabase Storage, Cloudflare R2, MinIO) con `S3_*` |

Todas las variables, con comentarios, están en `.env.example`. Si el proveedor elegido exige variables que faltan, la API **no arranca** y dice cuáles.

**Guía para el cliente (Instagram)** — la pantalla de Configuración la muestra paso a paso (texto en `packages/shared/src/instagram-guide.ts`, reutilizable en el Manual de Usuario):

1. La cuenta de Instagram del instituto debe ser **profesional** (Empresa o Creador).
2. Crear una app en **Meta for Developers** (developers.facebook.com) con el caso de uso de Instagram.
3. Agregar el producto **Instagram** (inicio de sesión de Instagram).
4. Registrar la **dirección de redirección** que muestra la pantalla (`<API_ORIGIN>/api/v1/integrations/instagram/callback`) en "URI de redireccionamiento de OAuth válidos".
5. Copiar **App ID** y **App Secret** y pegarlos en la pantalla.
6. Pulsar **Conectar con Instagram**, iniciar sesión con la cuenta del instituto, aceptar, y usar **Probar conexión**. Alternativa: pegar un token de larga duración.

Estados posibles: sin configurar (modo demostración) · credenciales guardadas, falta conectar · conectada · token por vencer · error. La implementación real contra la API de Meta (`GraphInstagramClient`) está pendiente de completar y verificar: ver `docs/avance.md`.

## 11. Convenciones, ramas y definición de terminado

- **Commits convencionales** en español: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:` (ej. `feat(avisos): pausar y reanudar un aviso`).
- **Una rama por historia** (`feat/US-11-avisos`), pull request chico, revisión de otra persona antes de integrar. No se hace push directo a `main`. Detalle en `CONTRIBUTING.md`.
- **Definición de terminado**: cumple los criterios de aceptación de la spec; pruebas (Vitest/Supertest y el escenario Cypress) en verde; `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores; axe sin violaciones graves; verificado a 390 y 1440 px; toda mutación audita; documentación actualizada (README del paquete, `.env.example`, ADR si decidiste algo, `docs/avance.md`).
- **Comentarios**: en español, explicando el _porqué_ y las reglas de negocio (no lo obvio). Cabecera breve en cada archivo clave y TSDoc en funciones públicas.

## 12. Problemas frecuentes

| Síntoma                                      | Causa y solución                                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EADDRINUSE :3000`                           | Otro programa usa el puerto. `PORT=3100 pnpm --filter @ifts2/web dev` y poné `APP_ORIGIN=http://localhost:3100` en `.env`                                                                      |
| `pnpm install` avisa "Ignored build scripts" | pnpm 11 exige aprobar scripts de instalación: ya están aprobados en `pnpm-workspace.yaml` (`allowBuilds`). Si agregás un paquete con binarios, sumalo ahí                                      |
| La API no arranca y lista variables          | Es a propósito: `.env` incompleto o proveedor mal configurado. Compará con `.env.example`                                                                                                      |
| `ECONNREFUSED` o `P1001` a la base           | Docker Desktop apagado o contenedor caído: `pnpm db:up`. El puerto es **5433**, no 5432                                                                                                        |
| Pruebas de API fallan por la base            | `pnpm db:up` y confirmá que existe `ifts2_test` (la crea el script de init al primer arranque; si el volumen ya existía: `docker exec ifts2-db psql -U ifts2 -c "CREATE DATABASE ifts2_test"`) |
| Cypress: `bad option: --smoke-test`          | El entorno define `ELECTRON_RUN_AS_NODE`. Ejecutá `env -u ELECTRON_RUN_AS_NODE pnpm test:e2e` (PowerShell: `$env:ELECTRON_RUN_AS_NODE=$null`)                                                  |
| Cambié el schema y falla el tipo de Prisma   | `pnpm db:migrate:dev` (crea la migración) y `pnpm db:generate`                                                                                                                                 |
| Saltos de línea / "CRLF will be replaced"    | Normal en Windows: el repo normaliza a LF (`.gitattributes`)                                                                                                                                   |
| `next build` falla bajando la fuente         | `next/font` descarga Plus Jakarta Sans de Google Fonts al compilar: hace falta internet                                                                                                        |
| El panel redirige siempre al login           | La cookie de sesión no llega: `APP_ORIGIN` debe coincidir con el origen real de la web                                                                                                         |

## 13. Mapa de la documentación

| Dónde                                                                   | Qué hay                                                                                                                                                                       | Cuándo leerlo                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `CLAUDE.md`, `docs/BUILD-NOTES.md`                                      | Reglas de trabajo y entorno                                                                                                                                                   | **Primero**                         |
| `docs/specs/AGENTS.md`                                                  | Reglas no negociables del proyecto                                                                                                                                            | **Primero**                         |
| `docs/specs/00-vision-y-alcance.md` a `10-entregables-etapa-3.md`       | Visión, requerimientos con criterios de aceptación, decisiones técnicas, arquitectura, API, pantallas, pruebas, backlog, datos, preguntas abiertas, entregables de la cátedra | Leer en orden antes de programar    |
| `docs/specs/prisma/schema.prisma`, `design-tokens.json`                 | Modelo de datos original y tokens de diseño (el vigente está en `prisma/` y se genera a CSS)                                                                                  | Al tocar datos o estilos            |
| `docs/specs/historias-de-usuario.md`                                    | Historias priorizadas                                                                                                                                                         | Al elegir tarea                     |
| `docs/design/`                                                          | Capturas del Figma (desktop y mobile) y modales                                                                                                                               | Al maquetar                         |
| `docs/decisiones/`                                                      | ADR (por qué se decidió cada cosa)                                                                                                                                            | Antes de cambiar algo estructural   |
| `docs/ARQUITECTURA.md`                                                  | Diagrama de capas y módulos                                                                                                                                                   | Para orientarte                     |
| `docs/avance.md`                                                        | Bitácora, pendientes, dificultades                                                                                                                                            | Al empezar y al terminar cada tarea |
| `docs/evidencias/`                                                      | Salidas de pruebas con fecha                                                                                                                                                  | Para la entrega                     |
| `apps/api/README.md`, `apps/web/README.md`, `packages/shared/README.md` | Guías por paquete                                                                                                                                                             | Al trabajar en ese paquete          |
| `CONTRIBUTING.md`                                                       | Flujo de trabajo                                                                                                                                                              | Antes de tu primer PR               |
