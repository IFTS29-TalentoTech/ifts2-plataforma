# Módulo `settings` — Configuración del sitio

Datos institucionales en `SiteSetting` (clave/valor). **Producto genérico (ADR-022):** nada institucional está en el código; los valores del IFTS viven solo en la semilla.

- `GET /settings` — cualquier rol del panel. Objeto plano con TODAS las claves de `SETTING_KEYS` (`null` si no hay valor); `exam_enrollment_open` es booleano.
- `PUT /settings` — solo ADMIN (`settings:manage`). Parcial: solo cambian las claves enviadas. Valida con `settingsUpdateInput` (correo, URL, hashtag normalizado con `#`). Audita `settings.update` con los NOMBRES de las claves.

Lo que ve el público (sin `instagram_hashtag`) sale de `GET /public/settings` (módulo `public`). Lectura/escritura compartida en `src/lib/settings.ts`.

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/settings-content-links.test.ts`
