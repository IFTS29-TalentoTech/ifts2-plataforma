# Módulo `public` — API de solo lectura del sitio público

Sin sesión. Todas las respuestas están tipadas en `packages/shared/src/academic.ts` (`Public*Dto`), pensadas para que la web las consuma con `import type`.

| Ruta                                                                 | Respuesta (`@ifts2/shared`)  | Notas                                                                                 |
| -------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `GET /public/home`                                                   | `PublicHomeDto`              | Frase ancla, accesos, hasta 6 publicaciones HOME/BOTH, destacados.                    |
| `GET /public/publications?year=&category=&archived=&page=&pageSize=` | `PublicPublicationsDto`      | NEWS/BOTH vigentes; `archived=true` = vencidas del año (por defecto el año en curso). |
| `GET /public/publications/:id[?archived=true]`                       | `PublicPublicationDetailDto` | 404 si no está vigente (con `archived=true`, solo si está vencida).                   |
| `GET /public/students[?audience=]`                                   | `PublicStudentsDto`          | Ciclo público, horarios, llamados, avisos (urgentes primero), enlaces.                |
| `GET /public/content/:page`                                          | `PublicContentDto`           | `institucional`, `carrera` o `ingreso`; solo secciones visibles.                      |
| `GET /public/settings`                                               | `PublicSettingsDto`          | Objeto plano; sin `instagram_hashtag`; `exam_enrollment_open` es booleano.            |

## Garantías

- **Vigencia siempre calculada al consultar**, con dos capas: filtro SQL (`visibleNoticeWhere`, `visiblePublicationWhere`) y verificación con las funciones de `@ifts2/shared` (`isNoticeVisible`, `isPublicationVisible`, `isScheduleVisible`, `isExamCallVisible`). `visibleFrom` inclusivo, `visibleUntil` exclusivo. Nada vencido, pausado, sin publicar, programado a futuro ni de otro ciclo sale de acá (probado con reloj fijo en `test/api/public.test.ts`).
- **Caché HTTP (RNF09):** `Cache-Control: public, max-age=20, s-maxage=30, stale-while-revalidate=30` para contenido dinámico y `max-age=30, s-maxage=60, stale-while-revalidate=60` para ajustes y textos; ETag habilitado (304). Un cambio llega al visitante en ~60 s como máximo. Los errores no llevan `Cache-Control`.
- **Archivos:** URL firmada de 30 min (más larga que la vida de la caché). Si el almacenamiento falla, `downloadUrl` es `null` y la página sigue cargando (RNF03). Nunca sale la clave de almacenamiento.
- **Destacados** (reunión 06/10): un llamado `highlighted` deja de resaltarse al llegar su `endsOn`; un aviso destacado lo está mientras sea vigente.
- Lee `Publication` y `Category` directo con Prisma (no importa módulos de otros agentes). `coverUrl` se devuelve tal cual si es una URL o ruta; si parece una clave de almacenamiento, se firma.

Archivos: `index.ts` (rutas), `public.service.ts` (filtros y mapeos).

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/public.test.ts`
