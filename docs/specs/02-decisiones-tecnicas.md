# 02 · Decisiones técnicas (ADR)

Cada decisión indica **estado**: *Cerrada* (decidida por la cátedra o el cliente), *Propuesta* (definida en la Etapa 2, el agente la implementa) o *A validar* (depende de una verificación de DevOps o del cliente; implementar detrás de una interfaz reemplazable).

| ADR | Decisión | Estado |
|---|---|---|
| 01 | Desarrollo a medida, sin CMS de terceros | Cerrada |
| 02 | Monorepo pnpm con tres paquetes | Propuesta |
| 03 | Frontend: Next.js (App Router) + TypeScript | Propuesta (Etapa 2) |
| 04 | Backend: Node.js + Express + TypeScript, API REST | Propuesta (Etapa 2) |
| 05 | Base de datos: PostgreSQL + Prisma | Propuesta (Etapa 2) |
| 06 | Autenticación: sesiones en base con cookie, argon2id | Propuesta |
| 07 | Vigencia calculada al consultar; sin borrado automático; eliminación manual con confirmación | Cerrada (cliente y cátedra) |
| 08 | Almacenamiento de archivos tras una interfaz | A validar |
| 09 | Integración con Instagram | A validar (prueba de concepto) |
| 10 | Renderizado público con caché y revalidación | Propuesta |
| 11 | Estilos: Tailwind CSS + Radix UI, tokens del Figma | Propuesta |
| 12 | Validación con zod compartida | Propuesta |
| 13 | Pruebas: Vitest, Supertest y Cypress | Propuesta (Etapa 2) |
| 14 | CI/CD con GitHub Actions | Propuesta (Etapa 2) |
| 15 | Hosting y base gratuitos | A validar (DevOps) |
| 16 | Correo transaccional por SMTP | A validar |
| 17 | Zona horaria y localización | Propuesta |
| 18 | Roles y permisos | A validar con el cliente |
| 19 | Observabilidad mínima | Propuesta |

## ADR-01 · Desarrollo a medida

La cátedra respondió que **no** a WordPress: el alcance de la materia exige recorrer diseño, backend, base de datos, seguridad, pruebas y despliegue propios. Ver `proyecto/decisiones.md` D-001. **Consecuencia:** no incorporar CMS ni constructores de sitios; sí se pueden usar librerías.

## ADR-02 · Monorepo

`apps/web` (Next.js), `apps/api` (Express), `packages/shared` (esquemas zod, tipos, constantes de roles y estados). Un solo repositorio simplifica el trabajo de un equipo de cinco, las revisiones cruzadas y la CI. *Alternativa descartada:* dos repositorios (más fricción para cambios que cruzan frontend y API).

## ADR-03 · Frontend

Next.js con App Router y TypeScript estricto. Sirve el sitio público (renderizado en servidor con caché, por SEO: importa para captar aspirantes) y el panel (rutas bajo `/panel`, protegidas). Una sola base de código para ambos. El frontend consume **solo** la API REST; no accede a la base de datos.

## ADR-04 · Backend

Node.js 20 + Express + TypeScript. Capas: `routes` → `controllers` → `services` → `repositories` (Prisma). Errores con formato Problem Details (RFC 7807). Rate limiting con `express-rate-limit`. Cabeceras con `helmet`. CORS limitado al origen del frontend. *Alternativa descartada:* Route Handlers de Next.js como API única (se acopla el despliegue; la Etapa 2 ya fijó una API separada).

## ADR-05 · Base de datos

PostgreSQL con Prisma Migrate. El esquema ejecutable está en `prisma/schema.prisma`. Tiempos en UTC (`timestamptz`). Índices en las columnas de vigencia. Respaldos periódicos configurados en el proveedor (riesgo R7: algunos planes gratuitos suspenden o vencen).

## ADR-06 · Autenticación y sesiones

- Usuario y contraseña; contraseñas con **argon2id**.
- Sesión del lado del servidor (tabla `Session`) con token aleatorio de 256 bits en cookie `httpOnly`, `Secure`, `SameSite=Lax`; en base se guarda solo el hash del token. Duración 8 horas; "recordar sesión" extiende a 14 días.
- Revocable (cerrar sesión, desactivar usuario) a diferencia de un JWT sin estado.
- Protección CSRF: `SameSite=Lax` más verificación del encabezado `Origin` en métodos mutantes.
- Límite de intentos de login (5 por 15 minutos por IP y por correo) y mensaje de error genérico.
- "¿Olvidaste tu clave?": en el MVP el **administrador restablece la contraseña** desde el panel (genera una temporal y exige cambio); el envío automático por correo queda como mejora.
- No se restringe el dominio del correo (el Figma muestra el ejemplo @bue.edu.ar solo como ayuda).

## ADR-07 · Vigencia y archivo

La visibilidad se **calcula en cada consulta** a partir del estado y las fechas, sin tarea programada que oculte contenido: así el archivo no depende de procesos que podrían no ejecutarse en hosting gratuito, y nunca se elimina información. Hay estados (`PAUSED`, `ARCHIVED`, `DISCARDED`) para sacar contenido de circulación sin perderlo. **Decisión del cliente (D-004):** el borrado *automático* es "un riesgo grave"; en la misma reunión aclaró que lo antiguo se puede borrar a mano. **Exigencia de la cátedra:** la aplicación debe implementar el CRUD completo (crear, leer, actualizar, eliminar) con confirmación antes de eliminar. Ambas se cumplen así: nunca hay borrado automático, y existe `DELETE` manual con diálogo de confirmación, auditoría y reglas de elegibilidad (solo borrador, pausado, descartado, vencido o archivado; 409 si está referenciado).

## ADR-08 · Almacenamiento de archivos

Interfaz `StorageProvider { put, getSignedUrl, remove }` con una implementación inicial sobre un servicio gratuito con CDN (candidatos: Supabase Storage o Cloudinary; **DevOps valida**). Reglas: lista blanca de tipos (PDF, JPG, PNG, WebP), PDF hasta 10 MB y imágenes hasta 5 MB; las imágenes se redimensionan a 1600 px de lado máximo y se convierten a WebP con `sharp`; nombres de archivo saneados; la clave de almacenamiento no es el nombre original. Los PDF del archivo se sirven con URL firmada de corta duración cuando están archivados. Existe una implementación local en disco para desarrollo y pruebas.

## ADR-09 · Integración con Instagram

- API oficial de Instagram (inicio de sesión de Instagram con cuenta **profesional**). Endpoint de medios propios: `id, caption, media_type, media_url, permalink, timestamp`.
- Se importan solo las publicaciones cuya leyenda contiene el **hashtag configurable** en `SiteSetting` (valor inicial `[definir con el cliente]`).
- Sincronización manual (botón "clic para sincronizar" del Resumen) y diaria (cron). Idempotente por `externalId`.
- El token de larga duración se guarda cifrado (AES-256-GCM con `APP_ENCRYPTION_KEY`) y se renueva automáticamente antes de vencer (a los ~50 días); si falla, el Resumen muestra el estado y el motivo.
- Las URLs de medios de Instagram expiran: al **aprobar** se copia la imagen al almacenamiento propio.
- **Plan de contingencia obligatorio:** carga manual de publicaciones. El sitio nunca depende de la API.
- Facebook no se integra: replica Instagram según el cliente.
- Condición previa: **prueba de concepto** en la fase 1 del plan. Si no es viable, el flujo de moderación opera con publicaciones cargadas manualmente (mismo modal, mismo resultado).

## ADR-10 · Renderizado y caché del sitio público

Páginas públicas con revalidación a 60 segundos y revalidación bajo demanda al publicar, archivar o cambiar la configuración. Imágenes con `next/image`. El sitio público lee de endpoints públicos de solo lectura de la API (`/public/*`) que ya aplican las reglas de vigencia.

## ADR-11 · Estilos y componentes

Tailwind CSS con los tokens de `design-tokens.json` expuestos como variables CSS y como tema de Tailwind. Radix UI para primitivas accesibles (diálogos, menús, selectores, tabs) que garantizan foco y teclado. Fuente Inter con `next/font`. Los modales de confirmación del Figma (≈25) se resuelven con **un solo componente** de diálogo parametrizable.

## ADR-12 · Validación

Esquemas `zod` en `packages/shared`, usados por la API (validación de entrada) y por el frontend (formularios con `react-hook-form`). Sanitización del Markdown acotado antes de renderizar (sin HTML crudo).

## ADR-13 · Pruebas

Vitest (unitarias), Supertest con base de datos de prueba (API), Cypress (extremo a extremo; ya forma parte del perfil del equipo de QA) y axe para accesibilidad. Detalle en `06-testing-y-calidad.md`.

## ADR-14 · CI/CD

GitHub Actions: instalar, lint, chequeo de tipos, pruebas, build, Lighthouse CI en pull request; despliegue automático de `main` a producción y de las ramas a vista previa. Migraciones de Prisma aplicadas en el despliegue de la API.

## ADR-15 · Hosting y base de datos

Planes gratuitos, **a validar por DevOps antes de la semana 6** (según Etapa 2): frontend en una plataforma con plan gratuito para Next.js; API en un servicio con contenedor Node gratuito; PostgreSQL gestionado **sin vencimiento** y con respaldos. Criterios de elección: sin suspensión por inactividad (o con *keep-alive* aceptable), límites de almacenamiento compatibles con RNF05, región cercana (São Paulo si existe). Dominio: subdominio provisorio gratuito mientras se tramita .edu.ar.

## ADR-16 · Correo

Servicio SMTP/API con plan gratuito (nodemailer). El mensaje de contacto se **guarda siempre primero** en la base y después se envía; si el envío falla, queda visible en el panel (Should).

## ADR-17 · Zona horaria y localización

Idioma único `es-AR`. Fechas almacenadas en UTC y presentadas en `America/Argentina/Buenos_Aires`. Formato `dd/mm/aaaa`.

## ADR-18 · Roles y permisos

Tres roles (matriz en `04-api.md`). El Figma define "Rectoría / Dirección: acceso total" y "Bedelía Académica: gestión de horarios y cartelera"; el rol **Editor** (comunicación) sale de la etapa de relevamiento (Matías Peláez y María del Carmen Canobi cargan contenido). **A validar con el cliente** si Editor y Bedelía son roles separados o uno solo.

## ADR-19 · Observabilidad

Logs estructurados con `pino` (sin datos personales), endpoint `/health` (API y base), tabla `AuditLog` para auditoría funcional y, opcionalmente, un servicio gratuito de captura de errores.
