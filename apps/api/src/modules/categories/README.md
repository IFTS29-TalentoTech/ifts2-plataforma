# Módulo `categories`

Categorías de publicaciones (`PUBLICATION`), avisos (`NOTICE`) y galería (`GALLERY`). Montado en `/api/v1/categories`. Permiso `categories:manage` (ADMIN, BEDELIA y EDITOR).

| Método y ruta                           | Descripción                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /categories?kind=&page=&pageSize=` | Lista (hasta 100 por página) con `usageCount` (publicaciones + avisos que la usan).                           |
| `POST /categories`                      | `{ name, kind }` -> `201`. `409` si ya existe ese nombre en ese tipo (sin distinguir mayúsculas).             |
| `PATCH /categories/:id`                 | `{ name }`. El tipo no se cambia. `409` si el nombre ya existe.                                               |
| `DELETE /categories/:id`                | `204` solo si no la usa nadie; `409` con la cantidad de usos si está referenciada. Siempre manual y auditada. |

Auditoría: `category.create|update|delete`. Pruebas: `test/api/categories.test.ts`.
