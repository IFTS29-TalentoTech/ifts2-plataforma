# Cómo contribuir

Flujo corto para quien se suma. El detalle de reglas está en `docs/specs/AGENTS.md` y `docs/BUILD-NOTES.md`.

## Flujo de trabajo

1. **Elegí una historia** de `docs/specs/07-backlog-y-plan.md` / `docs/specs/historias-de-usuario.md` y leé sus criterios de aceptación en `docs/specs/01-requerimientos.md`.
2. **Creá una rama** desde `main`: `feat/US-11-avisos`, `fix/login-mensaje`, `docs/readme-integraciones`.
3. **Trabajá en tu carpeta**: un módulo de API (`apps/api/src/modules/<nombre>/`) o tus pantallas (`apps/web/src/app/...`, componentes propios en `apps/web/src/features/<pantalla>/`). Evitá editar archivos compartidos; si hace falta (esquemas en `packages/shared`, kit de UI), hacé el cambio chico y aislado.
4. **Escribí pruebas** junto con el código (ver `apps/api/README.md` y `apps/web/README.md`).
5. **Verificá antes de abrir el PR**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

> **Hook de pre-commit:** al hacer `pnpm install` se activa solo (husky + lint-staged). En cada commit formatea y corrige con ESLint/Prettier los archivos que estás commiteando, así el `pnpm lint` del CI no falla por formato. Si no se activó, corré `pnpm prepare`. Saltearlo con `--no-verify` es posible, pero el CI igual lo va a frenar.

6. **Actualizá la documentación** que toques: README del paquete, `.env.example`, `docs/specs/04-api.md` si agregaste endpoints, un ADR en `docs/decisiones/` si decidiste algo, y una entrada en `docs/avance.md`.
7. **Pull request chico** con el criterio de aceptación verificado. Lo revisa otra persona. No se hace push directo a `main`.

## Commits

Conventional Commits, en español, en imperativo y concretos:

```
feat(avisos): pausar y reanudar un aviso
fix(auth): mensaje genérico si el usuario está desactivado
docs: guía de integración con Instagram
test(vigencia): borde exacto de visibleUntil
chore: actualiza dependencias
```

Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.

## Reglas que no se negocian

- Desarrollo a medida (sin CMS). Nada se borra solo; eliminar es manual y con confirmación. Nada de redes se publica sin aprobación humana.
- Interfaz en español rioplatense (voseo). Accesibilidad AA.
- Colores y tipografías solo por variables CSS; nada institucional escrito en el código.
- Toda entrada se valida con zod; toda mutación audita; los secretos solo en variables de entorno o cifrados en base.
- Comentarios en español que expliquen el **porqué** y las reglas de negocio (no lo obvio).

## Definición de terminado

Criterios de aceptación cumplidos · pruebas en verde (unitarias/API y el escenario Cypress) · lint, tipos y build sin errores · sin violaciones graves de axe · probado a 390 y 1440 px · `AuditLog` en cada mutación · documentación al día.
