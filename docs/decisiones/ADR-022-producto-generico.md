# ADR-022 · Producto genérico: nada institucional en el código

Estado: Cerrada.

## Decisión

El producto debe poder reutilizarse para otra institución. **No se escribe "IFTS N.° 2" ni ningún texto institucional en el código** de la API ni en componentes. Nombre, sigla, subtítulo, texto del pie, carrera, dirección, correos, teléfono, redes, frase ancla y hashtag viven en `SiteSetting` (claves en `SETTING_KEYS`, `packages/shared`) y `ContentSection`, y se leen desde ahí:

- Web: `lib/site.ts` -> `getSiteInfo()` lee `GET /public/settings` (objeto plano `{ clave: valor }`, cache 60 s) y los layouts (`PublicLayout`, `SiteHeader`, `SiteFooter`, `PanelShell`) reciben `SiteInfo` por props. Si la API no responde se usan valores **genéricos**, nunca del IFTS.
- Los valores del IFTS solo existen en la semilla (`prisma/seed-data.ts`, modos `prod` y `demo`).
- Claves agregadas para esto: `institution_name`, `institution_short`, `institution_subtitle`, `footer_text`, `career_name`.

Contrato pendiente del agente público: `GET /public/settings` debe devolver al menos esas claves.

## Excepciones aceptadas

Los textos de ayuda del panel y de la guía de Instagram son del producto, no de la institución. Los nombres de roles (`ROLE_LABELS`: "Rectoría / Dirección", "Bedelía Académica", "Comunicación") vienen del Figma y de ADR-18; si otra institución los necesita distintos, se pasan a configuración.
