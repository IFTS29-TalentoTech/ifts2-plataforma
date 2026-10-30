# Flujos H1 a H8 y seguridad básica — 2026-10-30

Generado por `pnpm verify` (`scripts/verify-flows.mjs`) contra el build de producción de API + web, con la semilla demo. Cada fila es una comprobación contra el sistema real; lo creado se elimina al final.

Resultado: **33 de 33 comprobaciones en verde**.

| | Comprobación | Detalle |
|---|---|---|
| OK | Sin sesión, el panel responde 401 en todas las rutas probadas | /dashboard:401 /notices:401 /publications:401 /social/posts:401 /users:401 /audit:401 /settings:401 /integrations/instagram:401 /integrations/mail:401 /contact-messages:401 /documents:401 /terms:401 /schedules:401 /exam-calls:401 /links:401 /content/carrera:401 /categories:401 |
| OK | GET /health solo expone estado y proveedor activo (sin secretos) | {"storage":"local","mailer":"console","instagram":"fake"} |
| OK | Cabeceras de seguridad de la API (helmet) | csp=true hsts=max-age=31536000; includeSubDomains |
| OK | Cabeceras de seguridad de la web | x-frame-options=SAMEORIGIN csp=true |
| OK | Cookie de sesión HttpOnly + SameSite=Lax | ifts2_session=•••; Max-Age=28800; Path=/; Expires=Fri, 30 Oct 2026 18:01:44 GMT; HttpOnly; |
| OK | Los secretos guardados no vuelven en ninguna respuesta ni en la auditoría | PUT instagram=200 PUT mail=200 |
| OK | Los secretos y las claves de inicio de sesión no aparecen en los logs de la API | 4861 bytes de log revisados |
| OK | H1 · la publicación entra al panel como PENDIENTE |  |
| OK | H1 · nada llega al sitio sin aprobación humana |  |
| OK | H2 · aprobar con consentimiento crea la publicación | status 201 |
| OK | H2 · aparece en /novedades al instante (revalidación bajo demanda) |  |
| OK | H2 · aparece en el Inicio |  |
| OK | H3 · descartar y restaurar una publicación |  |
| OK | H3 · eliminar una descartada (manual, auditado) |  |
| OK | H2 · pausada deja de verse en el sitio |  |
| OK | H2 · limpieza (eliminar es manual) |  |
| OK | H4 · crear aviso con vencimiento |  |
| OK | H4 · se ve en /estudiantes al instante |  |
| OK | H4 · pausado desaparece del sitio |  |
| OK | H4 · eliminar un aviso pausado |  |
| OK | H5 · crear llamado a examen | status 201 |
| OK | H5 · publicado se ve en /estudiantes |  |
| OK | H5 · despublicar y eliminar el llamado |  |
| OK | H6 · cambiar el ciclo público (solo ADMIN) y el sitio lo refleja al instante | 2026 · 2.º cuatrimestre -> 2026 · 1.º cuatrimestre |
| OK | H6 · BEDELIA no puede cambiar el ciclo público |  |
| OK | H6 · se restaura el ciclo original |  |
| OK | H7 · /estudiantes concentra ciclo, avisos y accesos |  |
| OK | H8 · La carrera muestra el plan real (sin marcadores provisorios) |  |
| OK | H8 · Ingreso muestra requisito real y marca lo que falta como [a confirmar] |  |
| OK | H11 · el formulario de contacto recibe el mensaje |  |
| OK | H11 · Bedelía lo ve en la bandeja |  |
| OK | Q41 · Bedelía NO puede eliminar mensajes de contacto (403) |  |
| OK | Q41 · ADMIN elimina un mensaje respondido |  |
