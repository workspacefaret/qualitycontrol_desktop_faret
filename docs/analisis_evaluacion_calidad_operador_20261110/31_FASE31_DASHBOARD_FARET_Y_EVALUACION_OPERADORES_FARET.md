# 31 — Fase 31: dashboard FARET, Evaluación por Operador FARET e integraciones (11-11-2026)

Estado: **implementado y probado en local; sin commit, sin push, sin publicar.** Base: Photino 1.8.29 publicada.

## 0. Resumen

| Objetivo | Resultado |
|---|---|
| Dashboard FARET (354 abiertas / 3 críticas) | Causa raíz confirmada con datos reales. Corregido en el desktop (sin cambios de API). |
| Evaluación por Operador FARET | Módulo `faret-evaluacion-operadores` implementado con el mismo motor INNPACK y datos de Data Faret por API. |
| Integraciones | Las APIs públicas entregan datos del día. Encontrado un bug real en la API Mejora Continua (`fecha_creacion` NULL): corregido en el código, **sin desplegar**. |
| Pruebas | 155/155 (C#, antes 117) · `dotnet build` Release 0 errores · prueba visual por CDP en la ventana Photino real, sin errores JS. |
| Bloqueo | No hay una credencial de lectura válida para la API `qualitycontrol` (AdminTI da 401 desde el 22-10). Sin ella no se pudo contrastar el dashboard ni la evaluación con los registros reales de Data. |

## 1. Dashboard FARET — diagnóstico con evidencia

Fuente: `GET https://api.faret.cl/mejora-continua/api/no-conformidades` (API pública de solo lectura), 11-11-2026, 200 OK, 204 KB.

| Dato | Valor real |
|---|---|
| NC devueltas | **354**, todas `sistemaOrigen = DATA_FARET`, sin `origenId` duplicados |
| `estado` (columna legacy) | 354 × `ABIERTA` |
| `estadoGestion` (estado real de la gestión) | 354 × `CERRADA` |
| `severidad` | MEDIA 332 · BAJA 19 · **ALTA 3** |
| `proceso` (= Tipo PNC) | Cuarentena 182 · Rechazo 99 · Reclamo 48 · Rechazo Cliente 25 |
| Las 3 ALTA | NC-2026-128 (Cuarentena, Data 1027), NC-2026-126 (Cuarentena, Data 1025), NC-2026-124 (Reclamo, Data 1023). Las tres con `estadoGestion = CERRADA`. Ninguna es un rechazo de cliente. |
| Cerradas con `fechaCierre`/`cerradoPor` | 58 (55 en jul, 3 en sep). Las otras 296 se cerraron desde *Gestionar* (cambio de estado sin pasar por *Cerrar*). |
| NC sin `fecha_creacion` | **67** (ids 338–405, detectadas entre 01-09 y 06-11-2026). La API las devuelve como `0001-01-01`. |

**Origen de los 354:** el Inicio contaba `NcAbiertas = NC con estado ≠ CERRADA` sobre la **columna legacy `estado`**, que la API fija en `ABIERTA` al crear y nunca actualiza. Por eso todas las NC salían como abiertas.
**Origen de las 3 críticas:** las 3 NC con severidad ALTA, contadas con la misma columna legacy. En la gestión real están cerradas.

**Causas raíz:**
1. Se usaba `estado` (legacy) en vez de `estado_gestion`. El parche que había quedado fuera de la 1.8.29 corregía solo esto.
2. El Inicio no consideraba las PNC de Data **sin gestión iniciada**, que el módulo No Conformidades sí muestra como "Sin gestión". Una PNC crítica sin gestión no aparecía en ningún indicador del Inicio.
3. Bug de la API Mejora Continua tras el port a SQL Server (02-09): el `INSERT` no informa `fecha_creacion` y la columna quedó sin `DEFAULT`. "NC registradas hoy", la tendencia de 30 días y "Últimas NC" ignoraban las 67 NC posteriores al cambio.

**Lo que dice la usuaria:** con los datos de Mejora Continua hay 0 NC críticas abiertas en gestión. Su "1 rechazo de cliente crítico abierto" solo puede ser una PNC de Data **sin gestión** (u otra vista filtrada). No se puede confirmar sin leer Data (ver bloqueo). No se ajustó ningún número para que coincida.

### Definición aplicada (consistente con el módulo No Conformidades)
- **NC abierta (en gestión):** NC de Mejora Continua con `estadoGestion ≠ CERRADA`, excluidas las vinculadas a registros eliminados de Data.
- **PNC sin gestión:** registro activo de Data (la API ya excluye los eliminados) sin NC vinculada (`sistemaOrigen=DATA_FARET`, `origenId=id`).
- **Sin cerrar (tarjeta del Inicio):** NC abiertas + PNC sin gestión.
- **Crítica:** nivel `Crítico` del registro de Data (fuente de verdad). Para NC manuales sin Data: severidad `ALTA`.
- **Sin Data disponible:** los indicadores que dependen de Data muestran **"Sin información"**, nunca 0, y aparece una alerta explícita.

### Corrección (desktop)
- `src/Backend/Services/FaretApi/FaretDashboardService.cs`: estado de gestión real; carga de Data paginada por API (`GET api/importaciones/pnc`, JWT de la sesión) y descarte de cualquier Data incompleta; NC ligadas a registros eliminados; críticas (en gestión / sin gestión / manuales) con detalle trazable; fecha efectiva = `fecha_creacion` o, si falta, `fecha_deteccion`; acciones correctivas cargadas en paralelo con límite de 6 (antes 354 llamadas secuenciales); `CalcularParaPruebas` (cálculo puro).
- `src/Backend/Models/FaretApi/FaretDashboardDto.cs`: campos nuevos y anulables (`DataDisponible`, `PncSinGestion`, `PncPendientesCierre`, `CriticasAbiertas`, `CriticasEnGestion`, `CriticasSinGestion`, `NcVinculadasAEliminados`, `NcSinFechaCreacion`, `NcCerradas`, `CriticasAbiertasDetalle`). Cambio aditivo.
- `src/Backend/Modules/Faret/FaretHandler.cs`: inyecta el servicio de Data (una línea).
- `src/UI/www/modules/faret/faret.view.html` y `faret.controller.js`: tarjeta "N sin cerrar" (con desglose en el tooltip); en Resumen general, "NC abiertas (en gestión)", "PNC sin gestión" y "PNC críticas sin cerrar" (con el detalle de cada una en el tooltip); "Sin información" cuando falta Data.
- `src/UI/www/modules/faret-nc/faret-nc.controller.js`: el detalle ya no muestra "1-01-0001" como fecha de creación.

### Conteos antes / después
| Indicador | 1.8.29 publicada | Corregido (datos reales de Mejora Continua) |
|---|---|---|
| NC abiertas | 354 | **0** en gestión (354 cerradas) |
| NC críticas abiertas (alerta) | 3 | **0 en gestión** + críticas sin gestión de Data: *pendiente de leer Data* |
| PNC sin gestión | no existía | *pendiente de leer Data* |
| NC sin fecha de creación usadas en "hoy"/tendencia | 0 de 67 | 67 (fechadas con su detección) |

## 2. Evaluación de Calidad por Operador — FARET

**Fuente:** Data Faret (`importacion_pnc`) mediante `GET api/importaciones/pnc` de la API `qualitycontrol`, con el JWT de la sesión. Trae `nivel`, `operador`, `maquina`, `area`, `fechaFabricacion` y `npNv`, los mismos campos que usa el motor INNPACK. Mejora Continua no aporta operador ni máquina, así que no se usa en el cálculo.

**Reutilización:**
- **Motor:** `EvaluacionOperadoresCalculator` sin cambios de lógica. Se agregaron como opcionales `Area`/`Referencia` en `NcFila`, un filtro de área y el `detalle` trazable, que solo se envía con un operador elegido. INNPACK es compatible: construye `NcFila` con 6 campos.
- **Privacidad:** `AplicarPrivacidad` se aplica tal cual (seudónimos `OP-xxxxxx` con VER; nombres con EDITAR o ADMIN_TI).
- **Frontend:** la lógica del controlador INNPACK se movió a `shared/evaluacion-operadores-base.js` (mismo patrón que `formularios-base.js`). INNPACK = `class extends EvaluacionOperadoresBase {}`; Faret pasa solo su configuración (acción, sin auditoría local, textos).

**Archivos nuevos:** `Modules/EvaluacionOperadores/FaretEvaluacionOperadoresHandler.cs`, `FaretEvaluacionOperadoresParser.cs`, `src/UI/www/shared/evaluacion-operadores-base.js`, `modules/faret-evaluacion-operadores/{view.html,controller.js}`.
**Modificados:** `EvaluacionOperadoresCalculator.cs`, `evaluacion-operadores.controller.js` (queda en 2 líneas), `evaluacion-operadores.view.html` (contenedor de detalle), `MessageRouter.cs` (rama `faret.evaluacionOperadores.` **antes** de la rama `faret`), `PermisosService.cs`, `index.html` (botón FARET + script).

**Autorización (frontend y backend):** módulo `faret-evaluacion-operadores` registrado como FARET y sin prefijos de escritura. `NivelPorRol` lo deja en SIN_ACCESO para todos los roles; ADMIN_TI tiene EDITAR; un permiso personalizado VER o EDITAR da acceso. `ValidarAccion` exige acceso a ese módulo para cualquier `faret.evaluacionOperadores.*`, aunque llegue con el `_modulo` de otro, y lo rechaza en una sesión INNPACK. No hay excepciones por nombre de usuario. La API Faret acepta la clave del módulo en la matriz de permisos (regex `^[a-z0-9-]{1,60}$`), así que no requiere cambios de API.

**Reglas que se mantienen:** solo lectura, sin nota ni ranking (orden alfabético), ponderaciones provisionales 10/5/1, período = fecha de fabricación, responsabilidad confirmada = 0, listado incompleto ⇒ error sin cifras, datos insuficientes (<30) ⇒ aviso.

**FPS:** el historial FPS de Faret no se distribuye ni se lee de archivos locales. El módulo muestra explícitamente que la comparación necesita un endpoint autenticado de historial que no está desplegado. No se infiere ninguna atribución por coincidencia de nombres. El diseño del endpoint sigue pendiente de autorización de despliegue (ver §5).

**~~Limitación conocida~~ (corregido en Fase 32, era un error de este informe):** la lista fija de CONSULTA en `core/app.js` (`aplicarReglaRolFaret`) solo rige si `permisos.mios` no respondió. Con permisos cargados, el menú usa `App.permisos`, así que CONSULTA con VER individual sí ve el módulo. Ver `32_...md` §4.

## 3. Integraciones (GET de solo lectura, 11-11-2026)
| Endpoint | HTTP | Observación |
|---|---|---|
| `calidad/api/calidad-faret/resumen` | 200 | 29 inspecciones hoy, 4.269 en el período: datos vivos |
| `calidad/api/calidad-faret/maquinas/resumen` | 200 | 27 máquinas; **incluye una máquina "TEST" (2 registros)**: dato de prueba en producción, no se borró |
| `calidad/api/calidad-faret/registros` | 200 | OK |
| `mejora-continua/api/no-conformidades` | 200 | ver §1 (bug de `fecha_creacion`) |
| `qualitycontrol/api/importaciones/pnc`, `innpack/api/no-conformidades`, `fps/.../despachos` | 401 sin token | correcto: exigen autenticación |

**API Mejora Continua** (`mejoracontinua.api`, `Repositories/NoConformidadRepository.cs`): el `INSERT` ahora informa `fecha_creacion = GETDATE()`. Compila en Release (salida fuera del repo). **No desplegado.** Backfill de las 67 NC: `31b_backfill_fecha_creacion_nc_NO_EJECUTADO.sql` (lo ejecuta el DBA, con guarda y transacción, después del despliegue).

No se completó la auditoría módulo por módulo de los que exigen JWT: requiere sesiones reales de INNPACK y Faret (ver bloqueo).

## 4. Pruebas ejecutadas
- `dotnet run --project tools/evaluacion_operadores_tests`: **155/155**. Incluye 38 nuevas: parser Faret, cálculo con área y detalle, privacidad, compatibilidad INNPACK, permisos Faret (4 roles sin acceso, VER, EDITAR, nivel desconocido, ADMIN_TI, sesión INNPACK, `_modulo` ajeno) y dashboard (gestión real vs. legacy, eliminados, sin gestión, críticas, fecha vacía, sin Data ⇒ null). Con `FASE31_NC_JSON` apuntando a la descarga real: 354 = 0 abiertas + 354 cerradas, 67 sin fecha.
- `dotnet build QualityControlCenter.csproj -c Release`: 0 errores.
- Prueba visual por CDP en la ventana Photino real (bridge simulado, sin credenciales):
  - Faret evaluación: filtros con área, KPIs, aviso de nombres ocultos, sección FPS, detalle al elegir operador, sin errores JS.
  - Inicio Faret: "3 sin cerrar" (0 en gestión · 3 sin gestión), críticas con detalle; sin Data, "Sin información".
  - INNPACK: error controlado, sin errores JS.
  - Captura revisada.
- **No ejecutadas:** pruebas con sesión real (Data Faret, permisos de la API, sesión expirada, auto-actualización), porque no hay credencial de lectura válida.

## 5. Pendientes y acciones exactas
1. **Credencial de lectura para la API `qualitycontrol` (bloqueo):** reactivar AdminTI o dar una cuenta de prueba. Con ella: contar PNC sin gestión y críticas reales, ubicar la PNC que reporta la usuaria y validar la evaluación Faret con datos reales.
2. **Desplegar la API Mejora Continua** (fix de `fecha_creacion`) siguiendo `docs/OPERACION_DESPLIEGUE_QCC.md`, y después ejecutar `31b_...sql` (DBA). Requiere autorización específica.
3. **Endpoint de historial FPS autenticado** (INNPACK y Faret) para la comparación con producción: requiere autorización de despliegue en SRV-API.
4. **Versión 1.8.30:** subir `Version`, `AssemblyVersion` y `FileVersion` en el `.csproj`, más el `.iss` (incluido `;AppVerName`), el sidebar de `index.html` y `novedades.js`. Empaquetar y publicar `latest.json` solo con autorización y tras el punto 1.
5. Revisar con Calidad la máquina "TEST" en Inspecciones Faret.
6. Las 296 NC cerradas sin `fechaCierre` no tienen fecha real de cierre (se cerraron desde *Gestionar*), así que el indicador "tiempo promedio de cierre" usa solo 58. Evaluar si *Gestionar → Cerrada* debe pasar por `POST /cerrar` (decisión de negocio).

## 6. Rollback
Nada desplegado. Para revertir en local: `git checkout -- <archivos modificados>` y borrar los archivos nuevos listados en §1 y §2. En la API Mejora Continua: `git checkout -- MejoraContinua.Api/Repositories/NoConformidadRepository.cs`.

## 7. CLAUDE.md (≈154.000 caracteres) — propuesta de reorganización (no aplicada)
La sección "Faret (multi-empresa)" ocupa ~47.000 caracteres; los bloques "Versión 1.8.x" ~12.000 y repiten el mismo procedimiento de empaquetado; varias secciones duplican el detalle de `contex.md`. Propuesta: dejar en CLAUDE.md solo instrucciones vigentes (reglas, comandos, arquitectura, gotchas activos, políticas) y mover a `docs/claude/`:
- `faret-arquitectura.md`: 3 APIs, repos, formatos de respuesta, roles y gotchas de autorización.
- `modulos-compartidos.md`: Control Documental, Producto Terminado, Formularios, Despachos, NC Internas.
- `innpack-modulos.md`: mermas, exportación Excel, Laboratorio REG-LAB-04, Talleres.
- `releases.md`: historial de versiones con un único procedimiento de empaquetado y publicación.

CLAUDE.md enlazaría cada archivo con una línea. No se elimina información; requiere aprobación antes de moverla.
