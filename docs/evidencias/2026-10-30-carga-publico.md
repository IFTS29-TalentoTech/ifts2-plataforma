# Prueba de carga del sitio público — 2026-10-30

Herramienta: autocannon (Node). 400 usuarios virtuales concurrentes sin pausas, 20 s por escenario, contra el build de producción (`next start`) + API de producción en la misma máquina de desarrollo. Objetivo (RNF05/RNF09): sin errores 5xx y p95 < 1,5 s.

| Escenario | Pedidos | Req/s | p50 | p95 | p99 | Máx. | 5xx | Errores de conexión | Veredicto |
|---|---|---|---|---|---|---|---|---|---|
| Sitio público (Inicio + Estudiantes + Novedades) | 2241 | 112 | 2.41 s | 8.29 s | 8.75 s | 9.29 s | 0 | 0 | NO CUMPLE |
| Solo Inicio | 5405 | 270 | 1.30 s | 16.80 s | 18.07 s | 18.60 s | 0 | 3673 | NO CUMPLE |
| Solo Estudiantes | 7401 | 370 | 1.09 s | 12.45 s | 16.48 s | 18.27 s | 0 | 2096 | NO CUMPLE |
| Solo Novedades | 818 | 41 | 5.23 s | 17.16 s | 19.14 s | 19.15 s | 0 | 6166 | NO CUMPLE |
| API pública directa (home + students + publications) | 5673 | 284 | 1.28 s | 2.14 s | 2.40 s | 2.47 s | 0 | 0 | NO CUMPLE |

Códigos de estado por escenario: Sitio público (Inicio + Estudiantes + Novedades): {"200":2241} · Solo Inicio: {"200":5405} · Solo Estudiantes: {"200":7401} · Solo Novedades: {"200":818} · API pública directa (home + students + publications): {"200":5673}
