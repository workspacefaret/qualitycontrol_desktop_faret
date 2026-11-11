# Fase 41 — Auditoría de impacto de QCC (Evaluación de Calidad por Operador) sobre fps-api (11-11-2026)

Solo auditoría y validación no invasiva. En producción: **únicamente lecturas pasivas del servidor y 2 consultas mínimas al endpoint (1 NP y 10 NP, volumen normal de uso)**. Pruebas de carga: 100 % sintéticas, contra un FPS simulado local, con el código real de QCC (`FpsSesionesApiService`, `FpsApiClient`, motor de atribución). Sin cambios, sin commit/push.

## Resultado: **APTO CON CONDICIONES**
Con el volumen real de hoy (354 PNC → 229 NP → 5 solicitudes, ≈2,8 MB y ≈0,7 s por carga) el impacto sobre FPS es bajo y está acotado. Pero hay riesgos **mitigables, solo del lado de QCC**, que conviene corregir antes de publicar 1.8.30, y hay **evidencia que falta** (costo SQL real e índices de FPS, métricas históricas del servidor) que impide declararlo APTO sin reservas.

## 1. Comportamiento de QCC (evidencia en código)
| Hecho | Evidencia |
|---|---|
| Abrir el módulo = 1 flujo completo: todas las páginas de Data (500/pág, secuencial) + todas las NP a FPS en lotes de 50 | `FaretEvaluacionOperadoresHandler.HandleResumen` (l.53-91), `FpsSesionesApiService.ObtenerAsync` |
| **Cada cambio de filtro (año, mes, máquina, área, turno, persona) o "Limpiar" repite el flujo completo** aunque los filtros solo se aplican después de traer todo | `controller.js` `_onChange` → `_cargar()`; el filtro entra recién en `FaretEvaluacionFpsResumen.Construir` |
| Sin caché (ni de Data ni de FPS) y sin deduplicación | no existe en handler/servicio; cada navegación al módulo recarga |
| Lotes **secuenciales** dentro de un flujo (no hay paralelismo interno); sin reintentos; un lote que falla aborta todo | `ObtenerAsync` (bucle `for` con `await`; `return` en error) |
| Timeout fijo de 20 s por solicitud | `FpsApiClient` (`HttpClient.Timeout`) |
| El frontend descarta respuestas viejas (`_seq`) pero **el backend no cancela**: un cambio de filtro mientras otro corre deja flujos superpuestos | `controller.js` `_cargar` vs. handler sin `CancellationToken` |
| Sin sondeo periódico (`setInterval`) ni reintentos automáticos | grep sin resultados |
| La carga crece linealmente con el nº de PNC/NP (1 solicitud por 50 NP) y el motor de atribución recorre todas las sesiones por PNC | prueba §4 |
| Solo el módulo Faret consume el endpoint | grep del repo |

## 2. Endpoint `sesiones-documentos` (inspección estática)
- 2 sentencias por solicitud (insert en variable tabla `@ordenes` desde `ZZZMasterOT` con `OR` sobre `NotaVentaFaret/NotaVentaInnpack`, y un join `ZZZProcesosProductivos`→`WorkOrderRecords` + 4 LEFT JOIN de catálogos). Consulta parametrizada (≤50 NP validadas, 400 si no; sin SQL dinámico).
- **Sin `LIMIT`/`TOP`** sobre sesiones; sin paginación: depende del tamaño de las órdenes. Real: ≈26 sesiones/NP, ≈470 B/sesión → 10 NP = 79 KB en **109 ms**; 1 NP = 3,4 KB en 332 ms (incluye conexión). Un lote de 50 NP ≈ 0,4 MB.
- Respuesta **sin compresión** (no hay `compression` en `server.js`): carga completa de hoy ≈2,8 MB; 5.000 PNC ≈36 MB.
- Pool `mssql` máx. 10 conexiones **compartido con los demás endpoints** (laboratorio, liberaciones, Trazabilidad/Talleres); sin `requestTimeout` explícito (por defecto 15 s, acota consultas lentas); sin limitador de tasa ni caché.
- **Índices de `FPS_PRODUCCION`: no verificables** (la herramienta de solo lectura disponible apunta a `FARET_PRODUCCION` y no ve `WorkOrderRecords`). El `OR` entre dos columnas puede degradar a barrido de `ZZZMasterOT` si no hay índices en ambas. **Sin evidencia.**

## 3. Línea base real (solo lectura, 11:20)
fps-api (PID 7676): 26 MB de RAM, 2 s de CPU acumulada en 27 min, 201 handles; servidor: **1 vCPU lógica**, 16 GB (11,2 libres), CPU del sistema 8–12 % (una muestra aislada de 625 es un artefacto de lectura); watchdog sano, 0 reinicios nuevos, `calidad-api` sana. **No existen métricas históricas** (el proceso lleva 27 min; fps-api no escribe logs; no se revisaron los logs de IIS/proxy). Falta: tiempos de respuesta por endpoint, solicitudes por hora, CPU/RAM de SQL Server.

## 4. Pruebas sintéticas (FPS simulado, 100 ms/solicitud salvo indicación)
| Escenario | Solicitudes a FPS | Datos | Tiempo | Observación |
|---|---|---|---|---|
| 100 PNC | 2 | 0,7 MB | 0,3 s | motor 56 ms |
| 354 PNC (hoy) | 5 | 2,5 MB | 0,7 s | motor 115 ms |
| 500 PNC | 7 | 3,6 MB | 0,9 s | |
| 1.000 PNC | 13 | 7,2 MB | 1,5 s | motor ≈130–180 ms |
| **5.000 PNC** | **65** | **35,7 MB (≈170 MB asignados)** | 7,7 s | **motor 10,1 s** (CPU del escritorio) |
| 3 / 6 cambios de filtro seguidos (354 PNC) | 15 / **30** | 7,6 / 15,2 MB | — | **6 simultáneas** en FPS: flujos superpuestos, sin límite |
| 5 usuarios × 1.000 PNC | 65 | 36 MB | 4,3 s | 5 simultáneas |
| 10 usuarios × 1.000 PNC | 130 | 72 MB | 4,5 s | 10 simultáneas = tamaño del pool de fps-api |
| 5 usuarios × 5.000 PNC | 325 | 179 MB | 21 s | |
| FPS responde 500 / 404 | **1** (de 65) | — | inmediato | sin reintentos masivos ✔ |
| FPS lento 25 s (> timeout) | **1** | — | corta a los 20 s ✔ | error claro, sin reintento |
| FPS lento 15 s/lote, 1.000 PNC | 13 secuenciales | — | **195 s** | el usuario espera todo; sin cancelación |

Lo bueno: sin paralelismo interno, sin reintentos, aborta al primer fallo, timeout acotado, sin sondeo. Límite de esta evidencia: es simulación; no mide costo SQL real ni comportamiento con el servidor real bajo carga.

## 5. Tabla de riesgos
| # | Riesgo | Evidencia | Gravedad | Solución propuesta (solo QCC salvo indicación) |
|---|---|---|---|---|
| R1 | Cada cambio de filtro vuelve a consultar Data y FPS completos (hoy 5 solicitudes, 2,8 MB, para algo que ya está en memoria) | `_cargar()` en cada `change`; prueba B: 6 cambios = 30 solicitudes | **Alta** | Filtrar en memoria: backend cachea el universo (Data+FPS+atribución) y aplica filtros sobre él; o devolver el resultado completo una vez y filtrar en el front |
| R2 | Flujos superpuestos sin cancelación (varios cambios rápidos = N flujos simultáneos) | Prueba B/C: max simultáneas = N | **Alta** | `CancellationToken` desde el puente + *single-flight* (si hay una carga en curso, reutilizarla) + *debounce* de 400–600 ms |
| R3 | Sin caché entre aperturas/usuarios | Handler sin caché; prueba C | Media | Caché en memoria con vencimiento (p. ej. 5–10 min) por lote de NP y botón "Actualizar" explícito |
| R4 | Varios usuarios simultáneos pueden llegar a 10 solicitudes en vuelo (= pool de fps-api) y compartir pool con otros módulos | Prueba C; `db.js` max 10 | Media | Límite de concurrencia global en QCC (semáforo 2); caché compartida; opcional en FPS: limitador de tasa |
| R5 | Crecimiento con el nº de PNC: 5.000 PNC = 65 solicitudes, 36 MB y 10 s de CPU en el motor (recorre todas las sesiones por PNC) | Prueba A | Media (hoy 354) | Indexar sesiones por OT antes de atribuir (diccionario OT→sesiones); tope de lotes/volumen con aviso; limitar el rango por año/mes antes de consultar FPS |
| R6 | FPS lento sin timeout total: 195 s de espera, sin forma de cancelar | Prueba F | Media | Timeout global de la operación (p. ej. 60 s), botón cancelar, progreso |
| R7 | Respuesta sin compresión | `server.js` sin `compression` | Baja | Activar gzip en fps-api (cambio de servidor, requiere autorización) o pedir `Accept-Encoding` si IIS ya comprime |
| R8 | Índices y costo SQL real de `ZZZMasterOT`/`WorkOrderRecords` desconocidos | no accesible | **Sin evidencia** | DBA: revisar plan de ejecución de una consulta de 50 NP (solo lectura) y confirmar índices en `NotaVentaFaret`, `NotaVentaInnpack`, `WorkOrderRecords.WorkOrderKey` |
| R9 | Sin métricas históricas de FPS | línea base §3 | Media | Instrumentación pasiva (autorización): log de acceso con tiempo de respuesta por ruta o contador por endpoint |
| R10 | Servidor con 1 vCPU: una ráfaga prolongada compartiría CPU con `calidad-api` y SQL local si aplica | §3 | Baja–Media | Mitigar con R1–R4; vigilar CPU en la primera semana |

## 6. Condiciones antes de publicar QCC 1.8.30
1. **Obligatorio:** R1 + R2 (filtrar en memoria o caché del universo, single-flight, cancelación, debounce). Es el único riesgo cuya carga se multiplica sin necesidad.
2. **Recomendado:** R3 (caché con vencimiento) y R6 (timeout global + cancelar).
3. **Antes de crecer de ~1.000 PNC:** R5 (índice OT→sesiones en el motor, tope de volumen).
4. **Sin bloquear la publicación pero pendientes:** R8 (índices) y R9 (métricas), más monitoreo manual de CPU/RAM de fps-api y del watchdog durante la primera semana de uso.

## 7. Estado
FPS sano (PID 7676, 1 listener, watchdog activo), `calidad-api` sana, `dump.pm2` y tareas sin cambios, QCC 1.8.30 sin publicar, `latest.json` intacto, sin commit/push. El mock y el arnés de carga quedaron solo en el scratchpad local.
