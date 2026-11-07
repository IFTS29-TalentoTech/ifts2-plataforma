# ADR-037 · Plantel docente y materias a cargo

**Estado:** aceptada (07/11/2026). Cumple RF10 y la historia US-29. Sigue el patrón de ADR-036 (galerías) y respeta ADR-07 (nada se borra solo).

## Contexto

RF10 pide "plantel docente y materias a cargo" (Should) y US-29 "alta, baja lógica y visibilidad". El Figma no tiene pantalla de plantel (Q12): se resuelve con los componentes existentes. No hay datos reales de docentes en ningún documento del cliente y la foto de una persona es un dato personal (Ley 25.326, RNF08).

## Decisión

1. **Modelo.** Tabla `Teacher` (`name`, `role` cargo libre, `subjects` lista de textos, `photo`, `order`, `visible`, fechas; índice por `visible` y `order`). Migración aditiva `20261107130000_plantel`, que también concede `teachers:manage` a los roles ADMIN y EDITOR que ya existen. Las materias son **texto libre** y no una relación con el plan de estudios: el plan vive en `ContentSection` y se edita como contenido; atar a una persona a una fila del plan complicaría los cambios de plan sin aportar nada al sitio.
2. **Baja lógica.** `visible=false` oculta a la persona del sitio (`GET /public/teachers` devuelve solo las visibles) pero la conserva y se puede volver a mostrar.
3. **Eliminación.** Manual, con `ConfirmDialog`, auditada (`teachers.delete`) y **solo si la persona está oculta**: la API responde 409 si sigue visible y la interfaz recién ofrece "Eliminar" al ocultarla. Borra también la foto si era propia. Nunca hay eliminación automática.
4. **API.** Módulo `teachers` (`/teachers`): listar, alta (JSON), editar (incluye `visible`), `POST /:id/photo` y `DELETE /:id/photo`, orden (`PUT /order` con los ids de **todas** las personas; 409 si cambió) y eliminar. La foto sigue ADR-08 (JPG, PNG o WebP, 5 MB, tipo por firma, 1600 px, WebP). Hasta 12 materias por persona. Toda mutación va a `AuditLog` (`teachers.create`, `.update`, `.photo`, `.order`, `.delete`). Lectura pública sin sesión y con caché de contenido estanco.
5. **Permiso.** `teachers:manage` (recurso "Plantel docente" del catálogo) para ADMIN y EDITOR por defecto; el Superadministrador lo ajusta en "Roles y permisos". Un solo permiso para gestionar y eliminar, igual que `gallery:manage`: la regla de elegibilidad (solo ocultas) la aplica la API.
6. **Panel.** Página `/panel/plantel` (ítem "Plantel docente" del menú) y la misma pantalla como pestaña de Configuración. Subir/Bajar sin arrastrar (teclado y lectores de pantalla), Mostrar/Ocultar, Editar y Eliminar. El formulario recuerda el consentimiento de la foto.
7. **Sitio público.** Sección "Plantel docente" en **Institucional**, entre las tarjetas y Contacto (RF10 la ubica en la pantalla 02). Si no hay personas visibles, o la API falla, **no se dibuja nada** (RNF03). La foto es decorativa (`alt=""`); sin foto se muestran las iniciales.
8. **Semilla.** Producción deja el plantel **vacío**. La semilla **demo** carga 6 docentes **ficticios** ("Docente de ejemplo n") con materias tomadas del plan sembrado, sin fotos y uno oculto para mostrar la baja lógica; solo si la tabla está vacía. Está marcado como demostración en `prisma/seed-data.ts` y en esta documentación.

## Consecuencias

- Hasta que el instituto cargue su plantel real (Q138) la sección pública no aparece en producción.
- Las fotos de personas solo se cargan con consentimiento (Q139); la semilla no incluye ninguna.
- Cargar materias a mano puede quedar desfasado del plan si este cambia: es una decisión de simplicidad, reversible.
