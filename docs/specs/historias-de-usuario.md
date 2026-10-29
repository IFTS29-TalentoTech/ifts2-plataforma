# Historias de usuario

Formato pedido por la cátedra: **Como [tipo de usuario], quiero [acción] para [objetivo]**, entre 8 y 12 historias, ordenadas por prioridad (alta, media, baja). La prioridad define qué entra en la primera versión del sistema. Cada historia indica los requerimientos que cubre (`especificaciones/01-requerimientos.md`), las historias técnicas del backlog (`especificaciones/07-backlog-y-plan.md`) y las pantallas del Figma (`especificaciones/05-ui-y-pantallas.md`).

## Actores

| Actor | Descripción |
|---|---|
| Aspirante | Persona interesada en la tecnicatura |
| Alumno | Estudiante que cursa la carrera |
| Editor | Docente de comunicación que maneja las redes del instituto |
| Bedelía | Personal de la Oficina de Alumnos |
| Administrador | Rectoría o Dirección, con acceso total |

## Prioridad alta (primera versión)

**H1 · Ver las publicaciones de redes detectadas**
Como **editor**, quiero **ver las publicaciones de Instagram del instituto que llevan el hashtag acordado** para **decidir cuáles se muestran en el sitio**.
- RF04 · US-07 · Pantallas 07 y 08.
- *Criterio:* al sincronizar aparecen como "Pendiente"; sincronizar dos veces no duplica; si Instagram falla, el panel lo informa y sigue funcionando.

**H2 · Aprobar una publicación con vigencia**
Como **editor**, quiero **aprobar una publicación eligiendo en qué sección se muestra y hasta cuándo** para **que aparezca en el sitio solo durante el tiempo que corresponde**.
- RF03, RF04 · US-08 · Pantalla 08 (modal de moderación).
- *Criterio:* tras confirmar, se publica en el sitio en menos de un minuto; al llegar la fecha de fin deja de mostrarse pero se conserva.

**H3 · Descartar una publicación**
Como **editor**, quiero **descartar una publicación** para **que el contenido interno de menor importancia no llegue a la web**.
- RF04 · US-09 · Pantalla 08.
- *Criterio:* queda en "Descartadas", no aparece en el sitio y se puede recuperar.

**H4 · Publicar avisos con vencimiento**
Como **personal de bedelía**, quiero **publicar avisos académicos con un archivo adjunto y una fecha de vencimiento** para **que los alumnos vean solo información vigente**.
- RF03, RF06 · US-11 · Pantallas 09 y 04.
- *Criterio:* un aviso vencido deja de mostrarse en Estudiantes sin borrarse; puede pausarse, reanudarse y, si está vencido, eliminarse con confirmación.

**H5 · Cargar horarios y llamados a examen**
Como **personal de bedelía**, quiero **cargar los horarios de cada comisión y los llamados a examen** para **que los alumnos consulten la información del ciclo en curso**.
- RF06 · US-13, US-14 · Pantalla 10.
- *Criterio:* los datos cargados se publican solo si pertenecen al ciclo público vigente.

**H6 · Definir el ciclo público**
Como **administrador**, quiero **elegir el año y el cuatrimestre que muestra el sitio** para **que los alumnos vean un único período académico**.
- RF06 · US-15, US-25 · Pantalla 12.
- *Criterio:* el cambio pide confirmación; el ciclo anterior queda disponible en el archivo del panel.

**H7 · Consultar mi cursada desde un solo lugar**
Como **alumno**, quiero **ver horarios, mesas de examen y avisos vigentes y llegar a SIU Guaraní y al aula virtual** para **resolver mi cursada sin buscar en varios sitios**.
- RF02, RF06, RF07 · US-22 · Pantalla 04.
- *Criterio:* solo se muestra el ciclo vigente; los enlaces externos abren en pestaña nueva; la pantalla es usable en el celular.

**H8 · Conocer la carrera y cómo ingresar**
Como **aspirante**, quiero **conocer la carrera, el plan de estudios y los pasos de ingreso** para **decidir si me inscribo**.
- RF02 · US-19 a US-21, US-23 · Pantallas 01, 02, 03 y 05.
- *Criterio:* el mensaje "Formamos emprendedores gastronómicos" se ve en el inicio; el contenido cumple accesibilidad AA y carga con rapidez en el celular.

## Prioridad media

**H9 · Gestionar usuarios y roles**
Como **administrador**, quiero **crear usuarios con un rol y desactivarlos** para **que cada persona acceda solo a lo que le corresponde**.
- RF05, RNF06 · US-04, US-05, US-26 · Pantalla 12 (modal de usuarios) y 13.
- *Criterio:* un usuario de bedelía no ve ni puede usar las opciones de redes ni de usuarios; un usuario desactivado no puede ingresar; el correo no se puede duplicar.

**H10 · Ordenar el archivo documental**
Como **personal autorizado**, quiero **archivar, buscar, restaurar y eliminar documentos antiguos con confirmación** para **mantener ordenado el repositorio sin perder información por error**.
- RF03 · US-16 a US-18, US-33 · Pantalla 11.
- *Criterio:* búsqueda por título, código de resolución o año; solo se elimina un documento archivado y no referenciado; cada acción queda registrada.

**H11 · Enviar una consulta al instituto**
Como **visitante**, quiero **enviar una consulta desde el sitio** para **resolver mis dudas sin depender de una sola persona**.
- RF08, RNF08 · US-27, US-28 · Sin diseño en Figma.
- *Criterio:* exige aceptar el aviso de uso de datos; el mensaje se guarda aunque falle el correo.

## Prioridad baja

**H12 · Mostrar el plantel y la vida del instituto**
Como **editor**, quiero **cargar el plantel docente y una galería de fotos con descripción** para **mostrar quiénes somos y qué hacemos**.
- RF09, RF10 · US-29, US-30 · Sin diseño en Figma.
- *Criterio:* las fotos con estudiantes solo se publican con consentimiento confirmado.

## Resumen de priorización

| Prioridad | Historias | Qué significa |
|---|---|---|
| Alta | H1 a H8 | Forman la primera versión: moderación de redes, avisos, horarios, ciclo público y sitio público |
| Media | H9 a H11 | Roles, archivo y contacto: entran si el cronograma lo permite |
| Baja | H12 | Plantel y galería: se difieren si el cronograma se ajusta (ver riesgo R1 y PERT en Gestión de Proyectos) |
