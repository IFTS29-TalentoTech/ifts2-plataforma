# Panel B: Horarios, Archivo y Configuración

Pantallas del panel de gestión que cubren RF06 (horarios y llamados), RF03 (archivo documental), RF01/RF05 (configuración, usuarios) y las integraciones configurables (ADR-020). Toda confirmación usa el `ConfirmDialog` del kit; los colores y fuentes salen solo de tokens.

## Pantallas, endpoints y permisos

| Ruta                    | Componente                                                                            | Endpoints                                                                                                                                                                 | Permiso (`can`)                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/panel/horarios`       | `horarios/horarios-screen.tsx`, `schedule-dialog`, `exam-call-dialog`, `term-dialogs` | `GET/POST /terms`, `PUT /terms/:id/public-current`, `GET/POST/PATCH/DELETE /schedules`, `POST /schedules/:id/publish\|unpublish`, ídem `/exam-calls`, `POST /documents`   | `schedules:manage`, `examCalls:manage`, `terms:manage`; cambiar ciclo público: `terms:setPublic` (solo ADMIN); eliminar: `*:delete` |
| `/panel/archivo`        | `archivo/archivo-screen.tsx`, `detail-dialog`, `upload-dialog`                        | `GET /documents`, `GET /documents/:id`, `GET /documents/:id/file`, `POST /documents`, `POST /documents/:id/archive\|restore`, `DELETE /documents/:id`                     | `documents:manage`, `documents:delete`                                                                                              |
| `/panel/configuracion`  | `configuracion/configuracion-screen.tsx`                                              | `GET/PUT /settings`, `GET /terms`                                                                                                                                         | `settings:manage` (ADMIN)                                                                                                           |
| (modal) usuarios        | `configuracion/users-dialog.tsx`                                                      | `GET/POST/PATCH /users`, `POST /users/:id/deactivate\|activate\|reset-password`                                                                                           | `users:manage`                                                                                                                      |
| (pestaña) contenido     | `configuracion/content-editor.tsx`                                                    | `GET /content/:page`, `PUT/DELETE /content/:page/:slug`                                                                                                                   | `content:manage`, `content:delete`                                                                                                  |
| (pestaña) enlaces       | `configuracion/links-editor.tsx`                                                      | `GET/POST/PATCH/DELETE /links`                                                                                                                                            | `links:manage`, `links:delete`                                                                                                      |
| `/panel/roles` (RF11)   | `roles/roles-screen.tsx`                                                              | `GET /roles`, `GET /permissions`, `POST /roles`, `PATCH/DELETE /roles/:id`, `PUT /roles/:id/permissions`                                                                  | `roles:manage` (solo SUPERADMIN)                                                                                                    |
| (pestaña) integraciones | `integrations-panel.tsx`, `instagram-card.tsx`, `mail-card.tsx`                       | `GET/PUT /integrations/instagram`, `GET .../connect`, `POST .../test`, `POST .../disconnect`, `GET/PUT /integrations/mail`, `POST /integrations/mail/test`, `GET /health` | `integrations:manage` (ADMIN)                                                                                                       |

Los elementos sin permiso no se muestran; la API igual responde 403.

## Piezas compartidas

- `lib/use-resource.ts`: lectura con estados cargando/listo/error y recarga sin parpadeo.
- `lib/use-reset-on.ts`: reinicia formularios al abrir un diálogo (el lint prohíbe `setState` en efectos).
- `lib/documents.ts`: subida multipart y URL firmada. `lib/format.ts`: pesos, etiquetas y errores.
- `components/file-field.tsx`: validación previa de tipo y tamaño (la API revalida). `components/markdown-preview.tsx`: vista previa sin HTML crudo.

## Reglas importantes

- Eliminar solo contenido no publicado / archivado / oculto, con confirmación. Los usuarios no se eliminan: se desactivan.
- Usuarios: el rol se cambia con "Cambiar rol" (formulario + confirmación), nunca al tocar un desplegable; sobre el propio usuario no hay acciones.
- Roles (RF11): el selector de usuarios ofrece solo roles con `assignable: true` (anti-escalada); un rol con usuarios no se elimina; SUPERADMIN no se edita. La interfaz oculta lo que la sesión no puede usar, pero quien protege es la API.
- Archivar un documento adjunto a contenido visible: 409 `requiresConfirmation`, segunda confirmación y reintento con `force`.
- El App Secret y la contraseña SMTP nunca se muestran ni vuelven a pedirse; la clave temporal de un usuario se muestra una sola vez.

## Cómo probar

1. `pnpm db:migrate && SEED_MODE=demo pnpm db:seed`; API `pnpm --filter @ifts2/api dev`.
2. Web con `API_ORIGIN` exportado (Q105): `API_ORIGIN=http://localhost:4113 PORT=3113 pnpm --filter @ifts2/web dev` (o `build` + `start`).
3. `cd apps/web && CYPRESS_BASE_URL=http://localhost:3113 env -u ELECTRON_RUN_AS_NODE npx cypress run --spec "cypress/e2e/panel-b/*.cy.ts"`.
4. Usuarios demo: `admin@ifts2.local` / `Cambiame-123!`, `bedelia@ifts2.local` y `editor@ifts2.local` / `Demo-2026-ifts2`.

## Capturas

`capturas-manual.cy.ts` deja las imágenes en `cypress/screenshots/capturas-manual.cy.ts/`; se copian a `docs/capturas/panel/` (prefijo `b-`).
