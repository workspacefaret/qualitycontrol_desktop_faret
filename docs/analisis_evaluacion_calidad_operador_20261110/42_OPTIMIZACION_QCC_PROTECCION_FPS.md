# Fase 42 — Optimización de QCC y protección de FPS (11-11-2026)

Solo cambios locales en QCC Desktop y pruebas aisladas (FPS y Data **simulados** en `127.0.0.1:39500`). No se tocó fps-api, calidad-api, PM2, watchdog, servicios, Windows, SQL ni Mejora Continua. Sin commit/push, sin instalador, sin 1.8.30, `latest.json` intacto. Ninguna prueba de carga en producción.

## Resultado: **APTO CON OBSERVACIONES**
R1 y R2 quedan corregidos y demostrados (41/41 escenarios, 194/194 pruebas previas). La evidencia es **simulada**: no demuestra el costo real en FPS (índices/SQL), ni se puede probar que una consulta ya iniciada en FPS se detenga. No es autorización de publicación.

## 1. Riesgos corregidos
| Riesgo (Fase 41) | Corrección | Estado |
|---|---|---|
| R1 cada filtro/"Limpiar"/navegación repetía Data+FPS | Universo (Data+FPS+atribución) cacheado en memoria; los filtros se aplican localmente sobre él | **Corregido** |
| R2 flujos superpuestos sin cancelación | Una sola carga activa (single-flight), debounce 300 ms en el front, `CancellationToken` de punta a punta, botón Cancelar, descarte de respuestas viejas | **Corregido** |
| R3 sin caché | Vigencia 10 min, invalidación manual ("Actualizar datos", mínimo 15 s entre cargas), invalidación por cambio/cierre de sesión (`TokenChanged`) | Corregido (por instancia) |
| R6 sin timeout global | 90 s globales por carga + Cancelar + mensajes de estado | Corregido |
| R5 volumen | Tope `MaxNpPorCarga = 1500`: sobre el tope se rechaza (`LIMITE_VOLUMEN`) sin consultar FPS (nunca datos parciales) | Mitigado (no se optimizó el motor O(PNC×sesiones)) |
| R4/R7/R8/R9/R10 | Requieren cambios en fps-api/DBA/monitoreo | **Dependencias documentadas, no ejecutadas** |

Criterio de atribución, puntos y responsabilidad humana ("pendiente de Calidad") **no se modificaron**: resultados idénticos al flujo anterior en ambos niveles de permiso (escenario 5).

## 2. Diseño de la caché
- `FaretUniversoCache` (singleton en memoria, nada en disco). Clave = nivel de permiso (nombres vs. seudónimos): otro permiso nunca recibe datos del otro; se invalida al cambiar/cerrar sesión o 401.
- Errores no se reintentan solos: se recuerdan 30 s (`ERROR_RECIENTE`) y se devuelven tal cual. Una cancelación no se cachea. Nunca se sirve un dato vencido en silencio (al vencer se recarga; el front muestra edad y origen).
- **Límite honesto de la cancelación:** cancelar corta las solicitudes HTTP de QCC y la espera, pero **no detiene el SQL que FPS ya empezó** (solo lo acota el `requestTimeout` de 15 s de `mssql`, no verificado en producción). No se afirma cancelación del lado servidor.
- La caché es **por instancia de QCC**: varios usuarios no comparten datos (decisión de privacidad/permisos). La deduplicación entre equipos solo sería posible con cambios en fps-api (no hecho).

## 3. Archivos locales modificados / nuevos
`FaretApiClient.cs`, `FaretImportacionApiService.cs`, `FpsApiClient.cs`, `FpsSesionesApiService.cs` (CancellationToken opcional, compatibles), `FaretEvaluacionOperadoresHandler.cs`, **nuevo** `FaretUniversoCache.cs`, `Program.cs` (invalidar en `TokenChanged`), `PermisosService.cs` (`...cancelar` como lectura), `faret-evaluacion-operadores.controller.js/.view.html`. INNPACK (`EvaluacionOperadoresHandler`) sin cambios. Arnés: `tools/fps_api_estabilizacion/fase42_pruebas_cache/` (`Program.cs`, `carga2.csproj`, `mock_fps.js`).

## 4. Solicitudes a FPS antes / después (carga inicial + 10 cambios de filtro)
| PNC | Antes (FPS+Data) | Ahora | Carga inicial | 10 filtros extra |
|---|---|---|---|---|
| 100 | 33 | 3 | 0,7 MB, 490 ms | 0 / 86 ms |
| 354 (hoy) | 66 | 6 | 2,5 MB, 816 ms | 0 / 190 ms |
| 500 | 88 | 8 | 3,6 MB, 1,2 s | 0 / 220 ms |
| 1.000 | 165 | 15 | 7,1 MB, 1,8 s | 0 / 218 ms |
| 2.300 | 385 | 35 | 16,4 MB, 4,5 s | 0 / 563 ms |

→ **−91 %** de solicitudes (11 → 1 carga). Otros: 6 cambios simultáneos en frío 30 → **5** FPS (1 Data); 5 aperturas repetidas: 0; 10 usuarios × (abrir + 10 filtros): 550 → **50** (cada usuario 5; simultáneas máx. 10 = una por equipo, inevitable sin servidor compartido).

## 5. Pruebas (41 PASS / 0 FAIL, FPS simulado)
1 filtros (5 tamaños) · 2 5.000 PNC → `LIMITE_VOLUMEN`, **0** solicitudes a FPS · 3 6 cambios simultáneos = 1 carga real · 4 navegación repetida 0 extra · 5 resultados idénticos al flujo anterior (nombres/seudónimos) · 6 FPS lento: TIMEOUT a 3 s (configurado), 2 solicitudes, luego 0 (ERROR_RECIENTE) · 7 cancelación: 2 de 5 lotes enviados, sin caché, la siguiente carga funciona · 8 HTTP 500/404: 1 sola solicitud tras 6 filtros + 2 "Actualizar" · 9 "Actualizar" ×3 = 0 extra; tras 16 s recarga; vencida la vigencia recarga · 10 permisos/sesión sin compartir · 11 usuarios simultáneos · 12 memoria retenida a 2.300 PNC ≈ **84 MB** (<150 MB). Se verificó conteo de solicitudes, tiempos y memoria, no solo ausencia de errores. Regresión: 194/194 pruebas unitarias de Evaluación por Operador; compilación Release correcta (carpeta temporal, `bin\Release` intacto); sintaxis JS correcta; las firmas cambiadas solo añaden parámetros opcionales (otros llamadores compilan sin cambios).

## 6. Riesgos pendientes
1. **Sin evidencia real:** costo SQL/índices de FPS (R8) y comportamiento con el servidor real; solo simulación.
2. Cancelación no detiene la consulta ya iniciada en FPS (límite del `requestTimeout` no verificado).
3. Sin compresión gzip/limitador de tasa/métricas en fps-api (R4, R7, R9): dependen de cambios en fps-api — **no hechos**.
4. Motor de atribución O(PNC×sesiones) (R5): con tope 1.500 NP no se optimizó; sobre ese tope el módulo avisa y no calcula.
5. No se probó visualmente la UI actualizada en la ventana Photino (solo sintaxis y arnés del backend).
6. Memoria ≈84 MB retenidos con 2.300 PNC por equipo.

## 7. Recomendación para la siguiente fase
Revisión visual humana del front (Actualizar/Cancelar/estados), regenerar instalador 1.8.30 con estos cambios (el candidato actual **no los incluye**), validación en entorno real con 1 usuario (observando solicitudes y CPU de fps-api con el watchdog activo) y decisión sobre las dependencias de fps-api (índices, gzip, métricas). Después, autorización explícita de publicación.
