# ADR-033 — Inscripciones: enlace de alumnos explícito y estado efectivo de los llamados (A07, A08)

Fecha: 2026-11-07. Estado: aceptada para revisión. La precedencia del interruptor general queda a
confirmar con el instituto (Q131).

## Problema

**A07.** `/inscripciones` elegía el enlace de "¿Dónde me inscribo?" buscando "SIU" o "Guaraní"
en el título. Hay dos: el de alumnos (oculto hasta tener la URL oficial, Q6) y el de gestión
académica (profesores y secretaría, visible). Se mostraba el segundo. Si no había coincidencias,
la página ofrecía **todos** los enlaces.

**A08.** Las tarjetas de llamados usaban solo la casilla `enrollmentOpen` de cada llamado. La
insignia general usaba el ajuste `exam_enrollment_open`. La página podía decir "Inscripción a mesas
cerrada por ahora" y, debajo, un llamado con "Inscripción abierta". Además, un llamado ya terminado
seguía figurando abierto mientras nadie desmarcara la casilla.

## Decisión

1. **Marca explícita en el enlace** (`ExternalLink.enrollment`, booleano, por defecto `false`;
   migración `20261107030216_enlace_inscripcion`). El panel la muestra como "Enlace de inscripción
   de alumnos". `/inscripciones` muestra **solo** los enlaces visibles con esa marca. Si no hay
   ninguno, avisa "El enlace de inscripción todavía no está publicado" y ofrece el correo de
   Bedelía. No hay deducción por título ni caída a "todos los enlaces". La semilla marca "SIU
   Guaraní — Acceso alumnos", que sigue oculto hasta confirmar su URL.
2. **Estado efectivo calculado al consultar** (`effectiveExamEnrollmentOpen` en `@ifts2/shared`):
   un llamado figura abierto en el sitio público solo si el interruptor general está encendido,
   su casilla está marcada y `now < endsOn`. La API (`/public/home` y `/public/students`) ya
   entrega ese valor en `enrollmentOpen`. La casilla guardada no se modifica y no hay tareas
   programadas (regla 3 de AGENTS).

## Alternativas descartadas

- **Reusar `group`** con un valor especial ("inscripciones"): no requiere migración, pero es texto
  libre (un error de tipeo rompe la página sin aviso) y mezcla agrupación con propósito.
- **Mejorar la expresión regular** del título: sigue dependiendo de cómo se llame el enlace.
- **Mostrar ambos estados sin conjunción** (por ejemplo, avisar "cerrada" y listar los llamados
  marcados igual): mantiene un mensaje contradictorio para el estudiante.

## Consecuencias

- Una instalación existente debe **marcar a mano** el enlace de alumnos en Configuración ->
  Enlaces (la migración no lo deduce por título, a propósito). La semilla lo hace en entornos nuevos.
- Si el instituto usa el interruptor general solo como texto informativo, con la regla actual
  apagarlo oculta como "abiertos" todos los llamados. Revertirlo es cambiar una función
  (`effectiveExamEnrollmentOpen`) y sus pruebas (Q131).
- El panel (Horarios) sigue mostrando la casilla de cada llamado tal como está guardada, no el
  estado efectivo. Es dato de gestión, no lo ve el público.
