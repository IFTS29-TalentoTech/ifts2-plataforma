# Histórico de publicaciones programadas (A05)

Fecha local: 2026-11-06 (Buenos Aires). Base: `fd67a8786d16b8f995c1744a92d2a5972e3b6fd3`, verificada como ancestro de `origin/main`. Rama: `fix/historico-publicaciones`.

## Causa y corrección

`isPublicationVisible` permite mostrar una publicación `SCHEDULED` al llegar `visibleFrom` sin cambiar su estado. Al vencer, `expiredPublicationWhere` exigía `PUBLISHED`, por lo que esa publicación desaparecía del histórico y del detalle archivado. La consulta de años también exigía `PUBLISHED`.

El histórico conserva `PUBLISHED` y agrega `SCHEDULED` cuando `visibleFrom < visibleUntil <= ahora`. La comparación entre campos se ejecuta en PostgreSQL mediante referencias de campos de Prisma: excluye inicios nulos y ventanas vacías o invertidas, sin filtrar después de paginar. La consulta de años agrega programadas con inicio alcanzado y ventana válida, vigentes o vencidas. Se conserva el cálculo del año en Buenos Aires y el comportamiento previo de los años de `PUBLISHED`.

No se modifican estados, reglas de `shared`, portada, contratos, componentes, migraciones ni dependencias.

## Aislamiento de datos (A04)

La instancia local existente tenía bases sin marca A04 y no se utilizó para las pruebas. Se creó el contenedor temporal `ifts2-a05-test-db`, PostgreSQL 17 con `--network none`, sin puertos publicados ni volumen de datos compartido. Su única base de aplicación fue `ifts2_test`, en el puerto interno 5433, autorizada con el comentario `ifts2:disposable-test-database`.

Las pruebas se ejecutaron dentro del contenedor usando explícitamente `TEST_DATABASE_URL=postgresql://ifts2:ifts2@localhost:5433/ifts2_test`. Los helpers de A04 verificaron nombre y marca antes de migrar y antes de cada limpieza. No se modificaron ni eliminaron datos de desarrollo o producción.

## Resultados

| Verificación | Resultado |
| --- | --- |
| Regresión antes de corregir, `vitest run --project integration test/api/public.test.ts -t A05` | 3 fallos y 1 éxito: reproduce pérdida del histórico, transición al vencer y filtros/paginación |
| Módulo público, incluido en la corrida completa | 37/37 pruebas correctas |
| `pnpm lint` | Correcto |
| `pnpm typecheck` | Correcto |
| `pnpm test` (contenedor aislado) | 43/43 compartidas y 503/503 API: 211 unitarias y 292 de integración |
| `pnpm build` | API y web compiladas correctamente |

Durante el build no se levantó una API de aplicación: la web generó sus páginas con su alternativa prevista ante falta de conexión. La integración pública sí se verificó con Express y PostgreSQL reales mediante Supertest.

## Cobertura nueva

Cinco casos de integración en `apps/api/test/api/public.test.ts`, con reloj `Date` controlado:

- Matriz de publicaciones publicadas y programadas, vigentes, vencidas y futuras; exclusión de borradores, pausadas y programadas sin inicio o con ventanas inválidas. Detalles vigentes/archivados, total, ausencia de duplicados, portada y correspondencia con `isPublicationVisible`.
- Transiciones para `PUBLISHED` y `SCHEDULED`: un milisegundo antes de `visibleFrom`, exactamente al inicio, un milisegundo antes del fin y exactamente en `visibleUntil`. Se comprueba que los estados permanecen iguales.
- Preservación del origen y enlace de Instagram en el histórico y su detalle.
- Años disponibles para programadas elegibles, exclusión de años futuros y estados no públicos, sección NEWS/BOTH, filtros por año y categoría, medianoche exacta de Buenos Aires, alternativa `createdAt`, orden estable con fechas iguales y páginas de tamaños 2, 1 y 0 sin duplicados.

GitHub Actions se comprueba sobre el commit entregado; el resultado y el enlace de ejecución se informan en el PR.
