# A06 — Portadas externas: evidencia de validación

Fecha local: 2026-11-06 (America/Buenos_Aires).
Repositorio: `IFTS29-TalentoTech/ifts2-plataforma`.
Base y destino: `develop`. Rama: `fix/portadas-externas`.

## Base e investigación

`git fetch origin refs/heads/develop:refs/remotes/origin/develop` y
`git merge-base --is-ancestor 4d2863b3e278014768efc94d6d0d5fcde0f57e38 origin/develop`
finalizaron correctamente. La rama parte de ese commit de integración de A05.

Se revisaron `next.config.ts`, `parts.tsx`, el detalle de novedades, `lib/cover.ts`,
`public.service.ts`, almacenamiento local/memory/S3 y la copia de medios en el servicio social.

- Las publicaciones manuales pueden conservar URLs absolutas externas o de la API.
- Las claves propias se firman al responder: local produce `API_ORIGIN/api/v1/files/...`,
  S3 produce una URL del endpoint/bucket configurado con parámetros `X-Amz-*`.
- Instagram copia la imagen a `social/<uuid>.webp`; se sirve desde ese almacenamiento,
  no desde la URL temporal original de Instagram. La descarga segura A01 no se modifica.
- Memory produce `memory://`, un doble de pruebas sin servidor de imágenes para navegadores.
- La URL pública/CDN opcional de `S3Storage` no se usa en la resolución pública actual.

La causa es la diferencia entre los orígenes recibidos y `remotePatterns`, limitado a la API:
`Cover` antes intentaba optimizar cualquier URL no local. Los dominios externos pueden fallar
la validación de `next/image` o recibir 400 del optimizador. Las firmas de la API eran
compatibles con el patrón anterior; las de S3 con otro origen no lo eran. Ahora se cargan
directamente todas las firmadas y las externas, y se conserva el optimizador para imágenes
propias sin parámetros. No hay patrón universal ni proxy adicional.

## Comandos y resultados locales

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | OK: ESLint, Prettier, estilos y tokens |
| `pnpm typecheck` | OK: shared, API y web |
| `TEST_DATABASE_URL=postgresql://ifts2:ifts2@localhost:5433/ifts2_test pnpm test` | OK: 48 shared + 530 API + 15 web = 593 pruebas |
| `pnpm build` | OK: shared, API y web |
| `pnpm test:covers` | OK: 20 casos Cypress, web compilada, Electron 146 |
| `git diff --check` | OK |

Las seis pruebas nuevas de API comprueban inicio/listado/detalle para portada propia,
externa, ruta relativa, clave firmada, ausencia de portada y falla al firmar. Las quince de
web verifican origen exacto, protocolo, puerto, credenciales, dominios parecidos, URLs
firmadas locales/S3, IPv4/IPv6 local y atributos de carga sin optimización.

Cypress ejecuta 10 escenarios a cada ancho (390 y 1440): tarjetas del inicio y de novedades;
detalle propio/externo/firmado/Instagram; detalle con firma vencida, imagen ausente o sin
portada; rechazo de dominios externos y parámetros por el optimizador. Valida imágenes
decodificadas, dimensiones, prioridad/preload, carga diferida, ancho, ausencia de overflow y
axe WCAG AA sin violaciones serias/críticas. No se suprimen excepciones de renderizado.

La API e imágenes de Cypress son simuladas. Las respuestas 404 de páginas ajenas a la suite
durante ese build son intencionales; las tres páginas verificadas reciben datos completos.
La configuración `cypress.covers.config.ts` no registra tareas de PostgreSQL y guarda
capturas de error dentro de `.next/covers-screenshots`.

## Protección A04 y preparación del entorno

Las integraciones se ejecutaron únicamente contra `ifts2_test` en PostgreSQL 17 del entorno
cloud. Antes de la primera corrida se verificó que estaba vacía y se agregó el comentario
`ifts2:disposable-test-database`. El setup A04 verificó nombre, puerto, destino y marca antes
de migrar y limpiar. No se ejecutaron seed/reset ni pruebas contra la base de desarrollo.

El cliente Prisma preinstalado correspondía a un esquema anterior a `develop`; la primera
corrida detectó esa diferencia. Se ejecutó `pnpm db:generate` y se repitieron pruebas y tipos,
con los resultados correctos de la tabla. Cypress se descargó en `/tmp` y Xvfb se extrajo de
paquetes oficiales Debian en `/tmp`; Chromium requirió ejecución fuera del aislamiento del
comando. Estos ajustes son del entorno y no agregan dependencias al repositorio.

## GitHub Actions y límites

El workflow del PR ejecuta lint, tipos, pruebas con PostgreSQL descartable verificado por
A04, build y la nueva suite de portadas sin base de datos. Conserva además el job E2E
existente. El estado y la corrida final de CI se informan en el PR.

Las URLs externas dependen de disponibilidad, restricciones del proveedor y compatibilidad
HTTPS con el sitio. Las firmas públicas usan TTL de 1800 segundos; una pestaña abierta o
una respuesta cacheada puede conservar una URL vencida. Se muestra el fallback y se permite
leer el contenido; no hay renovación ni reintento automático. No se probaron cuentas reales
de Instagram ni servicios S3/R2/Supabase/MinIO reales. No se avanza sobre A10.
