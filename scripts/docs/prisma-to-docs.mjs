// Deriva documentación de la base de datos a partir de prisma/schema.prisma (fuente única de verdad).
//
// Genera:
//  1. docs/entrega/diagramas/der-*.mmd : diagramas entidad-relación en Mermaid (completo y por áreas).
//     Se renderizan a .svg/.png con @mermaid-js/mermaid-cli (ver docs/entrega/diagramas/README.md).
//  2. Las tablas "Tablas y campos" y "Enumeraciones" del Manual Técnico, entre los marcadores
//     <!-- BEGIN:tablas --> ... <!-- END:tablas --> de docs/entrega/Manual-Tecnico.md.
//
// Uso: node scripts/docs/prisma-to-docs.mjs
// Los significados de cada campo están en el diccionario DESC de abajo: si agregás un campo al
// schema, agregá su descripción acá (el script avisa de los que faltan).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const schemaText = readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');

// ---------------------------------------------------------------- parser
const models = [];
const enums = [];
{
  const re = /^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(schemaText))) {
    const [, kind, name, body] = m;
    if (kind === 'enum') {
      const values = body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'))
        .map((l) => {
          const [v, ...c] = l.split('//');
          return { name: v.trim(), comment: c.join('//').trim() };
        });
      enums.push({ name, values });
    } else {
      const fields = [];
      const blockAttrs = [];
      for (const raw of body.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('//')) continue;
        const [code, ...cm] = line.split('//');
        const comment = cm.join('//').trim();
        const c = code.trim();
        if (c.startsWith('@@')) {
          blockAttrs.push(c);
          continue;
        }
        const fm = c.match(/^(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$/);
        if (!fm) continue;
        fields.push({
          name: fm[1],
          type: fm[2],
          optional: fm[3] === '?',
          list: fm[3] === '[]',
          attrs: fm[4],
          comment,
        });
      }
      models.push({ name, fields, blockAttrs });
    }
  }
}
const modelNames = new Set(models.map((m) => m.name));
const enumNames = new Set(enums.map((e) => e.name));

for (const m of models) {
  for (const f of m.fields) {
    f.isRelation = modelNames.has(f.type);
    f.isEnum = enumNames.has(f.type);
    f.pk = /@id\b/.test(f.attrs);
    f.unique = /@unique\b/.test(f.attrs);
    const d = f.attrs.match(/@default\(([^)]*\)?)\)/);
    f.default = d ? d[1] : null;
    const rel = f.attrs.match(
      /@relation\(fields:\s*\[(\w+)\],\s*references:\s*\[(\w+)\](?:,\s*onDelete:\s*(\w+))?/,
    );
    f.fk = rel ? { field: rel[1], ref: rel[2], onDelete: rel[3] ?? null } : null;
  }
}
const byName = Object.fromEntries(models.map((m) => [m.name, m]));

// ---------------------------------------------------------------- descripciones
const GENERIC = {
  id: 'Identificador único (UUID generado por la aplicación).',
  createdAt: 'Fecha y hora de creación del registro.',
  updatedAt: 'Fecha y hora de la última modificación (la actualiza Prisma sola).',
};
const DESC = {
  'GalleryItem.area': 'Dónde se muestra: STUDENTS (carrusel de Estudiantes) o CAREER (La carrera).',
  'GalleryItem.order': 'Posición dentro del área (de menor a mayor).',
  'GalleryItem.title': 'Título de la diapositiva (opcional).',
  'GalleryItem.caption': 'Descripción visible debajo de la imagen (opcional).',
  'GalleryItem.alt': 'Texto alternativo de la imagen para lectores de pantalla.',
  'GalleryItem.category':
    'Categoría opcional (por ejemplo «Prácticas»); alimenta el filtro del carrusel de Estudiantes.',
  'GalleryItem.image':
    'Ruta propia del sitio (/img/...) o clave del almacenamiento (gallery/<uuid>.webp); nunca una URL firmada.',
  'Teacher.name': 'Nombre y apellido que se muestra en el sitio.',
  'Teacher.role': 'Cargo o rol libre (por ejemplo «Profesora»); vacío si no se cargó.',
  'Teacher.subjects': 'Materias a cargo (texto libre; el plan de estudios vive en ContentSection).',
  'Teacher.photo':
    'Foto opcional (ruta propia o clave del almacenamiento); vacío = sin foto. Requiere consentimiento (Ley 25.326).',
  'Teacher.order': 'Posición en la lista del sitio.',
  'Teacher.visible':
    'Falso = baja lógica: no se muestra en el sitio, pero se conserva. Solo una persona oculta puede eliminarse.',
  'User.email': 'Correo con el que inicia sesión. No se repite entre usuarios.',
  'User.name': 'Nombre y apellido que se muestra en el panel y en la auditoría.',
  'User.passwordHash':
    'Clave guardada como hash argon2id. Nunca se guarda ni se devuelve la clave en claro.',
  'User.role': 'Relación con Role.',
  'User.roleId': 'Rol del usuario (relación con Role). Sus permisos se leen en cada pedido.',
  'Role.key':
    'Clave interna única del rol (SUPERADMIN, ADMIN, BEDELIA, EDITOR o la de un rol creado).',
  'Role.name': 'Nombre que se muestra en el panel. No se repite entre roles.',
  'Role.description': 'Explicación breve de para qué sirve el rol.',
  'Role.isSystem':
    'Verdadero para los roles que crea la semilla. SUPERADMIN no se edita ni se elimina; los demás sí se pueden eliminar si no tienen usuarios.',
  'Role.permissions': 'Permisos del rol (relación inversa con RolePermission).',
  'Role.users': 'Usuarios que tienen este rol (relación inversa).',
  'RolePermission.roleId': 'Rol al que pertenece el permiso. Al borrar el rol se borran sus filas.',
  'RolePermission.role': 'Relación con Role.',
  'RolePermission.permission':
    'Permiso del catálogo fijo en el código (por ejemplo notices:manage). No se repite dentro del rol.',
  'User.active':
    'Si es falso, la persona no puede iniciar sesión (se desactiva en lugar de borrar, para conservar la auditoría).',
  'User.mustChangePassword':
    'Verdadero tras crear el usuario con clave temporal o restablecerla: obliga a cambiarla en el próximo ingreso.',
  'User.lastLoginAt': 'Último inicio de sesión exitoso.',
  'User.sessions': 'Sesiones abiertas del usuario (relación inversa).',
  'User.audit': 'Acciones auditadas realizadas por el usuario (relación inversa).',
  'Session.userId': 'Usuario dueño de la sesión. Al borrar el usuario se borran sus sesiones.',
  'Session.user': 'Relación con User.',
  'Session.tokenHash':
    'Hash del token de la cookie de sesión (nunca el token en claro). Permite revocar sesiones.',
  'Session.expiresAt':
    'Momento en que la sesión deja de ser válida (8 horas, o 14 días con «recordarme»).',
  'Session.userAgent': 'Navegador desde el que se inició la sesión (informativo).',
  'Category.name': 'Nombre de la categoría (por ejemplo «Inscripciones»).',
  'Category.kind':
    'A qué se aplica: PUBLICATION, NOTICE o GALLERY. El par (nombre, tipo) no se repite.',
  'Category.publications': 'Publicaciones de la categoría (relación inversa).',
  'Category.notices': 'Avisos de la categoría (relación inversa).',
  'SocialPost.platform': 'Red social de origen (hoy INSTAGRAM).',
  'SocialPost.externalId':
    'Identificador del medio en Instagram. Es único: evita importar dos veces la misma publicación.',
  'SocialPost.permalink': 'Enlace público a la publicación original en la red.',
  'SocialPost.caption': 'Texto (leyenda) de la publicación original.',
  'SocialPost.mediaUrl':
    'Dirección temporal de la imagen; al aprobar se copia al almacenamiento propio.',
  'SocialPost.postedAt': 'Fecha en que se publicó en la red.',
  'SocialPost.status':
    'DETECTED (pendiente de moderar), LINKED (aprobada, ya tiene Publication) o DISCARDED (descartada).',
  'SocialPost.detectedAt': 'Cuándo la detectó la sincronización.',
  'SocialPost.moderatedBy': 'Id del usuario que la aprobó o descartó.',
  'SocialPost.moderatedAt': 'Cuándo se moderó.',
  'SocialPost.publication':
    'Publicación del sitio creada a partir de esta (relación inversa 1 a 1).',
  'Publication.kind': 'NEWS (noticia) o EVENT (evento).',
  'Publication.title': 'Título que ve el visitante.',
  'Publication.summary': 'Resumen corto para tarjetas y listados.',
  'Publication.body': 'Texto completo (Markdown acotado, se sanitiza al mostrarlo).',
  'Publication.coverUrl':
    'Imagen de portada: una dirección http(s) o una clave del almacenamiento propio.',
  'Publication.categoryId': 'Categoría opcional.',
  'Publication.category': 'Relación con Category.',
  'Publication.section': 'Dónde se muestra: HOME (inicio), NEWS (novedades) o BOTH.',
  'Publication.status':
    'DRAFT (borrador), SCHEDULED (programada), PUBLISHED (publicada) o PAUSED (pausada). La vigencia real se calcula al consultar.',
  'Publication.origin':
    'MANUAL (cargada en el panel) o INSTAGRAM (aprobada desde una publicación de la red).',
  'Publication.socialPostId':
    'Publicación de Instagram de la que proviene. Única: una publicación de red genera, como máximo, una del sitio.',
  'Publication.socialPost': 'Relación con SocialPost.',
  'Publication.visibleFrom': 'Desde cuándo es visible (inclusivo). Vacío = sin límite.',
  'Publication.visibleUntil': 'Hasta cuándo es visible (exclusivo). Vacío = sin vencimiento.',
  'Publication.eventStart': 'Inicio del evento (solo si kind = EVENT).',
  'Publication.eventEnd': 'Fin del evento.',
  'Publication.location': 'Lugar del evento.',
  'Publication.authorId':
    'Id del usuario autor (se guarda como texto, sin clave foránea, para no perder el dato si se desactiva).',
  'Notice.title': 'Título del aviso.',
  'Notice.body': 'Texto del aviso.',
  'Notice.categoryId': 'Categoría opcional (tipo NOTICE).',
  'Notice.category': 'Relación con Category.',
  'Notice.audience': 'A quién va dirigido: ALL, STUDENTS, ASPIRANTS o GRADUATES.',
  'Notice.urgent': 'Marca el aviso como urgente (se muestra destacado).',
  'Notice.highlighted': 'Destaca un evento próximo.',
  'Notice.status': 'ACTIVE o PAUSED. «Vencido» no se guarda: se calcula con visibleUntil.',
  'Notice.visibleFrom': 'Desde cuándo es visible (por defecto, ahora).',
  'Notice.visibleUntil': 'Hasta cuándo es visible. Vacío = sin vencimiento.',
  'Notice.attachmentId': 'Documento adjunto opcional.',
  'Notice.attachment': 'Relación con Document.',
  'Notice.authorId': 'Id del usuario que lo creó.',
  'Document.title': 'Nombre que se muestra del documento.',
  'Document.filename': 'Nombre original del archivo subido.',
  'Document.kind': 'Tipo: SCHEDULE, EXAM_CALENDAR, RESOLUTION, PLAN, NOTICE_ATTACHMENT u OTHER.',
  'Document.category': 'Etiqueta libre para la tabla del archivo (por ejemplo «Mesas Examen»).',
  'Document.cycleYear': 'Ciclo lectivo (año) al que corresponde.',
  'Document.termLabel': 'Cuatrimestre en texto (por ejemplo «2.° Cuat.»).',
  'Document.resolutionCode': 'Código de la resolución, si es una resolución.',
  'Document.storageKey':
    'Clave del archivo en el almacenamiento (única). No sale de la API: se descarga con URL firmada.',
  'Document.mimeType': 'Tipo de archivo (por ejemplo application/pdf).',
  'Document.sizeBytes': 'Tamaño en bytes.',
  'Document.status': 'ACTIVE o ARCHIVED (archivado: sale del sitio pero no se borra).',
  'Document.archivedAt': 'Cuándo se archivó.',
  'Document.restoredAt': 'Cuándo se restauró por última vez.',
  'Document.uploadedBy': 'Id del usuario que lo subió.',
  'Document.notices': 'Avisos que lo adjuntan (relación inversa).',
  'Document.schedules': 'Horarios que lo usan (relación inversa).',
  'Document.examCalls': 'Llamados que lo usan (relación inversa).',
  'AcademicTerm.year': 'Año del ciclo lectivo.',
  'AcademicTerm.kind':
    'FIRST (1.er cuatrimestre), SECOND (2.º) o EXTRAORDINARY. El par (año, tipo) no se repite.',
  'AcademicTerm.startsOn': 'Inicio del ciclo.',
  'AcademicTerm.endsOn': 'Fin del ciclo.',
  'AcademicTerm.publicCurrent':
    'Verdadero en el ciclo que muestra el sitio. Solo uno puede serlo (índice único parcial en la base).',
  'AcademicTerm.schedules': 'Horarios del ciclo (relación inversa).',
  'AcademicTerm.examCalls': 'Llamados del ciclo (relación inversa).',
  'Schedule.termId': 'Ciclo al que pertenece.',
  'Schedule.term': 'Relación con AcademicTerm.',
  'Schedule.commissionName': 'Comisión (por ejemplo «Comisión A y B»).',
  'Schedule.documentId': 'Grilla de horarios adjunta (documento).',
  'Schedule.document': 'Relación con Document.',
  'Schedule.notes': 'Observaciones.',
  'Schedule.published': 'Si está publicado. Solo se ve si además su ciclo es el público.',
  'Schedule.updatedBy': 'Id del usuario que lo modificó por última vez.',
  'ExamCall.termId': 'Ciclo al que pertenece.',
  'ExamCall.term': 'Relación con AcademicTerm.',
  'ExamCall.name': 'Nombre del llamado (por ejemplo «Turno extraordinario de Diciembre 2026»).',
  'ExamCall.startsOn': 'Primer día del llamado.',
  'ExamCall.endsOn': 'Último día del llamado.',
  'ExamCall.enrollmentOpen': 'Si la inscripción a las mesas está abierta.',
  'ExamCall.highlighted': 'Destaca el llamado próximo.',
  'ExamCall.documentId': 'Calendario o documento adjunto.',
  'ExamCall.document': 'Relación con Document.',
  'ExamCall.notes': 'Observaciones.',
  'ExamCall.published': 'Si está publicado. Solo se ve si además su ciclo es el público.',
  'ExamCall.updatedBy': 'Id del usuario que lo modificó por última vez.',
  'SiteSetting.key':
    'Nombre del ajuste (por ejemplo institution_name, address, instagram_hashtag).',
  'SiteSetting.value': 'Valor del ajuste, siempre texto.',
  'ContentSection.page': 'Página a la que pertenece: institucional, carrera o ingreso.',
  'ContentSection.slug':
    'Identificador corto de la sección dentro de la página. (página, slug) no se repite.',
  'ContentSection.title': 'Título de la sección.',
  'ContentSection.body': 'Texto en Markdown acotado, sanitizado al mostrarlo.',
  'ContentSection.order': 'Posición dentro de la página.',
  'ContentSection.visible': 'Si se muestra en el sitio.',
  'ExternalLink.title': 'Texto del enlace (por ejemplo «SIU Guaraní»).',
  'ExternalLink.url': 'Dirección del enlace.',
  'ExternalLink.description': 'Descripción breve opcional.',
  'ExternalLink.group': 'Grupo donde se agrupa (por defecto «academico»).',
  'ExternalLink.order': 'Posición dentro del grupo.',
  'ExternalLink.visible': 'Si se muestra en el sitio.',
  'ExternalLink.enrollment':
    'Si es el enlace donde se inscriben los alumnos (el único que muestra la página Inscripciones; A07).',
  'ContactMessage.name': 'Nombre de quien escribe.',
  'ContactMessage.email': 'Correo de respuesta.',
  'ContactMessage.subject': 'Asunto.',
  'ContactMessage.message': 'Texto de la consulta.',
  'ContactMessage.status': 'NEW, READ o ANSWERED.',
  'ContactMessage.consent': 'Aceptó el aviso de uso de datos (Ley 25.326). Es obligatorio.',
  'ContactMessage.receivedAt': 'Cuándo llegó.',
  'ContactMessage.mailSent':
    'Si el correo de aviso salió. El mensaje se guarda siempre, aunque el correo falle.',
  'InstagramToken.tokenEnc':
    'Reservado; el token en claro vive cifrado en IntegrationConfig y este campo queda vacío a propósito.',
  'InstagramToken.expiresAt':
    'Vencimiento del token de larga duración (~60 días; se renueva a los ~50).',
  'InstagramToken.refreshedAt': 'Última renovación.',
  'InstagramToken.lastSyncAt': 'Última sincronización con Instagram.',
  'InstagramToken.lastSyncOk': 'Si esa sincronización terminó bien.',
  'IntegrationConfig.key': 'Qué integración configura: «instagram» o «mail».',
  'IntegrationConfig.valueEnc':
    'JSON de la configuración cifrado con AES-256-GCM (clave APP_ENCRYPTION_KEY). Nunca se devuelve en claro.',
  'IntegrationConfig.updatedBy': 'Id del usuario que la guardó por última vez.',
  'AuditLog.userId': 'Quién realizó la acción. Si el usuario se borra queda vacío (SetNull).',
  'AuditLog.user': 'Relación con User.',
  'AuditLog.action': 'Acción realizada (por ejemplo notice.create, document.archive).',
  'AuditLog.entity': 'Tipo de entidad afectada.',
  'AuditLog.entityId': 'Id de la entidad afectada.',
  'AuditLog.detail': 'Datos adicionales en JSON (sin secretos).',
  'AuditLog.at': 'Cuándo ocurrió.',
};
const ENTITY_DESC = {
  User: 'Personas del instituto que usan el panel, con su rol.',
  Session: 'Sesiones de inicio de sesión (revocables).',
  Category: 'Categorías para publicaciones, avisos y galería.',
  SocialPost: 'Publicaciones detectadas en Instagram, a la espera de moderación humana.',
  Publication: 'Noticias y eventos del sitio (manuales o aprobadas desde Instagram).',
  Notice: 'Avisos académicos / cartelera oficial.',
  Document: 'Repositorio documental: archivos subidos, archivados o restaurados, y adjuntos.',
  AcademicTerm:
    'Ciclos lectivos; uno solo es el «público» y gobierna qué horarios y llamados se ven.',
  Schedule: 'Horarios de cursada por comisión (con grilla adjunta).',
  ExamCall: 'Llamados a examen / mesas.',
  SiteSetting: 'Ajustes clave/valor del sitio (sede, contactos, hashtag, etc.).',
  ContentSection: 'Texto editable de las páginas estáticas (Institucional, La carrera, Ingreso).',
  ExternalLink: 'Enlaces de interés (SIU Guaraní, Aulas Virtuales, etc.).',
  ContactMessage: 'Consultas enviadas desde el formulario del sitio.',
  InstagramToken: 'Estado del token y de la sincronización con Instagram (una sola fila).',
  IntegrationConfig:
    'Configuración de integraciones cargada por el cliente desde el panel, cifrada.',
  AuditLog: 'Registro de auditoría: quién hizo qué y cuándo.',
  GalleryItem: 'Diapositivas editables de los carruseles del sitio (Estudiantes y La carrera).',
  Teacher: 'Plantel docente y materias a cargo (con baja lógica).',
};
const ENUM_DESC = {
  Role: 'Rol de usuario.',
  PublicationKind: 'Tipo de publicación.',
  PublicationStatus: 'Estado de una publicación.',
  PublicationOrigin: 'Origen de la publicación.',
  PublicationSection: 'Sección del sitio donde aparece.',
  SocialStatus: 'Estado de moderación de una publicación de red.',
  NoticeStatus: 'Estado de un aviso.',
  NoticeAudience: 'Destinatarios de un aviso.',
  DocumentKind: 'Tipo de documento.',
  DocumentStatus: 'Estado de un documento.',
  TermKind: 'Tipo de ciclo.',
  MessageStatus: 'Estado de un mensaje de contacto.',
};
const ENUM_VALUE_DESC = {
  ADMIN: 'Rectoría / Dirección: acceso total',
  BEDELIA: 'Bedelía Académica: horarios, mesas, avisos y archivo',
  EDITOR: 'Comunicación: publicaciones y redes',
  NEWS: 'Noticia / se muestra en Novedades',
  EVENT: 'Evento',
  DRAFT: 'Borrador',
  SCHEDULED: 'Programada',
  PUBLISHED: 'Publicada',
  PAUSED: 'Pausada',
  MANUAL: 'Cargada a mano en el panel',
  INSTAGRAM: 'Aprobada desde Instagram',
  HOME: 'Inicio',
  BOTH: 'Inicio y Novedades',
  DETECTED: 'Detectada, pendiente de moderar',
  LINKED: 'Aprobada y vinculada a una publicación',
  DISCARDED: 'Descartada',
  ACTIVE: 'Activo',
  ALL: 'Todos',
  STUDENTS: 'Estudiantes',
  ASPIRANTS: 'Aspirantes',
  GRADUATES: 'Egresados',
  SCHEDULE: 'Horario',
  EXAM_CALENDAR: 'Calendario de exámenes',
  RESOLUTION: 'Resolución',
  PLAN: 'Plan de estudios',
  NOTICE_ATTACHMENT: 'Adjunto de aviso',
  OTHER: 'Otro',
  ARCHIVED: 'Archivado',
  FIRST: '1.er cuatrimestre',
  SECOND: '2.º cuatrimestre',
  EXTRAORDINARY: 'Extraordinario',
  NEW: 'Nuevo',
  READ: 'Leído',
  ANSWERED: 'Respondido',
};

// ---------------------------------------------------------------- diagramas
const AREAS = {
  completo: {
    titulo: 'Vista general (solo claves y relaciones; sin las tablas aisladas)',
    entities: [
      'User',
      'Session',
      'AuditLog',
      'Category',
      'SocialPost',
      'Publication',
      'Notice',
      'Document',
      'AcademicTerm',
      'Schedule',
      'ExamCall',
      'GalleryItem',
      'Teacher',
    ],
    compact: true,
  },
  'acceso-y-auditoria': { titulo: 'Acceso y auditoría', entities: ['User', 'Session', 'AuditLog'] },
  'publicaciones-y-redes': {
    titulo: 'Publicaciones, redes e integraciones',
    entities: ['Category', 'SocialPost', 'Publication', 'InstagramToken', 'IntegrationConfig'],
  },
  academico: {
    titulo: 'Bloque académico: avisos, ciclos, horarios, llamados y archivo',
    entities: ['Category', 'Notice', 'Document', 'AcademicTerm', 'Schedule', 'ExamCall'],
  },
  sitio: {
    titulo: 'Contenido del sitio, galerías, plantel y contacto',
    entities: [
      'SiteSetting',
      'ContentSection',
      'ExternalLink',
      'ContactMessage',
      'GalleryItem',
      'Teacher',
    ],
  },
};

function relationsOf(set) {
  const out = [];
  for (const m of models) {
    for (const f of m.fields) {
      if (!f.isRelation || !f.fk) continue;
      if (!set.has(m.name) || !set.has(f.type)) continue;
      const fkField = m.fields.find((x) => x.name === f.fk.field);
      const parentSide = fkField?.optional ? '|o' : '||';
      const childSide = fkField?.unique ? 'o|' : 'o{';
      out.push(`  ${f.type} ${parentSide}--${childSide} ${m.name} : "${f.fk.field}"`);
    }
  }
  return out;
}

function entityBlock(m, compact) {
  const lines = [`  ${m.name} {`];
  for (const f of m.fields) {
    if (f.isRelation) continue;
    const fkOf = models
      .flatMap((x) => x.fields)
      .find((x) => x.fk && x.fk.field === f.name && x === m.fields.find((y) => y.name === x.name));
    const isFk = m.fields.some((x) => x.fk?.field === f.name);
    if (compact && !f.pk && !isFk) continue;
    const marks = [f.pk ? 'PK' : null, isFk ? 'FK' : null, f.unique && !f.pk ? 'UK' : null]
      .filter(Boolean)
      .join(',');
    void fkOf;
    lines.push(`    ${f.type} ${f.name}${marks ? ' ' + marks : ''}`);
  }
  lines.push('  }');
  return lines.join('\n');
}

const outDir = path.join(root, 'docs', 'entrega', 'diagramas');
mkdirSync(outDir, { recursive: true });
for (const [key, area] of Object.entries(AREAS)) {
  const set = new Set(area.entities);
  const text = [
    '%% Generado por scripts/docs/prisma-to-docs.mjs desde prisma/schema.prisma. No editar a mano.',
    `%% ${area.titulo}`,
    'erDiagram',
    ...area.entities.map((n) => entityBlock(byName[n], area.compact)),
    ...relationsOf(set),
    '',
  ].join('\n');
  writeFileSync(path.join(outDir, `der-${key}.mmd`), text);
}

// ---------------------------------------------------------------- tablas en markdown
const missing = [];
function restrictions(m, f) {
  const r = [];
  if (f.pk) r.push('PK');
  if (f.unique) r.push('único');
  r.push(f.optional ? 'opcional' : 'obligatorio');
  if (f.default) r.push(`por defecto ${f.default.replace(/\|/g, '/')}`);
  if (f.fk) r.push(`FK → ${f.type}.${f.fk.ref}${f.fk.onDelete ? ` (${f.fk.onDelete})` : ''}`);
  const fkTarget = m.fields.find((x) => x.fk?.field === f.name);
  if (fkTarget)
    r.push(
      `FK → ${fkTarget.type}.${fkTarget.fk.ref}${fkTarget.fk.onDelete ? ` (${fkTarget.fk.onDelete})` : ''}`,
    );
  return r.join(', ');
}
function typeLabel(f) {
  return `${f.type}${f.list ? '[]' : ''}`;
}

const md = [];
md.push('### Tablas y campos', '');
md.push(
  '> Esta sección se genera con `node scripts/docs/prisma-to-docs.mjs` a partir de `prisma/schema.prisma`; no se edita a mano. Los tipos son los de Prisma (`String` = texto, `Int` = entero, `Boolean` = verdadero/falso, `DateTime` = fecha y hora en UTC, `Json` = objeto JSON); en PostgreSQL se materializan como `TEXT`, `INTEGER`, `BOOLEAN`, `TIMESTAMP(3)` y `JSONB`. Las filas «Relación con …» son los lados de navegación de Prisma y no son columnas.',
  '',
);
for (const m of models) {
  md.push(`#### ${m.name}`, '', ENTITY_DESC[m.name] ?? '', '');
  md.push('| Campo | Tipo | Restricciones | Significado |', '|---|---|---|---|');
  for (const f of m.fields) {
    const key = `${m.name}.${f.name}`;
    let d = DESC[key] ?? GENERIC[f.name];
    if (!d) {
      missing.push(key);
      d = f.comment || '[completar]';
    }
    const cols = f.isRelation ? '(no es columna)' : restrictions(m, f);
    md.push(`| \`${f.name}\` | ${typeLabel(f)} | ${cols} | ${d} |`);
  }
  if (m.blockAttrs.length) {
    md.push(
      '',
      `Restricciones e índices de la tabla: ${m.blockAttrs.map((a) => '`' + a + '`').join(', ')}.`,
    );
  }
  md.push('');
}
md.push('#### Índice único parcial (SQL de la migración inicial)', '');
md.push(
  'Prisma no puede expresar este índice en el schema, por eso vive en `prisma/migrations/20261029224122_init/migration.sql`: garantiza que **solo un ciclo** tenga `publicCurrent = true`.',
  '',
);
md.push('### Enumeraciones', '', '| Enumeración | Valores | Uso |', '|---|---|---|');
for (const e of enums) {
  md.push(
    `| \`${e.name}\` | ${e.values.map((v) => `\`${v.name}\` (${ENUM_VALUE_DESC[v.name] ?? v.comment ?? ''})`).join('; ')} | ${ENUM_DESC[e.name] ?? ''} |`,
  );
}
md.push('');
md.push(
  '### Relaciones entre tablas',
  '',
  '| Relación | Cardinalidad | Regla al borrar |',
  '|---|---|---|',
);
for (const m of models) {
  for (const f of m.fields) {
    if (!f.isRelation || !f.fk) continue;
    const fkField = m.fields.find((x) => x.name === f.fk.field);
    const card = fkField?.unique ? '1 a 0..1' : fkField?.optional ? '0..1 a N' : '1 a N';
    const onDel =
      f.fk.onDelete === 'Cascade'
        ? 'En cascada: se borran los hijos'
        : f.fk.onDelete === 'SetNull'
          ? 'Se deja vacío el campo (SetNull)'
          : 'Sin acción especial: la base impide borrar si hay hijos (o la API responde 409)';
    md.push(`| \`${f.type}\` → \`${m.name}\` (por \`${f.fk.field}\`) | ${card} | ${onDel} |`);
  }
}
md.push('');
const generated = md.join('\n');

const manual = path.join(root, 'docs', 'entrega', 'Manual-Tecnico.md');
if (existsSync(manual)) {
  const src = readFileSync(manual, 'utf8');
  const re = /<!-- BEGIN:tablas -->[\s\S]*?<!-- END:tablas -->/;
  if (!re.test(src)) {
    console.error('Faltan los marcadores BEGIN:tablas / END:tablas en Manual-Tecnico.md');
    process.exitCode = 1;
  } else {
    writeFileSync(
      manual,
      src.replace(re, () => `<!-- BEGIN:tablas -->\n${generated}\n<!-- END:tablas -->`),
    );
  }
} else {
  writeFileSync(path.join(outDir, 'tablas-y-campos.generado.md'), generated);
}
if (missing.length) console.warn('Campos sin descripción en el diccionario:', missing.join(', '));
console.log(`DER y tablas generados (${models.length} entidades, ${enums.length} enumeraciones).`);
