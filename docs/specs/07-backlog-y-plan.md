# 07 · Backlog y plan de implementación

Prioridad M / S / C como en `01-requerimientos.md`. Una historia = una rama = un pull request pequeño. El orden de las fases respeta la ruta crítica del proyecto (backend → integración y QA → hito de la semana 13).

## Fases

| Fase | Objetivo | Salida verificable | Historias |
|---|---|---|---|
| 0. Base | Repositorio, CI, entorno, esqueleto | Pipeline en verde, "hola mundo" desplegado en vista previa, semilla ejecutable | US-01, US-02, US-03 |
| 1. Núcleo | Autenticación, roles, auditoría, prueba de concepto de Instagram | Login y permisos; informe de la prueba de concepto | US-04, US-05, US-06 |
| 2. Contenido dinámico | Publicaciones, moderación, avisos (con eliminación manual confirmada, US-33) | Flujo de moderación de punta a punta (con doble) | US-07 a US-12 |
| 3. Académico y archivo | Horarios, llamados, ciclo público, documentos, archivo | Estudiantes muestra solo el ciclo público | US-13 a US-18 |
| 4. Sitio público | Las seis páginas, responsive y accesibles | Lighthouse en umbral | US-19 a US-24 |
| 5. Configuración | Datos institucionales, usuarios y roles | Administración completa | US-25, US-26 |
| 6. Should y Could | Contacto, plantel, plan con correlatividades, galería | Según tiempo disponible | US-27 a US-30 |
| 7. Endurecimiento | Seguridad, degradación, rendimiento, respaldos, documentación | Hito de la semana 13 cumplido | US-31, US-32 |
| 8. Entrega a la cátedra | Eliminación con confirmación, evidencias, manuales, instalación y empaquetado | PDF, repositorio, .zip, scripts de base y enlace desplegado | US-33, US-34, US-35 |

## Historias de usuario

| ID | Historia | Prio | Req. | Criterio de aceptación (resumen) |
|---|---|---|---|---|
| US-01 | Como equipo quiero un monorepo con CI para trabajar con calidad desde el inicio | M | RNF | Lint, tipos, pruebas y build en cada pull request |
| US-02 | Como equipo quiero entornos local y de vista previa con semilla | M | RNF | `pnpm dev` levanta todo con datos de demostración |
| US-03 | Como equipo quiero el sistema de diseño (tokens, componentes, diálogo único) | M | RNF07 | Tokens del Figma; componentes con teclado y foco |
| US-04 | Como usuario del panel quiero ingresar con correo y contraseña | M | RNF06 | Escenarios E2E-02 |
| US-05 | Como administrador quiero que los permisos dependan del rol | M | RF05 | Matriz de `04-api.md`; E2E-11 |
| US-06 | Como equipo quiero auditar todo cambio y probar Instagram | M | RF04 | `AuditLog` en cada mutación; informe de la prueba de concepto |
| US-07 | Como editor quiero sincronizar y ver las publicaciones detectadas | M | RF04 | Idempotente; estado en el Resumen |
| US-08 | Como editor quiero moderar y aprobar una publicación con sección y vigencia | M | RF04 | E2E-03 |
| US-09 | Como editor quiero descartar y recuperar publicaciones | M | RF04 | E2E-04 |
| US-10 | Como editor quiero cargar una publicación manualmente | M | RF04, RNF03 | E2E-05 |
| US-11 | Como bedelía quiero crear, editar, pausar y reanudar avisos con adjunto | M | RF03 | E2E-06, E2E-07 |
| US-12 | Como usuario quiero un Resumen con estados y tareas pendientes | M | RF01 | Tarjetas del Figma con datos reales |
| US-13 | Como bedelía quiero cargar horarios por comisión con archivo | M | RF06 | E2E-08 |
| US-14 | Como bedelía quiero crear y editar llamados a examen | M | RF06 | E2E-08 |
| US-15 | Como administrador quiero definir el ciclo público | M | RF06 | E2E-09 |
| US-16 | Como usuario quiero subir documentos con metadatos | M | RF03 | Tipos y tamaños permitidos; E2E-15 |
| US-17 | Como usuario quiero buscar y filtrar el archivo | M | RF03 | Búsqueda por título, resolución o año |
| US-18 | Como usuario quiero ver el detalle y restaurar un documento | M | RF03 | E2E-10 |
| US-19 | Como visitante quiero ver el Inicio | M | RF02 | Pantalla 01 |
| US-20 | Como visitante quiero ver Institucional | M | RF02 | Pantalla 02 |
| US-21 | Como visitante quiero ver La carrera | M | RF02 | Pantalla 03 |
| US-36 | Como bedelía quiero marcar "destacar" en un llamado o aviso para resaltar los eventos próximos | M | RF06 | Aparece resaltado en Inicio y Estudiantes hasta su fecha |
| US-22 | Como visitante quiero ver Estudiantes con el ciclo público y enlaces | M | RF06, RF07 | Pantalla 04; regla 3 de negocio |
| US-23 | Como visitante quiero ver Ingreso | M | RF02 | Pantalla 05 |
| US-24 | Como visitante quiero ver Novedades con filtros y archivo del año | M | RF03 | Pantalla 06 |
| US-25 | Como administrador quiero editar datos institucionales y ajustes | M | RF01 | Pantalla 12 |
| US-26 | Como administrador quiero gestionar usuarios y roles | M | RF05 | E2E-12 |
| US-27 | Como visitante quiero enviar una consulta | S | RF08 | E2E-14 |
| US-28 | Como bedelía quiero leer y marcar mensajes de contacto | S | RF08 | Bandeja con estados |
| US-29 | Como editor quiero gestionar el plantel docente y mostrar el plan con correlatividades | S | RF10 | Alta, baja lógica y visibilidad |
| US-30 | Como editor quiero gestionar la galería | C | RF09 | Imagen con descripción y categoría |
| US-31 | Como equipo quiero degradación controlada, límites de frecuencia y respaldos | M | RNF03, RNF06 | Pruebas de falla de servicios; restauración probada |
| US-32 | Como equipo quiero documentación técnica y manual de usuario | M | RNF01 | Manual con tareas típicas de los editores |
| US-33 | Como usuario autorizado quiero eliminar contenido no vigente con confirmación | M | Consigna | E2E-16; auditoría; 409 si está vigente o referenciado |
| US-34 | Como equipo quiero evidencias de pruebas unitarias e integración documentadas | M | Consigna | Sección 6 de `10-entregables-etapa-3.md` |
| US-35 | Como docente quiero instalar y ejecutar el proyecto solo con la documentación | M | Consigna | Manual Técnico con pasos verificados en una máquina limpia |

## Orden sugerido dentro de una fase

1. Esquema y migración (`schema.prisma`) → 2. servicios y reglas con pruebas unitarias → 3. endpoints con pruebas de API → 4. pantalla y componentes → 5. escenario Cypress → 6. accesibilidad y responsive → 7. documentación.

## Cambio de plazos tras la reunión del 06/10

El cliente y el equipo acordaron una **nueva reunión en 2 o 3 semanas (≈ 20 al 27/10/2026)** para evaluar un MVP en código. Es **antes** del hito de la semana 13 que supone el cronograma de Gestión de Proyectos. Por eso las fases 0 a 3 (base, núcleo, avisos y moderación, horarios y calendario por archivos) deben quedar demostrables primero, con datos semilla; el resto sigue el orden del plan.

## Riesgos que el plan ya considera

El hito de la semana 13 tiene baja probabilidad de cumplirse en plazo (≈ 36 % según PERT, 86 % en la semana 14). **Si el tiempo falta, el recorte se hace de abajo hacia arriba:** primero Could, luego Should, y recién después se acuerda con el cliente mostrar un MVP con novedades, avisos, horarios, archivo y login. La prueba de concepto de Instagram va en la fase 1 para decidir temprano si se usa la API o la carga manual.
