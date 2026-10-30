### Tablas y campos

> Esta sección se genera con `node scripts/docs/prisma-to-docs.mjs` a partir de `prisma/schema.prisma`; no se edita a mano. Los tipos son los de Prisma (`String` = texto, `Int` = entero, `Boolean` = verdadero/falso, `DateTime` = fecha y hora en UTC, `Json` = objeto JSON); en PostgreSQL se materializan como `TEXT`, `INTEGER`, `BOOLEAN`, `TIMESTAMP(3)` y `JSONB`. Las filas «Relación con …» son los lados de navegación de Prisma y no son columnas.

#### User

Personas del instituto que usan el panel, con su rol.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `email` | String | único, obligatorio | Correo con el que inicia sesión. No se repite entre usuarios. |
| `name` | String | obligatorio | Nombre y apellido que se muestra en el panel y en la auditoría. |
| `passwordHash` | String | obligatorio | Clave guardada como hash argon2id. Nunca se guarda ni se devuelve la clave en claro. |
| `role` | Role | obligatorio | Rol: ADMIN (todo), BEDELIA (avisos, horarios, archivo) o EDITOR (publicaciones y redes). |
| `active` | Boolean | obligatorio, por defecto true | Si es falso, la persona no puede iniciar sesión (se desactiva en lugar de borrar, para conservar la auditoría). |
| `mustChangePassword` | Boolean | obligatorio, por defecto false | Verdadero tras crear el usuario con clave temporal o restablecerla: obliga a cambiarla en el próximo ingreso. |
| `createdAt` | DateTime | obligatorio, por defecto now() | Fecha y hora de creación del registro. |
| `updatedAt` | DateTime | obligatorio, por defecto now() | Fecha y hora de la última modificación (la actualiza Prisma sola). |
| `lastLoginAt` | DateTime | opcional | Último inicio de sesión exitoso. |
| `sessions` | Session[] | (no es columna) | Sesiones abiertas del usuario (relación inversa). |
| `audit` | AuditLog[] | (no es columna) | Acciones auditadas realizadas por el usuario (relación inversa). |

#### Session

Sesiones de inicio de sesión (revocables).

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `userId` | String | obligatorio, FK → User.id (Cascade) | Usuario dueño de la sesión. Al borrar el usuario se borran sus sesiones. |
| `user` | User | (no es columna) | Relación con User. |
| `tokenHash` | String | único, obligatorio | Hash del token de la cookie de sesión (nunca el token en claro). Permite revocar sesiones. |
| `expiresAt` | DateTime | obligatorio | Momento en que la sesión deja de ser válida (8 horas, o 14 días con «recordarme»). |
| `createdAt` | DateTime | obligatorio, por defecto now() | Fecha y hora de creación del registro. |
| `userAgent` | String | opcional | Navegador desde el que se inició la sesión (informativo). |

Restricciones e índices de la tabla: `@@index([userId])`, `@@index([expiresAt])`.

#### Category

Categorías para publicaciones, avisos y galería.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `name` | String | obligatorio | Nombre de la categoría (por ejemplo «Inscripciones»). |
| `kind` | String | obligatorio | A qué se aplica: PUBLICATION, NOTICE o GALLERY. El par (nombre, tipo) no se repite. |
| `publications` | Publication[] | (no es columna) | Publicaciones de la categoría (relación inversa). |
| `notices` | Notice[] | (no es columna) | Avisos de la categoría (relación inversa). |

Restricciones e índices de la tabla: `@@unique([name, kind])`.

#### SocialPost

Publicaciones detectadas en Instagram, a la espera de moderación humana.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `platform` | String | obligatorio, por defecto "INSTAGRAM" | Red social de origen (hoy INSTAGRAM). |
| `externalId` | String | único, obligatorio | Identificador del medio en Instagram. Es único: evita importar dos veces la misma publicación. |
| `permalink` | String | obligatorio | Enlace público a la publicación original en la red. |
| `caption` | String | obligatorio | Texto (leyenda) de la publicación original. |
| `mediaUrl` | String | obligatorio | Dirección temporal de la imagen; al aprobar se copia al almacenamiento propio. |
| `postedAt` | DateTime | obligatorio | Fecha en que se publicó en la red. |
| `status` | SocialStatus | obligatorio, por defecto DETECTED | DETECTED (pendiente de moderar), LINKED (aprobada, ya tiene Publication) o DISCARDED (descartada). |
| `detectedAt` | DateTime | obligatorio, por defecto now() | Cuándo la detectó la sincronización. |
| `moderatedBy` | String | opcional | Id del usuario que la aprobó o descartó. |
| `moderatedAt` | DateTime | opcional | Cuándo se moderó. |
| `publication` | Publication | (no es columna) | Publicación del sitio creada a partir de esta (relación inversa 1 a 1). |

Restricciones e índices de la tabla: `@@index([status, postedAt])`.

#### Publication

Noticias y eventos del sitio (manuales o aprobadas desde Instagram).

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `kind` | PublicationKind | obligatorio, por defecto NEWS | NEWS (noticia) o EVENT (evento). |
| `title` | String | obligatorio | Título que ve el visitante. |
| `summary` | String | obligatorio | Resumen corto para tarjetas y listados. |
| `body` | String | obligatorio, por defecto "" | Texto completo (Markdown acotado, se sanitiza al mostrarlo). |
| `coverUrl` | String | opcional | Imagen de portada: una dirección http(s) o una clave del almacenamiento propio. |
| `categoryId` | String | opcional, FK → Category.id | Categoría opcional. |
| `category` | Category | (no es columna) | Relación con Category. |
| `section` | PublicationSection | obligatorio, por defecto BOTH | Dónde se muestra: HOME (inicio), NEWS (novedades) o BOTH. |
| `status` | PublicationStatus | obligatorio, por defecto DRAFT | DRAFT (borrador), SCHEDULED (programada), PUBLISHED (publicada) o PAUSED (pausada). La vigencia real se calcula al consultar. |
| `origin` | PublicationOrigin | obligatorio, por defecto MANUAL | MANUAL (cargada en el panel) o INSTAGRAM (aprobada desde una publicación de la red). |
| `socialPostId` | String | único, opcional, FK → SocialPost.id | Publicación de Instagram de la que proviene. Única: una publicación de red genera, como máximo, una del sitio. |
| `socialPost` | SocialPost | (no es columna) | Relación con SocialPost. |
| `visibleFrom` | DateTime | opcional | Desde cuándo es visible (inclusivo). Vacío = sin límite. |
| `visibleUntil` | DateTime | opcional | Hasta cuándo es visible (exclusivo). Vacío = sin vencimiento. |
| `eventStart` | DateTime | opcional | Inicio del evento (solo si kind = EVENT). |
| `eventEnd` | DateTime | opcional | Fin del evento. |
| `location` | String | opcional | Lugar del evento. |
| `authorId` | String | obligatorio | Id del usuario autor (se guarda como texto, sin clave foránea, para no perder el dato si se desactiva). |
| `createdAt` | DateTime | obligatorio, por defecto now() | Fecha y hora de creación del registro. |
| `updatedAt` | DateTime | obligatorio | Fecha y hora de la última modificación (la actualiza Prisma sola). |

Restricciones e índices de la tabla: `@@index([status, visibleFrom, visibleUntil])`, `@@index([categoryId])`.

#### Notice

Avisos académicos / cartelera oficial.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `title` | String | obligatorio | Título del aviso. |
| `body` | String | obligatorio | Texto del aviso. |
| `categoryId` | String | opcional, FK → Category.id | Categoría opcional (tipo NOTICE). |
| `category` | Category | (no es columna) | Relación con Category. |
| `audience` | NoticeAudience | obligatorio, por defecto ALL | A quién va dirigido: ALL, STUDENTS, ASPIRANTS o GRADUATES. |
| `urgent` | Boolean | obligatorio, por defecto false | Marca el aviso como urgente (se muestra destacado). |
| `highlighted` | Boolean | obligatorio, por defecto false | Destaca un evento próximo. |
| `status` | NoticeStatus | obligatorio, por defecto ACTIVE | ACTIVE o PAUSED. «Vencido» no se guarda: se calcula con visibleUntil. |
| `visibleFrom` | DateTime | obligatorio, por defecto now() | Desde cuándo es visible (por defecto, ahora). |
| `visibleUntil` | DateTime | opcional | Hasta cuándo es visible. Vacío = sin vencimiento. |
| `attachmentId` | String | opcional, FK → Document.id | Documento adjunto opcional. |
| `attachment` | Document | (no es columna) | Relación con Document. |
| `authorId` | String | obligatorio | Id del usuario que lo creó. |
| `createdAt` | DateTime | obligatorio, por defecto now() | Fecha y hora de creación del registro. |
| `updatedAt` | DateTime | obligatorio | Fecha y hora de la última modificación (la actualiza Prisma sola). |

Restricciones e índices de la tabla: `@@index([status, visibleFrom, visibleUntil])`.

#### Document

Repositorio documental: archivos subidos, archivados o restaurados, y adjuntos.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `title` | String | obligatorio | Nombre que se muestra del documento. |
| `filename` | String | obligatorio | Nombre original del archivo subido. |
| `kind` | DocumentKind | obligatorio, por defecto OTHER | Tipo: SCHEDULE, EXAM_CALENDAR, RESOLUTION, PLAN, NOTICE_ATTACHMENT u OTHER. |
| `category` | String | opcional | Etiqueta libre para la tabla del archivo (por ejemplo «Mesas Examen»). |
| `cycleYear` | Int | opcional | Ciclo lectivo (año) al que corresponde. |
| `termLabel` | String | opcional | Cuatrimestre en texto (por ejemplo «2.° Cuat.»). |
| `resolutionCode` | String | opcional | Código de la resolución, si es una resolución. |
| `storageKey` | String | único, obligatorio | Clave del archivo en el almacenamiento (única). No sale de la API: se descarga con URL firmada. |
| `mimeType` | String | obligatorio | Tipo de archivo (por ejemplo application/pdf). |
| `sizeBytes` | Int | obligatorio | Tamaño en bytes. |
| `status` | DocumentStatus | obligatorio, por defecto ACTIVE | ACTIVE o ARCHIVED (archivado: sale del sitio pero no se borra). |
| `archivedAt` | DateTime | opcional | Cuándo se archivó. |
| `restoredAt` | DateTime | opcional | Cuándo se restauró por última vez. |
| `uploadedBy` | String | obligatorio | Id del usuario que lo subió. |
| `createdAt` | DateTime | obligatorio, por defecto now() | Fecha y hora de creación del registro. |
| `notices` | Notice[] | (no es columna) | Avisos que lo adjuntan (relación inversa). |
| `schedules` | Schedule[] | (no es columna) | Horarios que lo usan (relación inversa). |
| `examCalls` | ExamCall[] | (no es columna) | Llamados que lo usan (relación inversa). |

Restricciones e índices de la tabla: `@@index([cycleYear, status])`.

#### AcademicTerm

Ciclos lectivos; uno solo es el «público» y gobierna qué horarios y llamados se ven.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `year` | Int | obligatorio | Año del ciclo lectivo. |
| `kind` | TermKind | obligatorio | FIRST (1.er cuatrimestre), SECOND (2.º) o EXTRAORDINARY. El par (año, tipo) no se repite. |
| `startsOn` | DateTime | opcional | Inicio del ciclo. |
| `endsOn` | DateTime | opcional | Fin del ciclo. |
| `publicCurrent` | Boolean | obligatorio, por defecto false | Verdadero en el ciclo que muestra el sitio. Solo uno puede serlo (índice único parcial en la base). |
| `schedules` | Schedule[] | (no es columna) | Horarios del ciclo (relación inversa). |
| `examCalls` | ExamCall[] | (no es columna) | Llamados del ciclo (relación inversa). |

Restricciones e índices de la tabla: `@@unique([year, kind])`.

#### Schedule

Horarios de cursada por comisión (con grilla adjunta).

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `termId` | String | obligatorio, FK → AcademicTerm.id | Ciclo al que pertenece. |
| `term` | AcademicTerm | (no es columna) | Relación con AcademicTerm. |
| `commissionName` | String | obligatorio | Comisión (por ejemplo «Comisión A y B»). |
| `documentId` | String | opcional, FK → Document.id | Grilla de horarios adjunta (documento). |
| `document` | Document | (no es columna) | Relación con Document. |
| `notes` | String | opcional | Observaciones. |
| `published` | Boolean | obligatorio, por defecto false | Si está publicado. Solo se ve si además su ciclo es el público. |
| `updatedBy` | String | obligatorio | Id del usuario que lo modificó por última vez. |
| `updatedAt` | DateTime | obligatorio | Fecha y hora de la última modificación (la actualiza Prisma sola). |

Restricciones e índices de la tabla: `@@index([termId, published])`.

#### ExamCall

Llamados a examen / mesas.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `termId` | String | obligatorio, FK → AcademicTerm.id | Ciclo al que pertenece. |
| `term` | AcademicTerm | (no es columna) | Relación con AcademicTerm. |
| `name` | String | obligatorio | Nombre del llamado (por ejemplo «Turno extraordinario de Diciembre 2026»). |
| `startsOn` | DateTime | obligatorio | Primer día del llamado. |
| `endsOn` | DateTime | obligatorio | Último día del llamado. |
| `enrollmentOpen` | Boolean | obligatorio, por defecto false | Si la inscripción a las mesas está abierta. |
| `highlighted` | Boolean | obligatorio, por defecto false | Destaca el llamado próximo. |
| `documentId` | String | opcional, FK → Document.id | Calendario o documento adjunto. |
| `document` | Document | (no es columna) | Relación con Document. |
| `notes` | String | opcional | Observaciones. |
| `published` | Boolean | obligatorio, por defecto false | Si está publicado. Solo se ve si además su ciclo es el público. |
| `updatedBy` | String | obligatorio | Id del usuario que lo modificó por última vez. |
| `updatedAt` | DateTime | obligatorio | Fecha y hora de la última modificación (la actualiza Prisma sola). |

Restricciones e índices de la tabla: `@@index([termId, published])`.

#### SiteSetting

Ajustes clave/valor del sitio (sede, contactos, hashtag, etc.).

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `key` | String | PK, obligatorio | Nombre del ajuste (por ejemplo institution_name, address, instagram_hashtag). |
| `value` | String | obligatorio | Valor del ajuste, siempre texto. |
| `updatedAt` | DateTime | obligatorio | Fecha y hora de la última modificación (la actualiza Prisma sola). |

#### ContentSection

Texto editable de las páginas estáticas (Institucional, La carrera, Ingreso).

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `page` | String | obligatorio | Página a la que pertenece: institucional, carrera o ingreso. |
| `slug` | String | obligatorio | Identificador corto de la sección dentro de la página. (página, slug) no se repite. |
| `title` | String | obligatorio | Título de la sección. |
| `body` | String | obligatorio | Texto en Markdown acotado, sanitizado al mostrarlo. |
| `order` | Int | obligatorio, por defecto 0 | Posición dentro de la página. |
| `visible` | Boolean | obligatorio, por defecto true | Si se muestra en el sitio. |

Restricciones e índices de la tabla: `@@unique([page, slug])`.

#### ExternalLink

Enlaces de interés (SIU Guaraní, Aulas Virtuales, etc.).

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `title` | String | obligatorio | Texto del enlace (por ejemplo «SIU Guaraní»). |
| `url` | String | obligatorio | Dirección del enlace. |
| `description` | String | opcional | Descripción breve opcional. |
| `group` | String | obligatorio, por defecto "academico" | Grupo donde se agrupa (por defecto «academico»). |
| `order` | Int | obligatorio, por defecto 0 | Posición dentro del grupo. |
| `visible` | Boolean | obligatorio, por defecto true | Si se muestra en el sitio. |

#### ContactMessage

Consultas enviadas desde el formulario del sitio.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `name` | String | obligatorio | Nombre de quien escribe. |
| `email` | String | obligatorio | Correo de respuesta. |
| `subject` | String | obligatorio | Asunto. |
| `message` | String | obligatorio | Texto de la consulta. |
| `status` | MessageStatus | obligatorio, por defecto NEW | NEW, READ o ANSWERED. |
| `consent` | Boolean | obligatorio | Aceptó el aviso de uso de datos (Ley 25.326). Es obligatorio. |
| `receivedAt` | DateTime | obligatorio, por defecto now() | Cuándo llegó. |
| `mailSent` | Boolean | obligatorio, por defecto false | Si el correo de aviso salió. El mensaje se guarda siempre, aunque el correo falle. |

#### InstagramToken

Estado del token y de la sincronización con Instagram (una sola fila).

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | Int | PK, obligatorio, por defecto 1 | Identificador único (UUID generado por la aplicación). |
| `tokenEnc` | String | obligatorio | Reservado; el token en claro vive cifrado en IntegrationConfig y este campo queda vacío a propósito. |
| `expiresAt` | DateTime | obligatorio | Vencimiento del token de larga duración (~60 días; se renueva a los ~50). |
| `refreshedAt` | DateTime | obligatorio, por defecto now() | Última renovación. |
| `lastSyncAt` | DateTime | opcional | Última sincronización con Instagram. |
| `lastSyncOk` | Boolean | opcional | Si esa sincronización terminó bien. |

#### IntegrationConfig

Configuración de integraciones cargada por el cliente desde el panel, cifrada.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `key` | String | PK, obligatorio | Qué integración configura: «instagram» o «mail». |
| `valueEnc` | String | obligatorio | JSON de la configuración cifrado con AES-256-GCM (clave APP_ENCRYPTION_KEY). Nunca se devuelve en claro. |
| `updatedBy` | String | opcional | Id del usuario que la guardó por última vez. |
| `updatedAt` | DateTime | obligatorio | Fecha y hora de la última modificación (la actualiza Prisma sola). |

#### AuditLog

Registro de auditoría: quién hizo qué y cuándo.

| Campo | Tipo | Restricciones | Significado |
|---|---|---|---|
| `id` | String | PK, obligatorio, por defecto uuid() | Identificador único (UUID generado por la aplicación). |
| `userId` | String | opcional, FK → User.id (SetNull) | Quién realizó la acción. Si el usuario se borra queda vacío (SetNull). |
| `user` | User | (no es columna) | Relación con User. |
| `action` | String | obligatorio | Acción realizada (por ejemplo notice.create, document.archive). |
| `entity` | String | obligatorio | Tipo de entidad afectada. |
| `entityId` | String | opcional | Id de la entidad afectada. |
| `detail` | Json | opcional | Datos adicionales en JSON (sin secretos). |
| `at` | DateTime | obligatorio, por defecto now() | Cuándo ocurrió. |

Restricciones e índices de la tabla: `@@index([entity, entityId])`, `@@index([at])`.

#### Índice único parcial (SQL de la migración inicial)

Prisma no puede expresar este índice en el schema, por eso vive en `prisma/migrations/20261029224122_init/migration.sql`: garantiza que **solo un ciclo** tenga `publicCurrent = true`.

### Enumeraciones

| Enumeración | Valores | Uso |
|---|---|---|
| `Role` | `ADMIN` (Rectoría / Dirección: acceso total); `BEDELIA` (Bedelía Académica: horarios, mesas, avisos y archivo); `EDITOR` (Comunicación: publicaciones y redes) | Rol de usuario. |
| `PublicationKind` | `NEWS` (Noticia / se muestra en Novedades); `EVENT` (Evento) | Tipo de publicación. |
| `PublicationStatus` | `DRAFT` (Borrador); `SCHEDULED` (Programada); `PUBLISHED` (Publicada); `PAUSED` (Pausada) | Estado de una publicación. |
| `PublicationOrigin` | `MANUAL` (Cargada a mano en el panel); `INSTAGRAM` (Aprobada desde Instagram) | Origen de la publicación. |
| `PublicationSection` | `HOME` (Inicio); `NEWS` (Noticia / se muestra en Novedades); `BOTH` (Inicio y Novedades) | Sección del sitio donde aparece. |
| `SocialStatus` | `DETECTED` (Detectada, pendiente de moderar); `LINKED` (Aprobada y vinculada a una publicación); `DISCARDED` (Descartada) | Estado de moderación de una publicación de red. |
| `NoticeStatus` | `ACTIVE` (Activo); `PAUSED` (Pausada) | Estado de un aviso. |
| `NoticeAudience` | `ALL` (Todos); `STUDENTS` (Estudiantes); `ASPIRANTS` (Aspirantes); `GRADUATES` (Egresados) | Destinatarios de un aviso. |
| `DocumentKind` | `SCHEDULE` (Horario); `EXAM_CALENDAR` (Calendario de exámenes); `RESOLUTION` (Resolución); `PLAN` (Plan de estudios); `NOTICE_ATTACHMENT` (Adjunto de aviso); `OTHER` (Otro) | Tipo de documento. |
| `DocumentStatus` | `ACTIVE` (Activo); `ARCHIVED` (Archivado) | Estado de un documento. |
| `TermKind` | `FIRST` (1.er cuatrimestre); `SECOND` (2.º cuatrimestre); `EXTRAORDINARY` (Extraordinario) | Tipo de ciclo. |
| `MessageStatus` | `NEW` (Nuevo); `READ` (Leído); `ANSWERED` (Respondido) | Estado de un mensaje de contacto. |

### Relaciones entre tablas

| Relación | Cardinalidad | Regla al borrar |
|---|---|---|
| `User` → `Session` (por `userId`) | 1 a N | En cascada: se borran los hijos |
| `Category` → `Publication` (por `categoryId`) | 0..1 a N | Sin acción especial: la base impide borrar si hay hijos (o la API responde 409) |
| `SocialPost` → `Publication` (por `socialPostId`) | 1 a 0..1 | Sin acción especial: la base impide borrar si hay hijos (o la API responde 409) |
| `Category` → `Notice` (por `categoryId`) | 0..1 a N | Sin acción especial: la base impide borrar si hay hijos (o la API responde 409) |
| `Document` → `Notice` (por `attachmentId`) | 0..1 a N | Sin acción especial: la base impide borrar si hay hijos (o la API responde 409) |
| `AcademicTerm` → `Schedule` (por `termId`) | 1 a N | Sin acción especial: la base impide borrar si hay hijos (o la API responde 409) |
| `Document` → `Schedule` (por `documentId`) | 0..1 a N | Sin acción especial: la base impide borrar si hay hijos (o la API responde 409) |
| `AcademicTerm` → `ExamCall` (por `termId`) | 1 a N | Sin acción especial: la base impide borrar si hay hijos (o la API responde 409) |
| `Document` → `ExamCall` (por `documentId`) | 0..1 a N | Sin acción especial: la base impide borrar si hay hijos (o la API responde 409) |
| `User` → `AuditLog` (por `userId`) | 0..1 a N | Se deja vacío el campo (SetNull) |
