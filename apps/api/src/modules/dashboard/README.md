# Módulo `dashboard` — Resumen del panel (US-12)

`GET /api/v1/dashboard` (permiso `dashboard:read`, los tres roles). Una sola respuesta para las tarjetas de la pantalla 07:

```json
{
  "instagram": {
    "mode": "real",
    "status": "connected",
    "ok": true,
    "lastSyncAt": "2026-10-29T12:00:00.000Z",
    "tokenExpiresAt": "2026-12-20T00:00:00.000Z",
    "hashtag": "#ifts2web"
  },
  "pendingPosts": 2,
  "activeNotices": 3,
  "noticesExpiringIn7Days": 1,
  "currentTerm": {
    "id": "…",
    "year": 2026,
    "kind": "SECOND",
    "label": "2.º cuatrimestre 2026",
    "startsOn": null,
    "endsOn": null
  },
  "examCallNext": {
    "id": "…",
    "name": "…",
    "startsOn": "…",
    "endsOn": "…",
    "enrollmentOpen": false,
    "published": true
  },
  "ingresoCycle": { "year": 2027, "derived": true },
  "ingresoContent": { "visibleSections": 2, "pendingConfirmation": true }
}
```

- `instagram.ok=false` incluye `error` (motivo) y la pantalla muestra "Instagram API: error"; en modo demostración (`mode: "demo"`) `ok` es `true`. Nunca trae secretos.
- Avisos: se leen con Prisma y se filtran con `isNoticeVisible` / `isNoticeExpiringSoon` de `@ifts2/shared` (vigencia al consultar). No importa los módulos de avisos.
- `examCallNext`: el primer llamado cuya fecha de fin no pasó (cualquier ciclo, publicado o no; `published` lo indica). `null` si no hay.
- `ingresoCycle`: **derivado** (año del ciclo vigente + 1). No existe todavía un dato propio de ingreso (Q133). La tarjeta lo presenta como **estimado**.
- `ingresoContent` (A14, ADR-034): estado verificable de la página pública de Ingreso. `visibleSections` = secciones visibles de `ContentSection` con `page='ingreso'` (las mismas que ve el público). `pendingConfirmation` = alguna tiene la marca `[a confirmar ...]` en el título o el texto (`hasPendingConfirmation` de `@ifts2/shared`). La tarjeta muestra "Sin publicar", "A confirmar" o "Publicada" y ya no afirma una "ficha de preinscripción activa".
- Para la lista "Publicaciones de redes por moderar" usar `GET /social/posts?status=DETECTED&pageSize=3`.

Pruebas: `test/api/dashboard.test.ts`.
