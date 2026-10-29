# 01 · Requerimientos

Prioridad: **M** = Debe · **S** = Debería · **C** = Podría. Origen: **Negocio** o **Sistema** (clasificación pedida por la cátedra). Pantalla: ver `05-ui-y-pantallas.md`.

## Funcionales

| ID | Requerimiento | Prio | Origen | Pantallas |
|---|---|---|---|---|
| RF01 | Administrar el contenido desde un panel sin conocimientos técnicos | M | Negocio | 07–12 |
| RF02 | Distinguir contenido estanco (institucional, carrera, ingreso) de dinámico (novedades, avisos, horarios, mesas) | M | Negocio | 01–06 |
| RF03 | Archivar contenido vencido sin eliminarlo; restaurarlo | M | Negocio | 08, 09, 11 |
| RF04 | Vincular publicaciones de Instagram por selección y aprobación editorial | M | Negocio | 07, 08 |
| RF05 | Soportar múltiples administradores con roles | M | Negocio | 12, 13 |
| RF06 | Mostrar solo horarios y mesas del ciclo público vigente; calendario académico y mesas cargados por archivo, con casilla para destacar eventos próximos | M | Negocio | 04, 10, 12 |
| RF07 | Accesos directos a SIU Guaraní, Aula virtual, Mi Argentina y Tutoría | M | Negocio | 04 |
| RF08 | Formulario de contacto a correo institucional | S | Negocio | sin diseño |
| RF09 | Galería con descripción y categoría | C | Negocio | sin diseño |
| RF10 | Plantel docente y materias a cargo | S | Negocio | 02 (parcial) |

## No funcionales

| ID | Requerimiento | Prio | Origen | Verificación |
|---|---|---|---|---|
| RNF01 | Usabilidad para personal no técnico | M | Negocio | Prueba con editores reales (O5) |
| RNF02 | Infraestructura gratuita o de costo mínimo | M | Negocio | Costo mensual 0 en producción inicial |
| RNF03 | Disponibilidad estable; el sitio sigue funcionando si fallan Instagram, correo o almacenamiento; respaldos periódicos | M | Sistema | Prueba de degradación; restauración de respaldo |
| RNF04 | Responsive (390 px a 1440 px) | M | Sistema | Cypress en dos viewports |
| RNF05 | Rendimiento con alto volumen de imágenes | M | Sistema | Lighthouse móvil Rendimiento ≥ 80; imágenes comprimidas y con CDN |
| RNF06 | Panel protegido por autenticación y permisos por rol | M | Sistema | Pruebas de API 401/403 |
| RNF07 | Accesibilidad WCAG 2.2 AA en el sitio público y en el panel | M | Sistema | axe automático + Lighthouse Accesibilidad ≥ 90 |
| RNF09 | Capacidad: soportar 300 a 400 usuarios concurrentes en picos (inscripciones y mesas) sin caída del sitio público | M | Sistema | Prueba de carga con k6 sobre el sitio público (400 usuarios virtuales) y caché de páginas |
| RNF08 | Protección de datos personales (Ley 25.326) en contacto e imágenes de estudiantes | M | Sistema | Aviso de uso de datos; consentimiento; datos mínimos |

## Criterios de aceptación (Gherkin) de los requerimientos Must

**RF03 · Vigencia y archivo**
```
Dado un aviso ACTIVO con visibleUntil en el pasado
Cuando un visitante entra a Estudiantes
Entonces el aviso no se muestra
Y el aviso sigue existiendo y aparece en el panel con el filtro "Vencidos"
Y un usuario con permiso puede reactivarlo con una nueva vigencia
```
```
Dado cualquier contenido que vence o se pausa
Entonces ninguna tarea automática lo elimina
```
```
Dado un aviso vencido o pausado
Cuando un usuario autorizado elige "Eliminar" y confirma en el diálogo
Entonces el aviso se elimina, la acción queda en AuditLog con quién y cuándo, y no se puede eliminar contenido vigente ni referenciado (409)
```

**RF04 · Moderación de redes**
```
Dado una publicación de Instagram detectada con el hashtag configurado
Cuando un Editor abre Publicaciones con filtro Origen "Instagram" y Estado "Pendiente"
Entonces la ve con estado "Pendiente"
Cuando elige "Aprobar y publicar", define sección (Inicio, Novedades o ambas), categoría y vigencia, y confirma
Entonces se crea una Publicación PUBLISHED con origen INSTAGRAM, la imagen se copia al almacenamiento propio,
  el SocialPost pasa a LINKED y la acción queda en AuditLog
Y la publicación aparece en el sitio público dentro de 60 segundos
```
```
Dado una publicación detectada
Cuando el Editor elige "Descartar" y confirma
Entonces el SocialPost pasa a DISCARDED, no aparece en el sitio, y puede recuperarse desde el filtro "Descartadas"
```
```
Dado que la API de Instagram falla o el token venció
Cuando se pulsa "sincronizar"
Entonces el Resumen muestra el estado "Instagram API: error" con el motivo
Y el panel ofrece "Cargar publicación manualmente" sin impedir el uso del resto
```

**RF06 · Ciclo público**
```
Dado que Configuración define Año lectivo 2026 y Cuatrimestre visible "2.º"
Cuando un visitante entra a Estudiantes
Entonces ve solo horarios y llamados publicados del ciclo 2026-2.º
Cuando un administrador cambia el ciclo público (con confirmación)
Entonces el sitio muestra el nuevo ciclo y el anterior queda accesible solo desde el Archivo del panel
```

**RF05 / RNF06 · Roles**
```
Dado un usuario con rol BEDELIA
Cuando intenta acceder a Configuración > usuarios o a Publicaciones de redes
Entonces la API responde 403 y la interfaz no muestra esas opciones
```
(Matriz completa de permisos en `04-api.md`.)

**RF07 · Enlaces**
```
Dado enlaces de interés visibles
Cuando un visitante entra a Estudiantes
Entonces ve SIU Guaraní, Aula virtual y Tutoría, y los enlaces externos abren en pestaña nueva con rel="noopener noreferrer"
```

**RNF03 · Degradación**
```
Dado que el servicio de almacenamiento o de correo está caído
Cuando un visitante navega el sitio público
Entonces todas las páginas cargan con el contenido ya publicado
```

**RNF07 · Accesibilidad**
```
Dado cualquier pantalla del sitio o del panel
Entonces se puede operar solo con teclado, los modales atrapan y devuelven el foco,
los formularios tienen etiquetas, los estados no se comunican solo con color y el contraste es AA
```

**RNF08 · Datos personales**
```
Dado el formulario de contacto
Entonces exige aceptar el aviso de uso de datos antes de enviar
Y las fotos con estudiantes solo se publican si el editor confirma que existe consentimiento (casilla en el modal de moderación)
```

**RF06 · Calendario y destacados (reunión del 06/10)**
```
Dado un llamado a examen o un aviso con la casilla "destacar" marcada
Cuando un visitante entra a Inicio o a Estudiantes
Entonces el elemento aparece resaltado como próximo evento hasta su fecha
```

## Reglas de negocio

1. Una `Publication` es visible si `status = PUBLISHED` y `now` está entre `visibleFrom` (si existe) y `visibleUntil` (si existe). Una `SCHEDULED` pasa a visible al llegar `visibleFrom`.
2. Un `Notice` es visible si `status = ACTIVE` y `now` está dentro de su vigencia. Los de `urgent = true` van primero y llevan la etiqueta "Urgente".
3. Un `Schedule` o `ExamCall` es visible solo si `published = true` y su `AcademicTerm` es el `publicCurrent`. Hay exactamente un ciclo `publicCurrent`.
4. Archivar un `Document` lo marca `ARCHIVED` con `archivedAt`; restaurar vuelve a `ACTIVE` con `restoredAt`. Un documento adjunto a algo visible no se puede archivar sin confirmación.
5. Los avisos "próximos a vencer" son los que vencen en los siguientes 7 días (tarjeta del Resumen).
6. Un `SocialPost.externalId` es único: sincronizar dos veces no duplica.
7. Ninguna mutación sin `AuditLog`.
8. **Eliminación:** solo manual, con confirmación, nunca automática. Solo se elimina contenido en estado borrador, pausado, descartado, vencido o archivado; un elemento referenciado por otro (por ejemplo un documento adjunto a un aviso vigente) devuelve 409. Roles: ver matriz de `04-api.md`.
9. **Validaciones mínimas (consigna de la cátedra):** campos obligatorios no vacíos, evitar duplicados (correo de usuario, nombre de categoría, ciclo año+tipo, `externalId` de redes), mensajes claros en español.
