# Módulo `contact` — formulario de contacto (RF08, RNF08; Should)

Se monta en la raíz de la API porque expone `/public/contact` y `/contact-messages`.

| Método y ruta                            | Quién          | Qué hace                                                                       |
| ---------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `POST /public/contact`                   | público        | `{ name, email, subject, message, consent: true }` -> 201 `{ received: true }` |
| `GET /contact-messages?status=&q=&page=` | ADMIN, BEDELIA | Más nuevos primero.                                                            |
| `GET /contact-messages/:id`              | ADMIN, BEDELIA |                                                                                |
| `PATCH /contact-messages/:id`            | ADMIN, BEDELIA | `{ status: NEW \| READ \| ANSWERED }`                                          |
| `DELETE /contact-messages/:id`           | solo ADMIN     | 204 solo si está `ANSWERED` (409 si no).                                       |

## Reglas del envío público

1. **Consentimiento obligatorio** (Ley 25.326): sin `consent: true`, 400 con mensaje claro.
2. **Anti-spam:** campo señuelo `website` (si viene con texto, 201 sin guardar nada) y límite de 5 envíos por hora por IP (429), con `ctx.limiters.contact`.
3. **Se guarda SIEMPRE primero**; después se intenta el correo con `await req.ctx.getMailer()`. Si falla, no hay destino o se usa el proveedor de consola (demostración, sin SMTP real), el mensaje queda con `mailSent=false` y la respuesta es 201 igual (RNF03). `mailSent=true` solo indica que el proveedor SMTP aceptó la solicitud de envío (o que el doble `fake` la registró en pruebas); **no garantiza la entrega final al buzón**. El destino es el configurado en el panel/entorno (`contactTo`) y, si no hay, el ajuste `email_institutional`.
4. Privacidad: ni el correo ni el mensaje van a logs ni a la auditoría; el asunto se limpia de saltos de línea.

Nota: `contact:delete` es solo de ADMIN en la matriz `PERMISSIONS` (Q41, resuelta); BEDELIA recibe 403.

Probar: `pnpm --filter @ifts2/api exec vitest run test/api/contact.test.ts`
