# ADR-038 · Sincronización incremental de Instagram

Estado: Aceptada. Complementa ADR-09, ADR-20 y ADR-030.

## Contexto

Cada sincronización pedía a Instagram todo el listado `/me/media` (hasta 6 páginas de 50) aunque casi todo ya estuviera importado. Es una consulta pesada y, con el cron diario más el botón manual, innecesaria. El equipo pidió registrar cada fetch exitoso y, la vez siguiente, traer solo lo posterior.

## Decisión

1. **Registro del último fetch exitoso.** Se guarda en `IntegrationConfig` con la clave `instagram_sync` (JSON cifrado, igual que el resto; sin migración). Es una clave aparte de `instagram` para que "Guardar configuración" y "Desconectar" no la pisen y porque en modo demostración no existe la fila `instagram`. Contiene: `lastFetchAt` (cuándo terminó el fetch), `coveredUntil` (marca: "hasta acá ya se vio todo"), `mode`, `count`, y la identidad con la que se sincronizó: `accountId`, `hashtag` y `connection`. **Nada secreto** (el id de usuario de Graph no lo es). `InstagramToken.lastSyncAt/lastSyncOk` siguen siendo el último _intento_ (sea cual sea su resultado) y alimentan el estado "con error" del Resumen.
2. **Cómo se corta.** `fetchRecentMedia` recibe `since` y corta la paginación en cuanto ve una publicación más vieja (Instagram ordena de la más nueva a la más vieja); no se la devuelve. **No** se usa el parámetro `since` de la Graph API: está documentado para el borde de medios del usuario, pero no se pudo verificar que `graph.instagram.com` (inicio de sesión de Instagram) lo respete y no hay cuenta de Meta para probarlo. Cortar de nuestro lado funciona igual en ambos casos.
3. **Punto de partida.** `since = marca − 6 h` (margen de solapamiento para demoras de Instagram y relojes; la idempotencia por `externalId` evita duplicados). Además se retrocede hasta la publicación pendiente (`DETECTED`) más vieja, con tope de 14 días hacia atrás, porque las URLs de imagen de Instagram vencen y antes cada sincronización las refrescaba. Las pendientes más viejas se refrescan con la sincronización completa.
4. **La marca nueva** es el instante en que _empezó_ el fetch (lo publicado mientras tanto se verá la próxima vez). Si una incremental se corta por límite (50) o tope de páginas antes de llegar a la marca anterior, la marca retrocede a la publicación más vieja examinada para que la siguiente continúe desde ahí (`FetchCoverage` por `onCoverage`, sin cambiar el tipo de retorno).
5. **Un fetch fallido no avanza la marca**: solo se guarda después de importar las publicaciones. Si guardarla falla, se registra y la próxima será completa.
6. **Cuándo es completa** (`mode: 'full'`, con `fullReason`): primera vez (`first`), pedida a mano (`forced`), o si cambió la **cuenta** (`account`), el **hashtag** (`hashtag`) o el **método de conexión** (`connection`). El id de la cuenta se obtiene en cada sincronización con una llamada liviana (`GET /me?fields=id`, `InstagramClient.getAccountId()`); si no coincide con el guardado, o no hay registro, se hace la carga histórica completa y se reemplaza el registro. El doble de demostración (`FakeInstagramClient`) cumple la misma interfaz (`since`, `getAccountId`, cobertura), así que el modo demo recorre el mismo camino.
7. **Forzar.** `POST /social/sync?full=true` (mismo permiso `social:moderate` y mismo rate limit). La UI lo ofrece como botón secundario "Sincronización completa" en Publicaciones, con el `ConfirmDialog` único. El cron y el planificador son siempre incrementales.
8. **Se informa** `mode`, `fullReason`, `since` y `lastFetchAt` en la respuesta de sync, y `lastFetchAt`, `lastSyncMode`, `lastFetchCount` en `GET /integrations/instagram`; `lastFetchAt` y `lastSyncMode` también en `GET /dashboard`.

## Consecuencias

- Una publicación vieja a la que recién se le agrega el hashtag (o que Instagram demora en mostrar más de 6 h) no la trae una incremental; sí la completa. El botón existe para eso.
- La completa sigue acotada (50 con el hashtag, 6 páginas): es "lo reciente", no todo el historial.
- Una llamada extra y liviana (`/me?fields=id`) por sincronización.
- No verificado contra una cuenta real de Meta: solo contra el servidor simulado (`test/helpers/instagram-mock.ts`) y el doble.
