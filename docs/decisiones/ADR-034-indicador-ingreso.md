# ADR-034 — Tarjeta "Ingreso" del Resumen: solo datos verificables (A14)

Fecha: 2026-11-07. Estado: aceptada para revisión. El origen del año de ingreso queda a confirmar (Q133).

## Problema

La tarjeta "Ingreso" del Resumen mostraba "Ciclo {año del período vigente + 1}" y un texto fijo:
"Guía de requisitos y ficha de preinscripción activa en la web". Ese texto no dependía de ningún
dato: el panel afirmaba una preinscripción activa que podía no existir y presentaba una estimación
como dato institucional.

## Decisión

1. `GET /dashboard` agrega `ingresoContent: { visibleSections, pendingConfirmation }`, calculado al
   consultar sobre las secciones **visibles** de `ContentSection` con `page='ingreso'` (las mismas que
   publica `/ingreso`).
2. `pendingConfirmation` usa la convención que ya tiene el proyecto para datos no confirmados: la
   marca `[a confirmar ...]` en el texto (regla 10 de AGENTS, `08-contenido-y-datos-semilla.md`). La
   detección vive en `@ifts2/shared` (`hasPendingConfirmation`).
3. La tarjeta muestra **Sin publicar** (0 secciones), **A confirmar** (hay marca) o **Publicada**, y
   aclara que el año es **estimado** mientras `ingresoCycle.derived` sea `true`.

No se agrega una configuración nueva ("preinscripción abierta" o una fecha de convocatoria): duplicaría
lo que ya se edita en Contenido de páginas -> Ingreso y podría contradecir la página pública.

## Consecuencias

- Si quien edita el contenido escribe un dato provisorio **sin** la marca, la tarjeta dirá
  "Publicada". La marca es la convención documentada; el Manual de Usuario explica cómo usarla.
- Cuando el instituto defina una convocatoria con fechas propias (Q133), se puede reemplazar la
  estimación del año por ese dato sin cambiar la forma de `ingresoContent`.
