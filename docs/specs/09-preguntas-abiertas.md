# 09 · Preguntas abiertas y supuestos

Cada fila indica **qué se asume mientras no haya respuesta** para que el agente pueda avanzar sin bloquearse. Responde el equipo humano (Martín Juan es el canal con el cliente; Santiago Cuda decide infraestructura). El agente que implementa agrega acá lo que encuentre.

## Con el cliente (IFTS N.° 2)

| N.° | Pregunta | Supuesto provisorio | Impacta |
|---|---|---|---|
| Q1 | ¿Qué hashtag identifica las publicaciones de Instagram que pueden ir al sitio? | `#ifts2web` **provisorio** (decisión del equipo del 06/11/2026: se deja así por ahora); configurable en Configuración; la semilla demo lo carga y la `prod` lo deja vacío | RF04 |
| Q2 | ¿La cuenta de Instagram `ifts_2_ok` es profesional (Business/Creator) y quién autoriza la conexión? | Se asume que se puede convertir; si no, solo carga manual | ADR-09 |
| Q3 | ¿Editores (comunicación) y Bedelía son roles separados? ¿Quiénes son las personas de cada rol? | **Cuatro** roles de sistema: SUPERADMIN (agregado el 06/11/2026), ADMIN, BEDELIA y EDITOR; Editor y Bedelía separados. Pendiente: nombres de las personas de cada rol | ADR-18 |
| Q4 | La paleta de marrones está **definida** con el cliente (feedback posterior a la reunión del 06/10). ¿Hay otras correcciones de diseño tras explorar el prototipo? | El Figma vigente; los tokens se cambian en un solo archivo | Diseño |
| Q5 | ¿A qué correo debe llegar el formulario de contacto? | `dfts_ifts2_de20@bue.edu.ar` | RF08 |
| Q6 | ¿Cuál es la URL de SIU Guaraní para alumnos, la de Mi Argentina para el título digital y el enlace o contacto de Tutoría? | Enlaces marcados "a confirmar" ocultos hasta tenerlos | RF07 |
| Q7 | ¿Cuáles son los requisitos, fechas y documentos de ingreso? | Texto provisorio del Figma | Pantalla 05 |
| Q8 | ¿Qué comisiones existen y cuántos llamados a examen por ciclo? | Comisión A y B, Comisión Única, Prácticas Finales (del Figma) | Pantalla 10 |
| Q9 | **Parcialmente resuelta el 06/10:** el cliente aceptó un calendario académico y de mesas cargado por archivos por el administrador, con casillas para destacar eventos próximos. Pendiente: ¿se desea además una tabla navegable? (original: ¿los horarios y mesas se publican como archivo adjunto, como tabla navegable o ambos? El Figma muestra archivo; el relevamiento pidió "no Excel o PDF incrustado" | Se publican como **archivo adjunto con ficha de datos** (comisión, ciclo, fechas); la tabla navegable queda para una versión siguiente | RF06 |
| Q10 | ¿Cuántas fotos por álbum o publicación son razonables? | Máximo 10 por publicación; imágenes comprimidas | RNF05 |
| Q11 | ¿Quién redacta el aviso de uso de datos y el consentimiento de imágenes? | Texto estándar a validar con la supervisión del GCABA | RNF08 |
| Q12 | Contacto, Galería y Plantel docente: ¿se diseñan para el MVP? | Se resuelven con los componentes existentes (prioridad S o C) | Alcance |
| Q13 | Dominio .edu.ar: ¿quién tiene o gestiona la documentación? | Subdominio provisorio gratuito | ADR-15 |
| Q20 | Nombres finales de los ítems de menú al separar "ingreso a la tecnicatura" de "inscripción a carreras y exámenes" | "Ingreso" (aspirantes) y "Inscripciones" (alumnos) | Navegación |
| Q21 | ¿Se confirma el acceso de todos los grupos a la carpeta de Drive con logos y materiales de marca? | Usar los logos de `cliente/ifts2/` | Diseño |

## Con la cátedra y el equipo

| N.° | Pregunta | Supuesto provisorio | Responsable |
|---|---|---|---|
| Q14 | Hosting, base de datos, almacenamiento y correo gratuitos definitivos, sin vencimiento ni suspensión | Interfaces reemplazables; proveedor a elegir | Santiago Cuda |
| Q15 | **Resuelta:** ¿el panel necesita versión móvil diseñada para el MVP? | El Figma vigente **incluye el panel móvil** (`docs/design/mobile/`, 13 pantallas y modales) y el panel es **responsive** (verificado a 390 y 1440 px) | Gastón Zampar |
| Q16 | ¿Se acepta que "¿Olvidaste tu clave?" lo resuelva un administrador en el MVP? | Sí (ADR-06) | Martín Juan |
| Q17 | ¿Existe tabla navegable de plan de estudios y correlatividades en el MVP o solo tarjetas? | Tarjetas por año con enlace al documento; tabla navegable es S | Martín Juan |
| Q18 | El hito de la semana 13: ¿se acuerda un MVP recortado con el cliente si el PERT se confirma? | Sí; recorte de abajo hacia arriba (Could, Should) | Martín Juan |
| Q19 | Texto completo de los subtítulos de pantalla que el Figma muestra truncados (ej. el aviso de acceso restringido del login) | Copiar del Figma con `get_design_context` | Gastón Zampar |

## Discrepancias detectadas entre documentos

1. **Figma vs relevamiento (horarios):** el relevamiento pidió datos estructurados en lugar de Excel o PDF incrustado; el Figma carga **archivos** por comisión. Se resolvió provisoriamente en Q9.
2. **Datos de ejemplo del Figma** (correo y teléfono) no coinciden con los reales.
3. **Etapa 2 entregada** describe la paleta verde y un panel con "Institucional, Contacto, Galería y Plantel" como pendientes de diseño; el Figma vigente sí diseñó Institucional, Archivo, Configuración y Login, y reemplazó la paleta. Esta carpeta se basa en el Figma vigente.
4. **Nombres de rol:** la Etapa 2 habla de Administrador y Editor; el Figma habla de Rectoría / Dirección y Bedelía Académica. ADR-18 propone cuatro roles de sistema (SUPERADMIN, ADMIN, BEDELIA, EDITOR) que cubren ambos.

## Agregadas por el agente de fundación

| N.° | Pregunta | Supuesto provisorio | Impacta |
|---|---|---|---|
| Q22 | Nombres finales del menú: se implementó **Ingreso** (aspirantes, `/ingreso`) e **Inscripciones** (alumnos, `/inscripciones`) separados, más el botón **Administración** | Confirmar con el cliente (relacionada con Q20) | Navegación |
| Q23 | Tipografía: el JSON de tokens decía Inter pero las capturas del Figma lucen Plus Jakarta Sans | **Confirmado por el equipo (06/11/2026): es Plus Jakarta Sans.** ADR-11 se corrigió (la Etapa 2 proponía Inter); un solo archivo para cambiarla (`apps/web/src/app/fonts.ts`) | Diseño |
| Q24 | Contraste: el color `primary` del Figma no alcanza AA para botones con texto blanco (4,25:1) ni para texto sobre fondo base (3,93:1) | Se usan tokens derivados `primary-strong`, `font-strong`, `warning-text-strong` (ADR-021); validar con el cliente | Diseño / RNF07 |
| Q25 | Hashtag de Instagram: Q1 propone `#ifts2web` y 08-contenido decía "definir con el cliente" | **Unificado (06/11/2026):** `#ifts2web` es provisorio en 00, 02 (ADR-09), 08 y 09; la semilla `prod` no lo carga; la semilla demo usa `#ifts2web`; se configura desde el panel | RF04 |
| Q26 | El cliente debe crear y administrar su app de Meta (App ID/Secret, redirección, permisos) | La pantalla de Configuración guía el paso a paso (`setupSteps`); falta definir quién del instituto lo hace | ADR-09 |
| Q27 | Los nombres de los cuatro roles de sistema (Superadministrador, Rectoría / Dirección, Bedelía Académica, Comunicación) están en la semilla (`prisma/seed-data.ts`, tabla `Role`), no en el código; antes eran etiquetas de producto en `ROLE_LABELS` | **Superada por RF11:** los roles son datos y el Superadministrador puede renombrarlos o crear otros, así que no hace falta llevarlos a configuración aparte | ADR-22 |
| Q28 | El cierre de sesión por inactividad no está definido | Sesión de 8 h fijas (14 días con "recordar"), sin renovación deslizante | RNF06 |
| Q29 | El rate limit está en memoria: con más de una instancia de la API los contadores no se comparten | Aceptado para una instancia; DevOps decide un store compartido si se escala | ADR-15 |

## Agregadas por el agente académico (rama `feat/academic`)

| N.° | Pregunta | Supuesto provisorio | Impacta |
| --- | --- | --- | --- |
| Q40 | `DELETE /content/:page/:slug` "solo secciones no estáticas" (04-api): ¿qué es una sección estática? | Se pueden eliminar solo las secciones ocultas (`visible=false`); las visibles se ocultan primero | RF01 |
| Q41 | `contact:delete` en la matriz de BEDELIA | **Resuelta (integración)**: se quitó de BEDELIA; `contact:delete` es solo de ADMIN, la API usa `requirePermission` y hay pruebas | RF08 |
| Q42 | Eliminar un documento: el encargo habla de "referenciado por vigentes"; la regla 8 de 01-requerimientos dice "referenciado" | Se bloquea ante CUALQUIER referencia de aviso, horario o llamado (la FK es SET NULL y se perderían adjuntos en silencio) | RF03 |
| Q43 | Publicar un horario sin archivo adjunto | 422: un horario sin grilla no tiene qué mostrar | RF06 |
| Q44 | El hashtag vive en `SiteSetting.instagram_hashtag` y también en la configuración de Instagram (`/integrations/instagram`) | Son valores independientes; unificar al conectar la sincronización real | RF04 |
| Q45 | Archivar con `force` un documento adjunto a contenido visible | El adjunto sigue enlazado y descargable (no se rompe lo visible); solo sale del Archivo activo | RF03 |
| Q46 | Frecuencia del contacto | 5 envíos por hora por IP + campo señuelo (sin captcha externo) | RNF08 |
| Q47 | `GET /public/publications` con `archived=true` sin `year` | Usa el año en curso (hora de Buenos Aires); la "fecha" de una publicación es `visibleFrom` o, si no tiene, `createdAt` | RF03 |

## Agregadas por el agente del sitio público (rama `feat/web-public`)

| # | Pregunta | Decisión provisoria | Afecta |
|---|---|---|---|
| Q60 | Contacto, Inscripciones y avisos de aspirantes no tienen diseño en el Figma | Contacto como sección `#contacto` de `/institucional` (formulario con aviso de datos, consentimiento y señuelo); `/inscripciones` e `/ingreso` armadas con las tarjetas del kit. Validar con el cliente | RF08 / Q20 |
| Q61 | Plan por año, correlatividades y requisitos/fechas de ingreso no están cargados | **Parcialmente resuelta (integración)**: plan por área con horas y correlatividades cargados desde la Res. MEGC 1202/07 y la ficha (ver Q120 a Q122 para lo que sigue pendiente) | 08-contenido |
| Q62 | "Material de consulta" de Ingreso pide documentos públicos descargables y no existe endpoint para ellos | Se muestra como sección de contenido; falta decidir si `/public/content/ingreso` lleva archivos o se crea `/public/documents` | RF02 |
| Q63 | Fotografías del hero, de La carrera, de Ingreso, de Novedades y "Vida en la cocina" (galería) | **Parcialmente resuelta (07/11/2026, ADR-035):** el equipo decidió mostrar las fotos del Figma como **PROVISORIAS**. Procedencia: exportadas del Figma (`aRnoXCbNpkCFkHPH0En5B5`, nodos 1:2, 1:63, 1:106, 1:154 y 1:196), optimizadas a webp y guardadas en `apps/web/public/img/provisorio/`. Se configuran en Panel → Configuración (ajustes `hero_image_1/2`, `career_image`, `ingreso_image`, `student_gallery`, `logo_url`). **Pendiente:** el instituto debe entregar sus imágenes con consentimiento de las personas que aparecen (RNF08) y se reemplazan antes de producción; hasta entonces el sitio no debe publicarse con estas fotos. La galería editable por categorías sigue siendo RF09 (Could) | RNF08 |
| Q64 | El titular de Inicio usaba la frase ancla completa (`tagline`) y el Figma una frase más corta ("Formamos emprendedores gastronómicos") | **Resuelta (07/11/2026):** titular corto en el ajuste nuevo `hero_title` y la frase ancla (`tagline`) como subtítulo; sin `hero_title` la frase ancla vuelve a ser el titular. También `hero_eyebrow` (rótulo) y todo editable en Configuración | ADR-22 |
| Q65 | Menú móvil: el Figma muestra una barra inferior de navegación | Se mantiene el menú hamburguesa del layout compartido (accesible) | RNF04 |

## Agregadas por el agente del panel A (rama `feat/web-panel-a`)

| N.° | Pregunta | Supuesto provisorio | Impacta |
| --- | --- | --- | --- |
| Q80 | El Figma muestra el estado "Revisar" en publicaciones de redes pero no define cuándo aplica | Una publicación pendiente con más de 30 días desde que se publicó en Instagram se marca "Revisar" (puede estar desactualizada); el resto es "Pendiente". Constante `STALE_DAYS` en `social-posts-tab.tsx` | RF04 |
| Q81 | `GET /social/posts` no filtraba por origen (Instagram / carga manual) | **Resuelta (integración)**: `?source=instagram|manual` en el servidor; el panel lo envía y reinicia la página | RF04 |
| Q82 | Los conteos del filtro Estado de Avisos no existían en la API | **Resuelta (integración)**: `GET /notices` devuelve `counts { ALL, ACTIVE, PAUSED, EXPIRED }`; el panel pagina en el servidor (ya no pide 100 avisos) | RF03 |
| Q83 | Mensajes de contacto en el panel no tiene diseño en el Figma | Se resolvió con tarjetas, insignias y diálogos del kit; requiere diseño | RF08 |
| Q84 | El modal "Moderar contenido de red social" del Figma tiene "Prioridad visual (Destacada, primera fila)", que la API no soporta | Se omitió el campo; si el cliente lo quiere, hay que sumar un campo a `Publication` y al esquema de aprobación | RF04 |
| Q85 | El Figma rotula "Correo institucional (@bue.edu.ar)" en el login | El producto es genérico (ADR-22): el rótulo es "Correo institucional" y no se impone dominio; la lista de dominios válidos, si se quiere, es del cliente | RF05 |
| Q86 | Reanudar un aviso cuya vigencia ya terminó | Se pide una nueva fecha de fin (la API responde 422 sin ella): botón "Reactivar" con diálogo de fecha | RF03 |
| Q87 | El mensaje de bloqueo por intentos de login menciona "unos 15 minutos" (valor por defecto de `LOGIN_WINDOW_MINUTES`) | Texto fijo en la web; si se cambia la variable de entorno hay que ajustarlo o exponerla en la API | RNF06 |

## Agregadas por el agente del Panel B (rama `feat/web-panel-b`)

| N.° | Pregunta | Supuesto provisorio | Impacta |
| --- | --- | --- | --- |
| Q100 | El Figma pide SMTP con "remitente", pero `PUT /integrations/mail` solo guarda `contactToEmail` y una cadena `smtpUrl` | La pantalla arma `smtp(s)://usuario:clave@host:puerto` desde host, puerto, usuario y contraseña; no hay campo "remitente" hasta que la API lo soporte | RF08, ADR-020 |
| Q101 | "Período académico" del Figma (año lectivo y cuatrimestre visible) | En Configuración es solo lectura (muestra el ciclo público) con enlace a Horarios, donde se cambia con confirmación (`PUT /terms/:id/public-current`); un solo lugar para esa regla | RF06 |
| Q102 | Quién puede crear ciclos: BEDELIA tiene `terms:manage` | BEDELIA puede crear ciclos (no públicos) pero no cambiar el público (solo ADMIN) | RF06 |
| Q103 | Al subir una grilla o cronograma el documento queda en el Archivo con tipo SCHEDULE / EXAM_CALENDAR y el ciclo del horario | Si el segundo paso (crear el horario) falla, el documento queda subido y se puede reutilizar; no hay transacción entre ambos pasos | RF03 |
| Q104 | "Próximo turno oficial" de Horarios | Primer llamado publicado del ciclo cuya fecha de fin no pasó | RF06 |
| Q105 | La web (`next.config.ts`) no encuentra `API_ORIGIN` del `.env` raíz (el reenvío `/api/v1` cae en el puerto 4000) | Se levanta la web con `API_ORIGIN` exportado en el entorno; conviene que DevOps lo corrija (`loadEnvConfig` ya fue invocado antes por Next) | DevOps |
| Q106 | Cypress (Electron) no ejecuta el clic nativo de Enter sobre un botón | La prueba E2E-13 enfoca y hace clic, y verifica con teclado real (`cy.press`) el foco atrapado y devuelto en diálogos | RNF07 |

## Agregadas por el agente de integración y calidad

| N.° | Pregunta | Supuesto provisorio | Impacta |
| --- | --- | --- | --- |
| Q120 | ¿En qué año y cuatrimestre se cursa cada instancia curricular? Ni la ficha ni la resolución MEGC 1202/07 lo indican (solo el régimen cuatrimestral/anual y las horas) | La página La carrera muestra el plan por **área formativa**; la sección "Plan por año" dice `[a confirmar con el cliente]`. Se necesita la grilla de cursada del instituto | 08-contenido, RF02 |
| Q121 | La resolución nombra distinto a algunas instancias en la tabla de correlatividades que en el plan ("Química" / Elementos de Química, "Panadería" / Elaboraciones de Panadería, "Taller de producción escrita" / Taller de comunicación escrita, "Práctica 2 – Producción gastronómica" / Organización de la producción) y la ficha tiene la tabla de horas desalineada | Se transcribieron los nombres de la resolución tal cual; las horas salen de la tabla de la resolución, cuyos totales por área (256, 1378, 778, 346) y el de la carrera (2758) cierran. Confirmar con el instituto los nombres vigentes | 08-contenido |
| Q122 | Fechas de inscripción a la tecnicatura, documentación a presentar y modo de preinscripción no figuran en ningún documento del cliente | Texto `[a confirmar con el cliente]` en Ingreso; el único requisito cargado es secundario completo | RF02 |

## Agregadas por el equipo (06/11/2026): roles y permisos

| N.° | Pregunta | Supuesto provisorio | Impacta |
| --- | --- | --- | --- |
| Q123 | **Resuelta (06/11/2026):** roles configurables y Superadministrador confirmados con el cliente. La pantalla "Roles y permisos" **no va a estar en el Figma**: se arma con los componentes existentes (tabla, diálogo y casillas agrupadas por recurso). El Superadministrador local lo crea la semilla; **a quién se le entregan las credenciales en producción se decide al pasar a producción**. | Ver ADR-18 | RF11, pantalla 12 |
| Q124 | **Resuelta (06/11/2026):** los permisos de ADMIN, BEDELIA y EDITOR **se editan** en la pantalla de roles, casilla por casilla; SUPERADMIN no se edita. | Ver ADR-18 | RF11 |
| Q125 | **Resuelta (06/11/2026):** SUPERADMIN y ADMIN crean usuarios, también otros administradores. Un ADMIN asigna solo roles cuyos permisos incluye y nunca SUPERADMIN (regla de seguridad que agrega el equipo; se puede relajar si el cliente lo pide). | Ver ADR-18 | RF05, RF11 |
| Q126 | ¿Un ADMIN puede administrar (editar, desactivar o restablecer la clave) a un usuario con más permisos que él, por ejemplo el Superadministrador? | **No** (403). Restablecer la clave del Superadministrador le permitiría entrar con su cuenta: es la misma regla anti-escalada de Q125 aplicada a la administración de usuarios. Ver ADR-031 | RF05, RF11 |
| Q127 | La spec pide que toda ruta fuera de `/public` y `/auth` declare un permiso, pero `GET /settings` (datos básicos que usa cualquier pantalla del panel) solo exige sesión y `POST /social/cron` se autentica con `CRON_SECRET` | Quedan como excepciones explícitas, con su motivo, en la prueba `route-permissions.test.ts`. Si el equipo prefiere, `GET /settings` puede pedir `dashboard:read`, pero un rol sin Resumen dejaría de ver la cabecera | RF11, 06-testing |
| Q128 | ¿Qué pasa si se elimina un rol de sistema (ADMIN, BEDELIA o EDITOR) y después se vuelve a ejecutar la semilla? | En modo `prod` esos tres roles se crean solo en el primer arranque, así que **no reaparecen**; en modo `demo` se recrean siempre (los usuarios de demostración los necesitan). SUPERADMIN se asegura siempre. Confirmar con el equipo si conviene quitar la condición | RF11, ADR-031 |
| Q129 | Las rutas de `/integrations/*` pasaron de "solo ADMIN" al permiso `integrations:manage` (marcado como sensible en la pantalla de roles). ¿Se quiere dar este permiso a otros roles además de ADMIN? | No: lo trae ADMIN por defecto y SUPERADMIN siempre; el Superadministrador lo puede quitar o dar desde "Roles y permisos" | RF11, ADR-020 |
| Q130 | La historia de "destacar" (llamado o aviso) estaba numerada US-36, igual que la de roles configurables | **Resuelta (06/11/2026):** US-36 queda para roles configurables; "destacar" pasó a US-37 (`07-backlog-y-plan.md`) | Backlog |

## Agregadas por el equipo (07/11/2026): Resumen del panel (auditoría A14)

| N.° | Pregunta | Supuesto provisorio | Impacta |
| --- | --- | --- | --- |
| Q133 | ¿El año de ingreso del Resumen debe seguir siendo una estimación (año del período vigente + 1) o el instituto va a definir una convocatoria con fechas propias (preinscripción abierta o cerrada)? | Se mantiene la estimación y se muestra como **estimada**. La tarjeta informa solo lo verificable: si la página de Ingreso tiene contenido visible y si le quedan datos `[a confirmar ...]`. Ver ADR-034 | US-12, A14 |
## Agregadas por el equipo (07/11/2026): Inscripciones (auditoría A07 y A08)

| N.° | Pregunta | Supuesto provisorio | Impacta |
| --- | --- | --- | --- |
| Q131 | El ajuste "Inscripciones a mesas SIU habilitadas" (`exam_enrollment_open`), ¿es un **bloqueo general** o solo un texto informativo? ¿Un llamado ya terminado con su casilla marcada debe figurar cerrado? | **Bloqueo general:** con el ajuste apagado ningún llamado figura con inscripción abierta en el sitio, aunque tenga su casilla. Un llamado terminado figura cerrado. Se calcula al consultar; la casilla guardada no cambia. Si el instituto lo usa solo como texto, se cambia una función (`effectiveExamEnrollmentOpen`). Ver ADR-033 | RF06, A08 |
| Q132 | ¿Qué enlace es el de inscripción de **alumnos** y qué trámites permite? (completa Q6) | El panel tiene la marca "Enlace de inscripción de alumnos"; Inscripciones muestra solo los enlaces marcados. La semilla marca "SIU Guaraní — Acceso alumnos", que sigue oculto hasta tener la URL oficial. Mientras tanto la página avisa que el enlace está pendiente y muestra el correo de Bedelía. Nunca se ofrece el SIU de profesores y secretaría. Ver ADR-033 | RF07, A07 |

## Agregadas por el agente del sitio público fiel al Figma (07/11/2026)

| N.° | Pregunta | Supuesto provisorio | Impacta |
| --- | --- | --- | --- |
| Q134 | **Contradicción Figma vs. datos:** La carrera del Figma muestra "Plan de estudios por año" (tarjetas Primer, Segundo y Tercer año con "Ver materias y cuatrimestres") y un botón "Consultar correlatividades". Los documentos del cliente no indican en qué año se cursa cada materia (Q120) | No se dibujan las tarjetas por año ni se inventan materias: se mantiene el plan por área formativa con horas y las correlatividades de la Res. MEGC 1202/07, y la sección "Plan por año" sigue marcada `[a confirmar con el cliente]` | 08-contenido, RF02 |
| Q135 | El Figma muestra la galería "Vida en la cocina" (Estudiantes) y la foto de La carrera como **carrusel** con flechas y puntos | **Resuelta (07/11/2026, ADR-036):** carrusel accesible (sin reproducción automática) y **editable desde el panel** (Galerías: subir, editar, ordenar, eliminar; hasta 10 por área). Las fotos que vienen cargadas siguen siendo provisorias (Q63). Pendiente: categorías de la galería (RF09 completo) | RNF07, RF09 |
| Q136 | Las pantallas de Ingreso del Figma muestran una descripción debajo de cada paso (Requisitos, Preinscripción, Confirmación) y "Material de consulta" con el botón "Consultar documentos" | No se escriben textos institucionales: los pasos se dibujan como están cargados en el contenido de Ingreso (solo títulos) hasta que el instituto apruebe el texto (Q7, Q122). El material de consulta sigue pendiente de Q62 | RF02 |
| Q137 | El logo del Figma (I2FTS verde) se usa como `logo_url` provisorio | Es el logo de la carpeta de marca del cliente (Q21); confirmar que se puede usar así y su versión definitiva | Diseño |
