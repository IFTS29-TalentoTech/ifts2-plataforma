# 00 · Visión y alcance del MVP

## Problema

El IFTS N.° 2 DE 20 (gestión pública, Ministerio de Educación del GCABA; Tecnicatura Superior en Emprendimientos Gastronómicos) tiene un sitio en Google Sites abandonado hace más de un año: mezcla información de 2021 a 2026, presenta horarios y mesas en archivos incrustados, no tiene panel de gestión, ni contacto, ni relación con las redes que el equipo de comunicación sí usa (Instagram y Facebook). Los administradores reales son docentes sin perfil técnico.

**Frase ancla del cliente (debe verse en el sitio):** *"Nosotros no formamos chefs. Formamos empresarios/microempresarios gastronómicos."*

## Objetivo del MVP

Reemplazar el sitio actual por una plataforma propia que el personal del instituto pueda mantener sin conocimientos técnicos, con información siempre vigente (lo vencido se archiva; nunca se borra de forma automática) y con incorporación **selectiva y aprobada por una persona** de las publicaciones de Instagram.

## Usuarios

| Perfil | Quién | Qué necesita |
|---|---|---|
| Visitante | Aspirantes, alumnos, egresados, comunidad | Conocer la carrera, ver novedades, horarios y mesas vigentes, ingresar a SIU, Aula virtual y Mi Argentina |
| Editor | Comunicación (Matías Peláez, María del Carmen Canobi) | Moderar publicaciones de redes y cargar novedades |
| Bedelía | Bedelía Académica | Gestionar avisos, horarios y llamados a examen |
| Administrador | Rectoría / Dirección | Acceso total: configuración, usuarios y roles, archivo |

## Alcance del MVP (MoSCoW)

**Debe (Must)**
- Sitio público responsive: Inicio, Institucional, La carrera, Estudiantes, Ingreso y Novedades.
- Panel de gestión protegido por login: Resumen, Publicaciones, Avisos académicos, Horarios, Archivo y Configuración.
- Moderación de publicaciones de Instagram (detectar → aprobar con sección y vigencia → publicar, o descartar) con alternativa de carga manual.
- Avisos académicos con destinatario, vigencia, adjunto, pausa y estado.
- Horarios por comisión y llamados a examen del ciclo público, con archivos adjuntos.
- Archivo documental con búsqueda, filtros, detalle y restauración.
- Configuración del ciclo público (año y cuatrimestre visibles), datos institucionales y gestión de usuarios y roles.
- Enlaces de interés: SIU Guaraní, Aula virtual, Mi Argentina, Tutoría.
- Auditoría de cambios, accesibilidad AA, protección de datos personales.

**Debería (Should)**
- Formulario de contacto con envío a correo institucional y bandeja en el panel (RF08).
- Plantel docente con materias a cargo (RF10).
- Plan de estudios por año con correlatividades navegables (hoy el Figma lo muestra como tarjetas y un botón).

**Podría (Could)**
- Galería de imágenes y videos con descripción y categoría (RF09).
- Versión móvil del panel (el Figma solo tiene móvil del sitio público y del login).
- Panel de resumen con métricas adicionales.

**No entra (Won't)**
- Publicar desde el sitio hacia las redes sociales.
- Simulador gastronómico (idea futura del cliente).
- Gestión de trámites de bedelía o certificados (solo contacto).
- Cualquier CMS de terceros (WordPress, etc.): decisión cerrada de la cátedra.
- Integración con Facebook por API propia: según el cliente, Facebook replica lo que se publica en Instagram.

## Criterios de éxito (de la Etapa 2, objetivos SMART)

| Objetivo | Medida |
|---|---|
| O2 Panel operativo | 0 errores bloqueantes abiertos al hito; criterios de aceptación de RF01, RF06, RF09, RF10 aprobados |
| O3 Selección editorial | Al menos 1 publicación real de Instagram vinculada al sitio de punta a punta |
| O4 Vigencia | 100 % de horarios y mesas visibles corresponden al ciclo público vigente, verificado con casos de prueba |
| O5 Autonomía | Los editores completan 3 tareas típicas (crear novedad, cargar horario, moderar publicación) sin asistencia |
| O6 Calidad web | Lighthouse móvil: Rendimiento ≥ 80 y Accesibilidad ≥ 90 en el Inicio |

## Restricciones

- Presupuesto casi nulo: infraestructura gratuita en la etapa inicial; dominio .edu.ar o subdominio provisorio.
- Administradores no técnicos: simplicidad por encima de la flexibilidad.
- Volumen alto de imágenes históricas: compresión y almacenamiento externo.
- Cronograma de la cátedra: versión funcional en la semana 13 (hito crítico con probabilidad estimada de 36 % de cumplirse en plazo según PERT; priorizar el Must).
- El cliente puede pedir cambios: los tokens de diseño y los textos deben ser fáciles de modificar.
