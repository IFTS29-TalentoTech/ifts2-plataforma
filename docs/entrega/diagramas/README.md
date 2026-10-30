# Diagramas del modelo de datos

Los archivos `der-*.mmd` (Mermaid `erDiagram`) se **generan** desde `prisma/schema.prisma`:

```bash
pnpm docs:der        # node scripts/docs/prisma-to-docs.mjs
```

Para dibujar las imágenes (`.png` y `.svg`) se usó `@mermaid-js/mermaid-cli`. En Windows, sin descargar el Chromium de Puppeteer:

```bash
# una sola vez, en una carpeta temporal fuera del repo
PUPPETEER_SKIP_DOWNLOAD=1 npm i @mermaid-js/mermaid-cli
# puppeteer.config.json:  {"executablePath":"C:/Program Files/Google/Chrome/Application/chrome.exe","args":["--no-sandbox"]}
mmdc -i der-academico.mmd -o der-academico.png -p puppeteer.config.json -s 2 -b white
mmdc -i der-academico.mmd -o der-academico.svg -p puppeteer.config.json -b white
```

| Archivo                        | Contenido                                                   |
| ------------------------------ | ----------------------------------------------------------- |
| `der-completo`                 | Vista general: claves y relaciones (sin tablas aisladas)    |
| `der-acceso-y-auditoria`       | User, Session, AuditLog                                     |
| `der-publicaciones-y-redes`    | Category, SocialPost, Publication, InstagramToken, IntegrationConfig |
| `der-academico`                | Notice, Document, AcademicTerm, Schedule, ExamCall, Category |
| `der-sitio`                    | SiteSetting, ContentSection, ExternalLink, ContactMessage   |
