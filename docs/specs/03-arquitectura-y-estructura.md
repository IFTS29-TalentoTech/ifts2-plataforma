# 03 · Arquitectura y estructura

## Vista general

```
Navegador ──HTTPS──► Next.js (apps/web)
                       ├─ Sitio público  (SSR + caché, revalidación 60 s)
                       └─ Panel /panel   (rutas protegidas)
                              │  REST/JSON (cookie de sesión)
                              ▼
                        API Express (apps/api)
   auth · publicaciones · redes sociales · avisos · horarios y llamados
   documentos/archivo · configuración · usuarios · contacto · auditoría
                              │
        ┌─────────────────────┼───────────────────────┐
        ▼                     ▼                       ▼
   PostgreSQL         StorageProvider          Servicios externos
   (Prisma)           (PDF e imágenes + CDN)   Instagram API · SMTP
```

Las integraciones externas están aisladas en módulos propios (`social`, `storage`, `mailer`) con una interfaz y una implementación falsa para pruebas.

## Estructura del monorepo

```
/
├─ apps/
│  ├─ web/                    Next.js (App Router)
│  │  ├─ src/app/             (public)/ inicio, institucional, carrera, estudiantes, ingreso, novedades
│  │  │                       panel/  login, resumen, publicaciones, avisos, horarios, archivo, configuracion
│  │  ├─ src/components/      ui/ (Dialog, Button, Badge, Card, Table, Field…), layout/ (TopBar, Footer, PanelShell)
│  │  ├─ src/lib/             api client, formateo de fechas, auth helpers
│  │  └─ cypress/             e2e/
│  └─ api/                    Express
│     ├─ src/modules/         auth, users, publications, social, notices, schedules, exam-calls,
│     │                       documents, settings, content, links, contact, audit, public
│     ├─ src/infra/           prisma.ts, storage/, mailer/, instagram/, logger.ts, crypto.ts
│     ├─ src/middleware/      auth, rbac, validate, rateLimit, errorHandler
│     └─ test/                unit/ y api/ (Supertest)
├─ packages/shared/           zod schemas, tipos, enums, constantes
├─ prisma/                    schema.prisma, migrations/, seed.ts
├─ docs/                      specs/ (este paquete), decisiones/ (ADR nuevos)
├─ .github/workflows/         ci.yml, deploy.yml, lighthouse.yml
├─ .env.example
└─ pnpm-workspace.yaml
```

## Variables de entorno (`.env.example`)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL |
| `APP_ORIGIN` / `API_ORIGIN` | Orígenes del frontend y de la API (CORS, cookies, revalidación) |
| `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS` | Sesión |
| `APP_ENCRYPTION_KEY` | Clave de 32 bytes (base64) para cifrar el token de Instagram |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` | Integración con Instagram |
| `STORAGE_PROVIDER` (`local` / `supabase` / `cloudinary`) y credenciales del proveedor | Archivos |
| `SMTP_URL`, `CONTACT_TO_EMAIL` | Correo de contacto |
| `REVALIDATE_SECRET` | Revalidación bajo demanda del sitio |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Primer administrador (solo desarrollo y primer despliegue) |

Ningún secreto se versiona. `.env.example` tiene valores de ejemplo no sensibles.

## Entornos

| Entorno | Propósito | Datos |
|---|---|---|
| Local | Desarrollo | Semilla de demostración, almacenamiento local |
| Vista previa | Una por pull request | Semilla |
| Producción | Instituto | Datos reales cargados desde el panel |

## CI/CD

1. **Pull request:** instalar con caché, lint, `tsc --noEmit`, Vitest, Supertest (con PostgreSQL de servicio), build, Cypress en modo headless contra la vista previa, Lighthouse CI con umbrales (móvil Rendimiento ≥ 80, Accesibilidad ≥ 90).
2. **Integración a `main`:** despliegue automático de la API y del frontend; migraciones aplicadas con `prisma migrate deploy`.
3. **Respaldo:** exportación periódica de la base (`pg_dump`) al almacenamiento, además de los respaldos del proveedor.

## Seguridad (resumen operativo)

- argon2id, sesiones revocables en base, cookies `httpOnly` + `Secure` + `SameSite=Lax`.
- Validación zod en toda entrada; consultas parametrizadas (Prisma); sanitización de Markdown.
- `helmet`, CORS cerrado, límites de frecuencia (login, contacto, sincronización), límite de tamaño de carga.
- Subidas: lista blanca de tipos, verificación de firma del archivo (magic bytes), nombre aleatorio.
- Secretos en variables de entorno; token de Instagram cifrado en base.
- Datos personales mínimos (contacto: nombre, correo, mensaje, consentimiento) y aviso de uso conforme a la Ley 25.326.

## Capacidad

El cliente estimó, con el equipo, picos de **300 a 400 personas concurrentes** (inscripciones a la tecnicatura en octubre para el ciclo siguiente, mediados de año y mesas de examen finales; más de 100 alumnos y entre 150 y 200 aspirantes por ingreso). Consecuencia: el sitio público se sirve **desde caché** (páginas estáticas con revalidación), la API pública es de solo lectura y cacheable, y los archivos (PDF, imágenes) salen de un CDN. El panel tiene pocos usuarios simultáneos. La elección de hosting y base gratuitos (ADR-15) debe verificarse contra este objetivo con una prueba de carga antes de la demostración.

## Rendimiento

Páginas públicas en caché; imágenes WebP con `next/image`, `loading="lazy"` y dimensiones explícitas; paginación en listados; índices en `status` y fechas de vigencia; sin dependencias pesadas en el sitio público.
