# ADR-020 · Integraciones configurables (Instagram, correo, almacenamiento)

Estado: Cerrada (pedido del cliente y del coordinador). Complementa ADR-08, ADR-09 y ADR-16.

## Contexto

La app de Meta la crea y administra **el cliente**, no el equipo. El producto se entrega configurable: elegir y configurar una integración no debe requerir tocar código ni que un desarrollador edite variables de entorno, salvo la infraestructura.

## Decisión

Cada integración vive detrás de una interfaz y una fábrica (`createStorage`, `createMailer`, `createInstagramClient` en `apps/api/src/infra/`). Hay dos niveles de configuración:

| Integración                         | La configura                                | Dónde                                                                                                      | Proveedores                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram                           | **El cliente, desde el panel** (solo ADMIN) | Base, tabla `IntegrationConfig` (`key='instagram'`), JSON **cifrado AES-256-GCM** con `APP_ENCRYPTION_KEY` | `demo` (FakeInstagramClient) / `real` (GraphInstagramClient). Variables `INSTAGRAM_*` solo como valor por defecto                                                                                           |
| Correo (destino de contacto y SMTP) | **El cliente, desde el panel**              | `IntegrationConfig` (`key='mail'`), cifrado                                                                | `console` / `smtp`. Variables `MAILER_PROVIDER`, `SMTP_URL`, `CONTACT_TO_EMAIL` como valor por defecto                                                                                                      |
| Almacenamiento                      | **DevOps, por entorno**                     | Variables de entorno                                                                                       | `STORAGE_PROVIDER = local \| memory \| s3` (S3 compatible: Supabase Storage, Cloudflare R2, MinIO) con `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_PUBLIC_URL` |

`APP_ENCRYPTION_KEY` sigue siendo de entorno (infraestructura).

### Resolución

- `createInstagramClient` y `createMailer` se resuelven **en cada uso** (no se cachean): los cambios hechos desde el panel aplican al instante. Orden: configuración guardada en la base -> variables de entorno -> modo demostración.
- Si hay una fila guardada con `mode: 'demo'`, gana sobre el entorno (el botón "Desconectar" vuelve a demostración aunque el entorno tenga valores).
- Sin configuración real, la API opera con `FakeInstagramClient` y consola; `GET /health` informa `integrations: { storage, mailer, instagram }` y `demoMode`, y el panel muestra "modo demostración".
- La configuración de entorno se valida con zod al arrancar: si el proveedor elegido exige variables que faltan, la API **no inicia** y lo explica.
- En pruebas se usan siempre dobles (`createTestApp`).

### Estados de Instagram

`demo` (sin configurar, modo demostración) · `credentials_saved` (falta conectar) · `connected` · `expiring` (token con menos de 10 días) · `error` (con motivo).

### Endpoints (solo ADMIN, con AuditLog, sin devolver secretos)

`GET/PUT /integrations/instagram`, `GET /integrations/instagram/connect` (URL de autorización OAuth), `GET /integrations/instagram/callback`, `POST /integrations/instagram/test`, `POST /integrations/instagram/disconnect`, `GET/PUT /integrations/mail`, `POST /integrations/mail/test`. `GET` devuelve máscaras (`••••1234`), el estado, la `redirectUri` exacta que el cliente debe registrar en su app de Meta (derivada de `API_ORIGIN`), los scopes requeridos y `setupSteps` (guía paso a paso en `packages/shared/src/instagram-guide.ts`, reutilizable en el Manual de Usuario). Alternativa a OAuth: pegar un token de acceso (`accessToken` en el `PUT`).

## Consecuencias

- Los secretos nunca aparecen en respuestas, logs ni auditoría (solo nombres de campos).
- `GraphInstagramClient` es un **esqueleto**: lanza errores claros "no configurado" y trae `fetchRecentMedia`/`testConnection`/canje de código, **sin verificar contra la API real**. Lo completa el agente de Instagram (renovación del token, sincronización).
- `S3Storage` implementado pero no probado contra un servicio real (sin credenciales).
