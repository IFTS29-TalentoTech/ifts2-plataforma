# ADR-039 — Enlaces de interés: elegir dónde se muestran

**Estado:** aceptada · 08/11/2026

## Contexto

El panel pedía un «Grupo» de texto libre (por ejemplo «academico») que el sitio nunca usó para decidir dónde
aparece un enlace, y dos interruptores sin texto de estado. En el sitio, los enlaces visibles aparecían
siempre en Inicio y en Estudiantes, y solo los marcados `enrollment` en Inscripciones. Nadie podía elegir
el lugar y las personas que administran (muchas, mayores) no entendían qué cambiaba cada control.

## Decisión

- Cada enlace tiene tres lugares: **Inicio** (`showHome`), **Estudiantes** (`showStudents`) e
  **Inscripciones** (`enrollment`, ya existente). Se eligen con casillas («¿Dónde se muestra este enlace?»);
  se puede marcar más de uno. Los textos viven en `LINK_PLACES` (`packages/shared`).
- «Visible» pasa a un selector con frases completas («Sí, se muestra» / «No, queda oculto»), y cada fila de la
  lista dice con palabras dónde se ve y si está oculto.
- `group` **se conserva en la base y la API** (compatibilidad) pero ya no se edita ni se usa para ordenar.
- El orden se cambia con **Subir/Bajar** (`PUT /links/order`, ids de todos, auditado como `link.order`). Se
  ordena por `order` y título en el panel y en el sitio.
- API pública: `/public/home.quickLinks` = visibles con `showHome`; `/public/students.links` = visibles con
  `showStudents`; nuevo `/public/students.enrollmentLinks` = visibles con `enrollment`.

## Consecuencias

- Migración `20261108120000_enlaces_lugares`: dos columnas booleanas con valor por defecto `true`; los
  enlaces existentes se siguen viendo donde se veían (Inicio y Estudiantes).
- Un enlace visible sin ningún lugar marcado se rechaza en el formulario (no tendría efecto).
- La página Inscripciones lee `enrollmentLinks` en vez de filtrar `links`.
