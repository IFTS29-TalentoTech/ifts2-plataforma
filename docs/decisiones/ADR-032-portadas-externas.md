# ADR-032 — Portadas externas y firmadas (A06)

Fecha: 2026-11-06. Estado: aceptada para revisión.

## Problema

Las publicaciones manuales pueden guardar URLs externas; las copias de Instagram guardan
claves que la API convierte en URLs firmadas. `Cover` intentaba optimizar cualquier URL no
local, mientras `remotePatterns` solo admitía `API_ORIGIN`. S3 y dominios manuales podían
provocar errores de renderizado. Tampoco había fallback ante errores de carga.

## Decisión

Optimizar únicamente rutas propias y URLs del origen exacto de la API sin parámetros.
Conservar la excepción local de desarrollo. Cargar las demás URLs directamente mediante
`next/image` con `unoptimized`, incluyendo todas las firmadas. Restringir `remotePatterns`
al origen de la API con `search: ''`: el servidor Next.js no descarga dominios arbitrarios
ni procesa firmas por el optimizador.

Un componente cliente pequeño (`CoverImage`) reemplaza las imágenes fallidas por un bloque
neutro con nombre accesible; las páginas, tarjetas y selección de política permanecen en el
servidor. Se conservan las dimensiones, la carga diferida, la prioridad del detalle y las
clases responsive. No cambia la resolución de claves, la firma ni la descarga segura A01.

## Consecuencias

Las imágenes externas y firmadas no tienen conversiones ni variantes del optimizador de
Next.js. Dependen de la disponibilidad y las restricciones del proveedor. Las firmas pueden
expirar con la página abierta o bajo caché; se muestra el fallback sin renovación automática.
Los proveedores S3 compatibles se cubren con URLs simuladas, sin cuentas reales.

La suite `pnpm test:covers` usa la web compilada y una API simulada sin base de datos; verifica
las tres páginas públicas, errores, responsive y accesibilidad. Las pruebas de API se ejecutan
exclusivamente con las verificaciones de destino descartable de A04.
