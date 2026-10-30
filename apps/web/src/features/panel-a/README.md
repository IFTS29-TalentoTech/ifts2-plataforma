# Panel · parte A (login, Resumen, Publicaciones, Avisos, Mensajes)

Pantallas del panel de gestión que implementa el agente "panel-a". Las rutas (`src/app/panel/...`) son finas: validan permisos con `can()` y renderizan un componente de esta carpeta. Todo el comportamiento vive acá.

## Pantallas, endpoints, componentes y permisos

| Ruta                         | Componente                                                                                  | Endpoints                                                                                                                                                                                           | Permiso (rol)                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/panel/login`               | `login/login-form.tsx` (+ `auth-frame.tsx`)                                                 | `POST /auth/login`                                                                                                                                                                                  | público                                                                                                       |
| `/panel/login/cambiar-clave` | `login/change-password-form.tsx`                                                            | `POST /auth/change-password`                                                                                                                                                                        | sesión con `mustChangePassword`                                                                               |
| `/panel` (Resumen)           | `dashboard/dashboard-view.tsx`                                                              | `GET /dashboard`, `GET /social/posts?status=DETECTED&pageSize=3`, `GET /notices?status=ACTIVE&pageSize=3`, `POST /social/sync`, `POST /social/manual`                                               | `dashboard:read` (todos). Redes: `social:moderate` (EDITOR, ADMIN). Avisos: `notices:manage` (BEDELIA, ADMIN) |
| `/panel/publicaciones`       | `publicaciones/publicaciones-view.tsx` → `social-posts-tab.tsx`, `own-publications-tab.tsx` | `/social/posts` (+ `approve`, `discard`, `restore`, `DELETE`), `/social/sync`, `/social/manual`, `/publications` (+ `publish`, `pause`, `schedule`, `reactivate`, `cover`, `DELETE`), `/categories` | `publications:manage`, `social:moderate`, `social:delete` (EDITOR, ADMIN)                                     |
| `/panel/avisos`              | `avisos/avisos-view.tsx`, `avisos/notice-form-dialog.tsx`                                   | `/notices` (+ `pause`, `resume`, `DELETE`), `POST /documents` (adjunto), `GET /documents/:id/file`, `/categories`                                                                                   | `notices:manage`, `notices:delete` (BEDELIA, ADMIN)                                                           |
| `/panel/mensajes`            | `mensajes/mensajes-view.tsx`                                                                | `/contact-messages` (`GET`, `PATCH`, `DELETE`)                                                                                                                                                      | `contact:read` (ADMIN, BEDELIA); eliminar solo ADMIN                                                          |

Modales compartidos: `publicaciones/moderation-dialog.tsx` (lo usan Resumen y Publicaciones), `publicaciones/manual-post-dialog.tsx`, `publicaciones/publication-form-dialog.tsx`, `publicaciones/vigencia-dialog.tsx` (programar/reactivar), `avisos/notice-form-dialog.tsx` (lo usan Avisos y Resumen).

`lib/`: `use-resource.ts` (carga con estados cargando/error/datos y recarga), `errors.ts` (mensajes humanos por código HTTP, `fieldMessages`, 401 -> login), `display-error.ts` (error legible dentro de `ConfirmDialog`), `use-sync.ts` (botón sincronizar), `use-categories.ts`, `caption.ts` (título/resumen derivados de la leyenda), `dates.ts`, `types.ts`.

## Reglas que cumple (y dónde)

- **Toda confirmación usa `ConfirmDialog`** (publicar, descartar, restaurar, pausar, reanudar, eliminar). Los formularios usan `Dialog`; ambos atrapan y devuelven el foco.
- **Eliminar es manual y confirmado**; el botón solo aparece si el elemento es eliminable (avisos pausados/vencidos, publicaciones en borrador/pausadas/vencidas, publicaciones de redes descartadas, mensajes respondidos) y, si la API responde 409, se muestra su motivo.
- **Nada de redes se publica sin aprobar**, con casilla obligatoria de consentimiento de imágenes de estudiantes (`consentConfirmed`).
- **Permisos por rol**: el menú, los bloques del Resumen y los botones se ocultan con `can(role, ...)`; una URL directa sin permiso muestra `no-access.tsx`. La API devuelve 403 igual.
- **Sesión vencida (401)** en cualquier pantalla lleva a `/panel/login?expired=1`. Un restablecimiento de clave (`mustChangePassword`) redirige a `/panel/login/cambiar-clave` desde el layout del panel.
- **Instagram caído**: el Resumen muestra el estado y el motivo, el panel sigue funcionando y se ofrece la carga manual (`POST /social/manual`).
- Colores y fuentes solo por tokens (el lint lo verifica); nada institucional escrito en el código.

## Cómo probar

```bash
pnpm db:migrate && SEED_MODE=demo pnpm db:seed
pnpm --filter @ifts2/api dev                 # API (puerto de .env)
PORT=3112 pnpm --filter @ifts2/web dev       # web
# usuarios demo: admin@ifts2.local / Cambiame-123!  ·  bedelia@ifts2.local y editor@ifts2.local / Demo-2026-ifts2

cd apps/web
CYPRESS_BASE_URL=http://localhost:3112 env -u ELECTRON_RUN_AS_NODE pnpm exec cypress run --spec "cypress/e2e/panel-a/*.cy.ts"
```

Especificaciones (`apps/web/cypress/e2e/panel-a/`): `login.cy.ts` (E2E-02), `publicaciones.cy.ts` (E2E-03/04/05/13), `avisos.cy.ts` (E2E-06/07/13/15/16/17), `roles-mensajes.cy.ts` (E2E-11 y mensajes) y `capturas.cy.ts` (genera las imágenes del Manual de Usuario en `docs/capturas/panel/`, en 1440 y 390 px). Soporte: `cypress/support/panel-a.ts` (login por API con `cy.session`, datos de prueba, limpieza) y `panel-a-tasks.ts` (tareas de Node: base de datos y mover capturas).

Notas de las pruebas:

- Los fallos de login y el bloqueo por intentos (429) se **simulan** con `cy.intercept`: el límite real es por IP y dejaría bloqueada a toda la suite; el comportamiento real lo prueban los tests de la API.
- La falla de Instagram (E2E-05) se fuerza interceptando `/dashboard` y `/social/sync`.
- Cada prueba crea sus datos con nombres únicos y se limpian al empezar y terminar (`cleanupE2eData`, `cleanupE2eSocial`).
- Un aviso "ya vencido" no se puede crear por la API (422): se vence directo en la base (`panelA:expireNotice`).
- En el modo de desarrollo, esperá a que la lista cargue antes de hacer clic (la pantalla se hidrata recién ahí); las pruebas lo hacen con `cy.get('main h3')`.

## Decisiones y supuestos (ver `docs/specs/09-preguntas-abiertas.md`, Q80 a Q86)

El estado "Revisar" (Q80), el filtro Origen en el navegador (Q81), los conteos de Avisos sobre `status=ALL` (Q82), Mensajes sin diseño (Q83), "Prioridad visual" omitida (Q84), correo institucional sin dominio fijo (Q85) y la nueva fecha al reactivar un aviso vencido (Q86).
