# 09 · Preguntas abiertas y supuestos

Cada fila indica **qué se asume mientras no haya respuesta** para que el agente pueda avanzar sin bloquearse. Responde el equipo humano (Martín Juan es el canal con el cliente; Santiago Cuda decide infraestructura). El agente que implementa agrega acá lo que encuentre.

## Con el cliente (IFTS N.° 2)

| N.° | Pregunta | Supuesto provisorio | Impacta |
|---|---|---|---|
| Q1 | ¿Qué hashtag identifica las publicaciones de Instagram que pueden ir al sitio? | `#ifts2web` configurable en Configuración | RF04 |
| Q2 | ¿La cuenta de Instagram `ifts_2_ok` es profesional (Business/Creator) y quién autoriza la conexión? | Se asume que se puede convertir; si no, solo carga manual | ADR-09 |
| Q3 | ¿Editores (comunicación) y Bedelía son roles separados? ¿Quiénes son las personas de cada rol? | Tres roles separados: ADMIN, BEDELIA, EDITOR | ADR-18 |
| Q4 | La paleta de marrones está **definida** con el cliente (feedback posterior a la reunión del 06/10). ¿Hay otras correcciones de diseño tras explorar el prototipo? | El Figma vigente; los tokens se cambian en un solo archivo | Diseño |
| Q5 | ¿A qué correo debe llegar el formulario de contacto? | `dfts_ifts2_de20@bue.edu.ar` | RF08 |
| Q6 | ¿Cuál es la URL de SIU Guaraní para alumnos, la de Mi Argentina para el título digital y el enlace o contacto de Tutoría? | Enlaces marcados "a confirmar" ocultos hasta tenerlos | RF07 |
| Q7 | ¿Cuáles son los requisitos, fechas y documentos de ingreso? | Texto provisorio del Figma | Pantalla 05 |
| Q8 | ¿Qué comisiones existen y cuántos llamados a examen por ciclo? | Comisión A y B, Comisión Única, Prácticas Finales (del Figma) | Pantalla 10 |
| Q9 | **Parcialmente resuelta el 06/10:** el cliente aceptó un calendario académico y de mesas cargado por archivos por el administrador, con casillas para destacar eventos próximos. Pendiente: ¿se desea además una tabla navegable? (original: ¿los horarios y mesas se publican como archivo adjunto, como tabla navegable o ambos? El Figma muestra archivo; el relevamiento pidió "no Excel o PDF incrustado" | Se publican como **archivo adjunto con ficha de datos** (comisión, ciclo, fechas); la tabla navegable queda para una versión siguiente | RF06 |
| Q10 | ¿Cuántas fotos por álbum o publicación son razonables? | Máximo 10 por publicación; imágenes comprimidas | RNF05 |
| Q11 | ¿Quién redacta el aviso de uso de datos y el consentimiento de imágenes? | Texto estándar a validar con la supervisión del GCABA | RNF08 |
| Q12 | Contacto, Galería y Plantel docente: ¿se diseñan para el MVP? | Se resuelven con los componentes existentes (prioridad S o C) | Alcance |
| Q20 | Nombres finales de los ítems de menú al separar "ingreso a la tecnicatura" de "inscripción a carreras y exámenes" | "Ingreso" (aspirantes) y "Inscripciones" (alumnos) | Navegación |
| Q21 | ¿Se confirma el acceso de todos los grupos a la carpeta de Drive con logos y materiales de marca? | Usar los logos de `cliente/ifts2/` | Diseño |
| Q13 | Dominio .edu.ar: ¿quién tiene o gestiona la documentación? | Subdominio provisorio gratuito | ADR-15 |

## Con la cátedra y el equipo

| N.° | Pregunta | Supuesto provisorio | Responsable |
|---|---|---|---|
| Q14 | Hosting, base de datos, almacenamiento y correo gratuitos definitivos, sin vencimiento ni suspensión | Interfaces reemplazables; proveedor a elegir | Santiago Cuda |
| Q15 | ¿El panel necesita versión móvil diseñada para el MVP? | Usable en móvil, sin diseño específico | Gastón Zampar |
| Q16 | ¿Se acepta que "¿Olvidaste tu clave?" lo resuelva un administrador en el MVP? | Sí (ADR-06) | Martín Juan |
| Q17 | ¿Existe tabla navegable de plan de estudios y correlatividades en el MVP o solo tarjetas? | Tarjetas por año con enlace al documento; tabla navegable es S | Martín Juan |
| Q18 | El hito de la semana 13: ¿se acuerda un MVP recortado con el cliente si el PERT se confirma? | Sí; recorte de abajo hacia arriba (Could, Should) | Martín Juan |
| Q19 | Texto completo de los subtítulos de pantalla que el Figma muestra truncados (ej. el aviso de acceso restringido del login) | Copiar del Figma con `get_design_context` | Gastón Zampar |

## Discrepancias detectadas entre documentos

1. **Figma vs relevamiento (horarios):** el relevamiento pidió datos estructurados en lugar de Excel o PDF incrustado; el Figma carga **archivos** por comisión. Se resolvió provisoriamente en Q9.
2. **Datos de ejemplo del Figma** (correo y teléfono) no coinciden con los reales.
3. **Etapa 2 entregada** describe la paleta verde y un panel con "Institucional, Contacto, Galería y Plantel" como pendientes de diseño; el Figma vigente sí diseñó Institucional, Archivo, Configuración y Login, y reemplazó la paleta. Esta carpeta se basa en el Figma vigente.
4. **Nombres de rol:** la Etapa 2 habla de Administrador y Editor; el Figma habla de Rectoría / Dirección y Bedelía Académica. ADR-18 propone tres roles que cubren ambos.
