# ADR-044 — Clasificación de errores de Graph y diagnóstico de la sincronización de Instagram

Estado: aceptada (08/11/2026). Complementa ADR-09 y ADR-038.

## Contexto

Al probar un token real, **toda** sincronización terminaba con «El acceso a Instagram venció o fue revocado… No pudimos
confirmar el resultado». Dos causas, ambas en nuestro código y verificables sin credenciales:

1. `callGraph` (`apps/api/src/infra/instagram/graph.ts`) trataba como «token inválido» cualquier respuesta con
   `type: "OAuthException"`. Meta usa ese tipo también para el código **100** (parámetro o endpoint no válido) y para los
   de permisos (**10**, **200–299**), así que cualquier error de consulta pedía reconectar la cuenta aunque el token
   estuviera bien.
2. El panel agregaba «No pudimos confirmar el resultado. Revisá el estado antes de volver a enviar la operación» a todo
   5xx de una mutación (`apps/web/src/lib/api.ts`). Para `POST /social/sync` el servidor sí respondió y explicó el motivo
   (502 con detalle), y la sincronización no cambia nada si falla: el aviso era engañoso.

Además, la llamada auxiliar `/me?fields=id` (ADR-038) podía cortar toda la sincronización por un error que no tenía que
ver con el token.

## Decisión

- **Solo es «token vencido» el HTTP 401 o los códigos 190 y 102.** El resto se clasifica aparte
  (`classifyGraphError`): permisos (10, 200–299), límite de uso (429, 4, 17, 32, 613, 80002), problema temporal de Meta
  (5xx, 1, 2) y consulta rechazada (100 y demás 4xx). Cada clase tiene su mensaje en español.
- **Motivo técnico visible para el equipo.** `InstagramApiError.detail` lleva «Meta respondió HTTP 400, código 100/33:
  <mensaje> (rastreo Meta: …)», recortado a 300 caracteres y con cualquier `access_token=` redactado. La API lo agrega al
  502 («Detalle para el equipo: …»), a `lastError` (Resumen), a la auditoría `social.sync.failed` (`meta`) y a la prueba
  de conexión. Nunca incluye el token.
- **Pista para tokens de Facebook.** Si el token empieza con `EAA` y Meta lo rechaza con 190, el mensaje explica que esta
  conexión usa el token de «Instagram con inicio de sesión de Instagram» (graph.instagram.com).
- **La consulta de cuenta es auxiliar.** Si `getAccountId` falla por algo que no es el token, la sincronización sigue y es
  completa (`accountId` vacío = no comparable, `planSync` devuelve `full('account')`); queda un `warn` con el motivo. Si
  el token es inválido o falta configurar, corta como antes.
- **Panel:** `use-sync.ts` muestra el detalle del 502 tal cual, sin el sufijo genérico de «no pudimos confirmar».

## Consecuencias

- Un token válido con un error de consulta ya no empuja a reconectar la cuenta: el equipo ve el código de Meta.
- Sin credenciales reales no se pudo reproducir el error exacto del usuario; el detalle técnico del próximo intento lo va
  a mostrar (ver «Qué probar a mano» en `docs/avance.md`).
- Tests: `test/unit/instagram-graph.test.ts` (matriz de respuestas de Graph), `test/unit/sync-window.test.ts` y
  `test/api/social.test.ts` (sincronización con 100, 10, 4, falla solo de `/me` y 190).
