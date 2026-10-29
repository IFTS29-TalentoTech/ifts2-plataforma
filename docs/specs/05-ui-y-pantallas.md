# 05 · Interfaz y pantallas

**Fuente visual:** Figma `IFTS N.° 2 — MVP visual y panel de administración`, fileKey `aRnoXCbNpkCFkHPH0En5B5`, página `Page 1`. Versión vigente al 18/10/2026. Para leerlo con el conector de Figma: `get_metadata(fileKey, nodeId)` y `get_design_context(fileKey, nodeId)` con los nodos de esta tabla. Tokens en `design-tokens.json`.

**Estado del diseño:** el cliente rechazó la paleta verde anterior; el diseño actual usa una paleta tierra y fotografías reales, y quedó a la espera de correcciones adicionales del cliente. Los textos de ejemplo son provisorios.

**Componentes transversales:** barra superior institucional (logo, "IFTS N.° 2", navegación con ítem activo subrayado, acceso al panel), pie oscuro (`accent-3`) con la leyenda "IFTS N.° 2 • Tecnicatura Superior en Emprendimientos Gastronómicos", tarjetas con filete lateral, etiquetas de sección en mayúsculas, insignias de estado (éxito, advertencia, peligro), botones primario y secundario, diálogos de confirmación.

**Ajuste de navegación acordado con el cliente (06/10):** separar en el menú principal el **ingreso a la tecnicatura** (aspirantes) de la **inscripción a carreras y exámenes** (alumnos). El Figma vigente tiene un único ítem "Ingreso"; el agente debe reflejar la separación y registrar el nombre final de los ítems en `09-preguntas-abiertas.md`.

## Sitio público (escritorio 1440 px; móvil 390 px)

| Pantalla | Nodo | Contenido | Datos que consume |
|---|---|---|---|
| 01 Inicio | `1:2` | Hero "Formamos emprendedores gastronómicos" con botones "Conocé la carrera" y "Soy estudiante" y fotografía; accesos rápidos (Plan de estudios, Horarios y exámenes, Ingreso, Contacto); "Actualidad institucional" con tres publicaciones seleccionadas | `/public/home` |
| 02 Institucional | `210:1077` | Encabezado "Sobre el IFTS N.° 2"; ficha de sede (Cañada de Gómez 3850, Villa Lugano, CABA); bloques Formación integral, Instalaciones de práctica, Cuerpo docente y bedelía; enlaces a plan de estudios y a requisitos de ingreso | `/public/content/institucional`, `/public/settings` |
| 03 La carrera | `1:63` | "Tecnicatura Superior en Emprendimientos Gastronómicos"; perfil profesional "Más que cocinar: emprender y gestionar"; plan de estudios por año (Primer, Segundo, Tercer año); correlatividades con botón "Consultar correlatividades"; fotografía | `/public/content/carrera` |
| 04 Estudiantes | `1:106` | "Información para estudiantes"; Horarios y exámenes con selector de ciclo ("Año 2026 · 2.º cuatrimestre"); tarjetas Horarios de cursada y Mesas de examen; "Vida en la cocina" (galería de fotos); Accesos académicos: SIU Guaraní, Aula virtual, Tutoría; nota "Los períodos anteriores se conservan en el archivo" | `/public/students` |
| 05 Ingreso | `1:154` | "Ingresá al IFTS N.° 2"; "Próxima convocatoria"; "¿Cómo es el proceso?" en tres pasos (Requisitos, Preinscripción, Confirmación); "Material de consulta" con botón "Consultar documentos" | `/public/content/ingreso`, documentos públicos |
| 06 Novedades | `1:196` | "Novedades y eventos"; filtros por año y categoría; grilla de tarjetas con imagen, categoría, título y "Ver publicación"; incluye archivo histórico | `/public/publications` |

**Móvil:** siete pantallas (inicio, institucional, carrera, estudiantes, ingreso, novedades, login) con menú desplegable y barra inferior de navegación. El panel no tiene versión móvil diseñada; debe ser **usable** en pantallas chicas pero su rediseño móvil es "Podría".

## Panel de gestión (escritorio)

Estructura común: barra superior, menú lateral "Gestión del sitio" (Resumen, Publicaciones, Avisos académicos, Horarios, Archivo, Configuración; con contadores en Publicaciones y Avisos), encabezado de página con título, descripción y acción principal, y el pie.

| Pantalla | Nodo | Contenido | Modales (en el Figma) |
|---|---|---|---|
| 13 Login | `210:1172` | "Panel de Gestión Académica"; "Acceso restringido para personal directivo, administrativo y …" (texto completo truncado en la lectura de metadatos; ver Q19); correo institucional, contraseña, "¿Olvidaste tu clave?", "Recordar sesión en este equipo", botón "Ingresar al panel" | — |
| 07 Resumen | `167:2` | "Panel de control": estado de Instagram API ("Sincronizada", clic para sincronizar); tarjetas Redes sociales (posts por moderar), Avisos activos (y próximos a vencer), Período vigente (cuatrimestre y turno de mesas), Ingreso (inscripción del ciclo siguiente); lista "Publicaciones de redes por moderar" con "Moderar"; "Cartelera institucional activa" con adjuntos y etiquetas En línea y Urgente; "Gestionar cartelera completa" | Moderar publicación de red social `175:627`; Confirmar publicación `177:746`; Crear aviso formal rápido `175:673`; Confirmar aviso formal `179:780`; Actualizar grilla de horarios rápido `175:712` |
| 08 Publicaciones | `1:249` | "Publicaciones seleccionadas": "Elegí qué novedades de las redes sociales se mostrarán en el sitio institucional"; filtros Origen y Estado; tarjetas con imagen, título, metadatos, estado (Pendiente, Revisar, …) y "Ver detalle"; nota "La integración automática con redes queda sujeta a validación técnica. La aprobación editorial es el requisito principal." | Moderar y aprobar publicación `184:1019`; Confirmar publicación `184:1115`; Confirmar descarte `184:1077` |
| 09 Avisos académicos | `169:404` | "Administrá los comunicados oficiales visibles en la cartelera"; botón "Nuevo aviso"; filtros Estado y Destinatario; cada aviso con categoría (Mesas de examen, Urgente / Documentación), vigencia ("Vigente hasta…"), título, texto, adjunto PDF y acciones Pausar y Editar; nota: los avisos activos se sincronizan de inmediato con la pantalla de estudiantes | Publicar nuevo aviso `173:532`; Confirmar publicación `173:580`; Confirmar pausa `173:597` |
| 10 Horarios | `191:239` | "Horarios y exámenes": cargar nueva grilla (por comisión: Comisión A y B, Comisión Única, Prácticas Finales) y actualizar archivo; "Convocatorias y Mesas de Examen" con próximo turno oficial y "Configurar nuevo llamado" | Actualizar horarios `195:444`; Confirmación de horarios `189:209`; Configurar nuevo llamado `207:522`; Editar llamado `189:163`; Confirmar llamado `189:224`; Cambiar ciclo lectivo público `189:194` |
| 11 Archivo | `210:576` | "Archivo y documentación histórica": búsqueda por título, código de resolución o año; filtros Tipo y Ciclo; tabla (Documento / Título, Categoría, Ciclo lectivo, Fecha de archivo, Peso, Acciones: Ver detalle, Restaurar); "Archivar nuevo documento" | Detalle `210:796`; Confirmar restaurar `210:838` |
| 12 Configuración | `210:865` | "Configuración del sitio y sede": Período académico (Año lectivo, Cuatrimestre visible, "Inscripciones a mesas SIU habilitadas"); Datos institucionales (dirección, correo de bedelía, teléfono); Seguridad y accesos (administradores por rol: Rectoría / Dirección, Bedelía Académica; "+ Administrar usuarios y roles"); botón "Guardar cambios" | Administrar usuarios y roles `210:1011`; Confirmar guardar cambios globales `210:1050` |

## Estados que toda pantalla debe resolver

Cargando (esqueleto), vacío (mensaje y acción sugerida), error (mensaje en lenguaje claro, sin códigos técnicos, con "Reintentar"), éxito (aviso breve que no depende solo del color), sin permiso (el elemento no se muestra). Formularios: validación en línea, etiquetas visibles, mensajes específicos.

## Pantallas sin diseño (resolver con el sistema de componentes existente)

Contacto (formulario con aviso de datos), Galería, Plantel docente, Mensajes de contacto en el panel, listado de usuarios completo. Reutilizar tarjetas, tablas y diálogos del Figma; no introducir estilos nuevos. Registrar en `09-preguntas-abiertas.md` que requieren diseño.

## Regla de datos de ejemplo

El Figma usa datos de muestra que **no son reales**: correo `ifts2@bue.edu.ar`, teléfono `(011) 4601-2345`, nombres de archivo ficticios. En producción se usan los datos de `08-contenido-y-datos-semilla.md`.
