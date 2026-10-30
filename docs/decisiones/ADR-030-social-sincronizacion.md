# ADR-030 · Sincronización de redes, renovación del token y copia de imágenes

Estado: Aceptada. Complementa ADR-09 y ADR-20.

## Contexto

ADR-09 pide sincronización manual y diaria, idempotente, con renovación del token de larga duración antes de vencer y copia de la imagen al aprobar (las URLs de Instagram expiran). No hay credenciales reales para verificar contra la API, y el hosting gratuito puede dormir el proceso.

## Decisión

1. **Sincronización**: `POST /social/sync` (manual) y `POST /social/cron` (diaria). Ambos usan `syncInstagram` y `renewInstagramTokenIfNeeded`. Todo lo traído queda `DETECTED`; nada llega al sitio sin aprobación.
2. **Cron externo primero**: `POST /social/cron` protegido por `CRON_SECRET` (comparación de tiempo constante; sin secreto el endpoint queda deshabilitado). El planificador interno (`SOCIAL_SCHEDULER_ENABLED`) es opcional y está apagado por defecto, porque en hosting gratuito el proceso se duerme. La vigencia no depende de ninguno de los dos.
3. **Renovación**: se renueva cuando faltan 10 días o menos (~50 de 60), al sincronizar o en la tarea diaria. Si el vencimiento es desconocido (token pegado a mano) se intenta y se registra el nuevo; si falla no se marca error. Un token vencido no se puede renovar: se informa "Volvé a conectar la cuenta".
4. **Falla de Instagram = degradación, no caída**: 502 con mensaje en español, `lastSyncOk=false` y motivo en `IntegrationConfig.lastError` para el Resumen; el cron responde 200 con `ok:false`.
5. **Imágenes**: se copian a `req.ctx.storage` al aprobar (`social/<uuid>.webp`); se guarda la **clave**, no una URL firmada. La descarga está limitada (tamaño, redirecciones, sin direcciones internas).
6. **Pruebas sin credenciales**: `fetch` inyectable (`AppContext.fetch`) y un servidor HTTP simulado en los tests.

## Consecuencias

- Falta la prueba de concepto contra la API real (queda en `docs/avance.md`).
- Quien sirva el sitio público debe resolver `coverUrl` (dirección o clave) con `lib/cover.ts`.
- Con varias instancias de la API, el rate limit y el planificador interno no se coordinan: usar el cron externo.
