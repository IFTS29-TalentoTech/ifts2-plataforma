# Prueba de carga del sitio público — 2026-10-30

Herramienta: autocannon (Node). 400 usuarios virtuales concurrentes sin pausas, 30 s por escenario, contra el build de producción (`next start`) + API de producción en la misma máquina de desarrollo. Objetivo (RNF05/RNF09): sin errores 5xx y p95 < 1,5 s en el perfil de **uso real**; los escenarios de **saturación** (sin pausa entre pedidos) son de estrés y no un uso humano.

| Escenario | Pedidos | Req/s | p50 | p95 | p99 | Máx. | 5xx | Errores de conexión | Veredicto |
|---|---|---|---|---|---|---|---|---|---|
| USO REAL: Inicio + Estudiantes + Novedades (1 pedido cada 3 s por usuario) | 3995 | 133 | 334 ms | 525 ms | 712 ms | 714 ms | 0 | 0 | CUMPLE |
| USO REAL: API pública directa (1 pedido cada 3 s por usuario) | 3993 | 133 | 291 ms | 521 ms | 713 ms | 733 ms | 0 | 0 | CUMPLE |
| SATURACIÓN: Inicio + Estudiantes + Novedades | 9613 | 320 | 1.18 s | 1.41 s | 1.64 s | 2.16 s | 0 | 0 | CUMPLE |
| SATURACIÓN: solo Inicio | 10390 | 346 | 1.16 s | 11.23 s | 11.38 s | 13.38 s | 0 | 680 | NO CUMPLE |
| SATURACIÓN: solo Estudiantes | 10859 | 362 | 1.10 s | 11.57 s | 12.29 s | 13.71 s | 0 | 1066 | NO CUMPLE |
| SATURACIÓN: solo Novedades | 10916 | 364 | 1.10 s | 14.38 s | 16.45 s | 17.45 s | 0 | 1072 | NO CUMPLE |
| SATURACIÓN: API pública directa | 8434 | 281 | 1.33 s | 2.06 s | 2.31 s | 2.37 s | 0 | 0 | NO CUMPLE |

Códigos de estado por escenario: USO REAL: Inicio + Estudiantes + Novedades (1 pedido cada 3 s por usuario): {"200":3995} · USO REAL: API pública directa (1 pedido cada 3 s por usuario): {"200":3993} · SATURACIÓN: Inicio + Estudiantes + Novedades: {"200":9613} · SATURACIÓN: solo Inicio: {"200":10390} · SATURACIÓN: solo Estudiantes: {"200":10859} · SATURACIÓN: solo Novedades: {"200":10916} · SATURACIÓN: API pública directa: {"200":8434}

## Cómo leer estos números

- **Uso real** (400 usuarios, un pedido cada 3 s por usuario, ~133 pedidos/s) es el perfil que evalúa RNF09. La base, la API y la web corren en la misma PC de desarrollo junto con el generador de carga.
- **Saturación** (400 usuarios insistiendo sin pausa) es una prueba de estrés: muestra el techo de un único proceso de Node (~300-360 pedidos/s para Inicio, Estudiantes o Novedades). Los escenarios de una sola página arrojan reinicios de conexión y colas largas (p95 de varios segundos) al pasar ese techo; no hubo ningún 5xx. En producción el techo se sube con la caché de la plataforma de hosting/CDN (las páginas ya responden `s-maxage=60`) o con más de un proceso web.
- Mejoras aplicadas a partir de la primera medición (`2026-10-30-carga-publico-antes-de-mejoras.txt`: Novedades se renderizaba por pedido y limitaba todo a ~40 pedidos/s): `/novedades` sin filtros pasó a ser estática con ISR; el resto del sitio ya lo era.
