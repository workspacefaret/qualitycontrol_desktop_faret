# Fase 43 — Validación final de QCC 1.8.30 sin afectar producción (11-11-2026)

Solo verificaciones locales y pruebas aisladas (Data y FPS **simulados** en 127.0.0.1). No se tocó fps-api, calidad-api, PM2, watchdog, tareas, servicios, SQL, Mejora Continua, `latest.json` ni otros proyectos. Sin instalador, sin commit/push, sin consultas a FPS real. Los simuladores quedaron detenidos.

## Veredicto: **APTO CON OBSERVACIONES** (no autoriza publicación ni despliegue)
Funcionalidad, caché y protección de FPS demostradas en simulación (22+41+40 pruebas, 194/194 unitarias). Observaciones: la ventana Photino real no fue observada (ver §3), el costo SQL real de FPS sigue sin medirse y faltan la revisión humana y la validación en entorno real.

## 1. Revisión técnica (10 puntos)
| # | Punto | Resultado |
|---|---|---|
| 1 | Caché en memoria 10 min | OK (un solo universo, nada en disco; `grep` sin `localStorage`/`File`/`Directory` en módulo y front) |
| 2 | Filtros locales | OK: se aplican en `FaretEvaluacionFpsResumen.Construir` sobre el universo cacheado; 0 solicitudes (§2) |
| 3 | Una sola carga activa | OK (single-flight; 20 llamadas simultáneas = 1 carga) |
| 4 | Cancelación y timeout global | OK (90 s configurable; Cancelar; la cancelación de QCC no detiene SQL ya iniciado en FPS) |
| 5 | Sin reintentos masivos | OK: error recordado 30 s (`ERROR_RECIENTE`), mínimo 15 s entre cargas |
| 6 | Invalidación usuario/permisos/sesión | OK tras **2 correcciones** (abajo) |
| 7 | Límite 1.500 NP | OK: 1.500 aceptado (30 lotes), 1.501 y 5.000 PNC rechazados con 0 solicitudes a FPS |
| 8 | Respuestas antiguas | OK: solo la carga vigente puede escribir en caché; front descarta por `_seq` |
| 9 | Sin almacenamiento sensible persistente | OK (solo memoria del proceso) |
| 10 | Reglas de atribución y seudonimización | Sin cambios; resultados idénticos al flujo anterior (nombres y seudónimos); UI VER muestra solo `OP-xxxxxx` y oculta el operador escrito |

**Defectos reales encontrados y corregidos localmente (sin tocar reglas de negocio)**, en `FaretUniversoCache.cs`:
1. *Fuga entre sesiones:* tras `Invalidar()` (cierre de sesión/401) con una carga en vuelo que no respondía a la cancelación, su resultado podía guardarse en caché y otra sesión con la misma clave podía unirse a esa carga. Ahora la carga se desvincula (`CancelarYSoltar`) y solo la carga vigente escribe.
2. *Carga huérfana por cambio de permiso:* con la caché vacía y una carga en vuelo, pedir con otro nivel de permiso (nombres/seudónimos) no cancelaba la primera, que seguía consultando FPS sin necesidad y devolvía OK. Ahora se cancela (estado `CANCELADO`, no `TIMEOUT`). La cancelación pasó a ser por carga (ya no una bandera compartida).
Carreras/fugas revisadas: sin fuga en 70 ciclos invalidar+recargar (delta de memoria retenida 0,0 MB); `CancellationTokenSource` se libera en cada carga; `destroy()` del front quita listeners y el temporizador.

## 2. Pruebas de rendimiento aisladas (FPS simulado, 100 ms/solicitud; solicitudes HTTP medidas en el simulador)
| NP (PNC) | Lotes FPS | Data | Carga | CPU QCC | Retenido | 10 filtros |
|---|---|---|---|---|---|---|
| 100 (155) | 2 | 1 | 0,5 s | 281 ms | 3 MB | **+0** / +0 |
| 354 (549) | 8 | 2 | 1,4 s | 734 ms | 4 MB | +0 / +0 |
| 500 (775) | 10 | 2 | 1,4 s | 531 ms | 7 MB | +0 / +0 |
| 1.000 (1.550) | 20 | 4 | 3,1 s | 1,3 s | 15 MB | +0 / +0 |
| 1.500 (2.325) | 30 | 5 | 4,9 s | 1,8 s | 22 MB (WS 143 MB) | +0 / +0 |
| 5.000 PNC | **0** | 10 págs. | rechazo `LIMITE_VOLUMEN` | — | — | — |

Otros (todos PASS): 6 llamadas simultáneas en frío = 5 lotes (antes 30); 5 aperturas repetidas = 0 solicitudes; cancelación durante la carga = 2 de 5 lotes enviados y la siguiente carga funciona; timeout 3 s → luego 0 solicitudes (ERROR_RECIENTE); HTTP 500/404 = 1 sola solicitud, sin reintentos; "Actualizar" ×3 dentro de 15 s = 0 solicitudes; vigencia vencida recarga; permisos distintos y cambio de sesión no comparten datos; 10 usuarios × (abrir+10 filtros) = 50 solicitudes (antes 550); **10 cargas simultáneas de 1.000 PNC en un mismo proceso (cota superior): CPU 11,3 s en total, WS 286 MB** (en la práctica cada equipo carga solo la suya: ≈1,3 s de CPU).
Resultados: arnés caché 22/22 + 41/41 (Fase 42) en simulador; coherentes con Fase 42.

## 3. Interfaz
**Límite honesto:** la ventana **Photino real no se observó** (no hay puerto de depuración abierto y no se debe interactuar con el equipo del usuario). Se ejecutó el **front real (vista + controlador, CSS real) en Edge headless propio** contra el **handler real con caché** y Data/FPS simulados. Esto valida DOM, lógica, textos y capturas, **no** el aspecto exacto dentro de WebView2/Photino ni el router/permisos reales (el nivel EDITAR/VER se simuló con un parámetro).
Resultado: **40/40 PASS**, sin errores JS. Verificado: indicador de carga con Cancelar; contenido oculto durante la carga; antigüedad de caché; filtros y "Limpiar" sin solicitudes a FPS (6 cambios rápidos = 1 llamada al backend); "Actualizar datos" dentro de 15 s se sirve de caché; Cancelar con datos ya mostrados conserva los datos ("Carga cancelada. Los datos mostrados antes no se modificaron.", 2 de 5 lotes enviados); detalle de operador, evidencia ("responsabilidad pendiente de Calidad"), pestañas y chips de estado; VER = `OP-xxxxxx` + aviso de privacidad, EDITAR = nombres; cambio EDITAR→VER sin invalidar carga por separado; mensajes de Timeout (y aviso "no volverá a consultar FPS por 30 s" al reabrir), FPS no disponible (500), Infraestructura pendiente (404), Volumen excedido (5.000 PNC, 0 solicitudes); `destroy()` sin listeners colgados; reabrir el módulo usa caché; tras invalidar recarga. Capturas (en scratchpad de la sesión, no persisten): `01_cargando`…`11_volumen_excedido`. Una captura revisada (`02_cargado`) muestra el módulo bien maquetado.

## 4. Regresión multiempresa
194/194 pruebas unitarias; compilación Release correcta (carpeta temporal). Solo se tocaron `FaretApiClient.GetAsync`, `FaretImportacionApiService.GetPncListAsync`, `FpsApiClient`/`FpsSesionesApiService` (parámetro `CancellationToken` **opcional**; llamadores existentes compilan sin cambios), `PermisosService` (acción `...cancelar` como lectura), `Program.cs` (invalidar caché al cambiar token). INNPACK (`EvaluacionOperadoresHandler`) sin cambios. **No ejercitado** (requiere la app y credenciales, no autorizado): login FARET/INNPACK, selector de empresa, resto de módulos, cierre de sesión — revisar a mano (§8).

## 5. Inventario del candidato 1.8.30 (archivos de Fases 41–43 a integrar; nada se empaquetó)
Evaluación por Operador: `src/Backend/Modules/EvaluacionOperadores/**` (incl. `FaretUniversoCache.cs` nuevo), `src/Backend/Services/FpsApi/FpsSesionesApiService.cs` (nuevo) y `FpsApiClient.cs`, `FaretApiClient.cs`, `FaretImportacionApiService.cs`, `Program.cs`, `PermisosService.cs`, `MessageRouter.cs`, `src/UI/www/modules/faret-evaluacion-operadores/**`, `evaluacion-operadores/**`, `shared/evaluacion-operadores-base.js`, `index.html`, `novedades.js`, `QualityControlCenter.csproj`, `installers/QualityControlCenter.iss`.
**Posibles cambios ajenos en el árbol (revisar antes de empaquetar, no pertenecen a este módulo):** `FaretHandler.cs`, `FaretDashboardDto.cs`, `FaretDashboardService.cs`, `faret-nc.controller.js`, `faret/faret.controller.js`/`.view.html`; archivos sin seguimiento (`.claude/`, `CLAUDE.md.backup-*`, imágenes en `docs/`, `tools/**`) no deben incluirse. Estado `git status`: 17 modificados, varios sin seguimiento; **el instalador candidato anterior no incluye los cambios de Fases 42–43: hay que regenerarlo.**

## 6. Riesgos de FPS pendientes (separados)
1. **Costo SQL real no verificado** (índices de `ZZZMasterOT`/`WorkOrderRecords`, plan de ejecución). Evidencia segura: que un DBA revise el plan de una consulta de 50 NP en solo lectura.
2. **Cancelar no detiene SQL ya iniciado** en FPS; solo lo acota el `requestTimeout` de 15 s de `mssql` (no verificado en producción).
3. **Concurrencia entre equipos:** cada QCC tiene su propia caché; N usuarios = N cargas (≈5 lotes c/u hoy). Sin límite global ni caché compartida (requiere cambios en fps-api).
4. **Sin métricas históricas** de fps-api (sin logs/tiempos por ruta). Evidencia segura: instrumentación pasiva autorizada (contador/tiempos) y observar CPU/RAM de fps-api y el watchdog la primera semana.
5. **Indisponibilidad de FPS:** QCC informa el motivo, no atribuye ni muestra cifras por operador y no reintenta (30 s de espera). Probado con 500/404/timeout simulados; no con caída real.
6. Sin gzip ni limitador de tasa en fps-api (dependencia, no tocada); motor de atribución O(PNC×sesiones) (tope 1.500 NP lo acota; 1.500 NP ≈ 1,8 s de CPU).
**Cómo obtener más evidencia sin riesgo:** piloto con 1 usuario en horario valle observando solicitudes y CPU de fps-api (watchdog activo); revisión de plan SQL por DBA en solo lectura; métricas pasivas; nunca pruebas de carga contra FPS real.

## 7. Problemas encontrados
Los dos defectos de caché del §1 (corregidos y cubiertos por pruebas D y C del arnés). Sin otros hallazgos. Arneses guardados en `tools/fps_api_estabilizacion/fase43_pruebas/` (`Program.cs`+`carga3.csproj` para la caché; `ui/` para la interfaz; requieren `mock_fps.js` de `fase42_pruebas_cache/` y `plantilla.json`, que no está en el repo por contener datos anonimizados de sesión).

## 8. Checklist para la validación humana (ventana Photino real)
- [ ] Login FARET y INNPACK, selector de empresa, cierre de sesión y relogin con otro usuario (la caché debe vaciarse).
- [ ] Abrir "Evaluación de Calidad por Operador": indicador de carga, botón Cancelar, luego datos y leyenda de antigüedad.
- [ ] Cambiar filtros y pulsar Limpiar: respuesta inmediata, sin recargar FPS.
- [ ] "Actualizar datos" (con espera mínima de 15 s) y Cancelar durante la actualización: los datos previos se conservan.
- [ ] Usuario con permiso de solo vista: seudónimos `OP-xxxxxx` y aviso; con edición: nombres.
- [ ] Detalle de operador, evidencia, pestañas y textos "pendiente de Calidad".
- [ ] Navegar a otros módulos FARET/INNPACK y volver; sin errores.
- [ ] Observar fps-api (CPU/solicitudes) durante la prueba con el watchdog activo.

## 9. Recomendación sobre el instalador
Generar **candidato** 1.8.30 (sin publicar) incluyendo la corrección de caché de esta fase, con `dotnet publish QualityControlCenter.csproj` explícito, subida de versión en las 3 propiedades del `.csproj`, `.iss` y sidebar, tras limpiar/separar los cambios ajenos del §5. Después, checklist humano del §8, piloto en entorno real y autorización explícita antes de publicar.
