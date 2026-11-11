# 06 — Diseño técnico de integración (PROPUESTA sobre arquitectura E)

## 1. Componentes

| Componente | Cambio | Observación |
|---|---|---|
| API INNPACK (.NET, SQL Server) | **Módulo nuevo** `EvaluacionOperadores` (Controller/Service/Repository + job) | Reutiliza JWT y patrón `NoConformidadesController` |
| fps-api Node | **Endpoint nuevo de solo lectura** `GET /api/calidad/sesiones` | Mismo `x-api-key`; sin tocar FastAPI ni FPS-Python |
| API Faret `qualitycontrol` | Opcional: parámetro `actualizadoDesde` en `GET api/importaciones/pnc` (+ columna `updated_at`/`actualizado_por`) | Hoy `importacion_pnc` no guarda quién/cuándo edita (PENDIENTE confirmar columnas) |
| Desktop (Photino) | `Modules/EvaluacionOperadores/*Handler` passthrough, módulos en `PermisosService`, vista JS compartida | Mismo patrón que `NoConformidadesHandler` |
| Web (gateway Java) | `BridgeConfig` + handler + `PermisosModulo` | Paridad exigida por `release-web.ps1` |
| FPS (estaciones, FastAPI, VB) | **Sin cambios** | |

## 2. Modelo de datos (SQL Server `calidad`, tablas nuevas; GRANT por objeto lo ejecuta el DBA)

```
eval_operador            (rut PK, codigo_anonimo, activo, creado_en)
eval_operador_alias      (id, alias_normalizado, rut FK, origen, confirmado_por, confirmado_en)
eval_maquina_puente      (id, aplatz_id, nombre_corto, empresa, maquina_qc_id/codigo_qr, confirmado_por)
eval_ponderacion_version (id, version, estado[BORRADOR|APROBADA|VIGENTE|HISTORICA], vigente_desde, vigente_hasta,
                          peso_critico, peso_mayor, peso_menor, parametros_json, justificacion,
                          creado_por, aprobado_por, aprobado_en)
eval_nc_atribucion       (id, empresa, nc_origen, nc_id, nivel_norm, peso_aplicado, version_id, fecha_fab_usada,
                          fecha_fab_es_fallback, rut, fraccion, clase_atribucion[A|B|C|D], regla, sesiones_json,
                          hash_fuente, calculado_en)
eval_snapshot_mensual    (id, periodo, rut, maquina_grupo, version_id, estado[PROVISIONAL|OFICIAL],
                          P, N, OFx, U, H, F2, F3, F4, F5, evaluabilidad, cobertura_json, calculado_en, aprobado_por)
eval_sync_estado         (fuente, ultimo_ok, ultimo_error, watermark, filas)
eval_audit               (id, usuario, accion, entidad, antes_json, despues_json, motivo, fecha)
```
- Los snapshots **oficiales** son inmutables (append-only; reemplazo = nueva fila con `reemplaza_id`).
- `hash_fuente` por NC permite detectar cambios en origen (nivel/operador/fecha editados) → período marcado "afectado".

## 3. Contratos REST (API INNPACK, JWT, `[Authorize]` + roles)

Convenciones: `?page&pageSize` (máx 200), fechas `YYYY-MM-DD`, periodo `YYYY-MM`, errores `{ok:false,error,code}`; 403 sin permiso; 422 validación.

**GET `/api/evaluacion-operadores/indicadores?periodoDesde=2026-10&periodoHasta=2026-10&empresa=INNPACK&maquina=AGNATI&version=vigente`**
```json
{ "ok":true,"data":{"version":{"id":4,"estado":"VIGENTE","pesos":{"critico":10,"mayor":5,"menor":1}},
  "estado":"PROVISIONAL","sincronizacion":{"fps":"2026-11-10T02:10:00","innpack":"…","faret":"…"},
  "kpis":{"operadoresEvaluados":14,"noEvaluables":3,"ncPorNivel":{"critico":1,"mayor":6,"menor":9},"ncSinAtribucion":4},
  "tendencia":[{"periodo":"2026-09","P":31},{"periodo":"2026-10","P":24}]}}
```
**GET `/api/evaluacion-operadores/ranking?periodo=2026-10&maquina=AGNATI&minOF=5`** → filas `{codigo,evaluabilidad,P,N,OFx,F3,F4,F5,confiabilidad}`.
**GET `/api/evaluacion-operadores/operador/{codigo}?periodo=2026-10`** → resumen + evolución + comparación.
**GET `/api/evaluacion-operadores/detalle?periodo=&codigo=`** → por NC: `ncId, origen, fechaFab, esFallback, maquina, nivel, peso, version, clase, regla, sesiones[]`.
**GET `/api/evaluacion-operadores/no-conformidades?periodo=&nivel=&sinAtribucion=true`** (consulta de NC normalizadas).
**GET `/api/evaluacion-operadores/produccion?periodo=&codigo=`** (exposición por operador, desde sesiones sincronizadas).
**GET/POST/PUT `/api/evaluacion-operadores/ponderaciones`**, **POST `…/ponderaciones/{id}/simular`** (body: meses), **POST `…/ponderaciones/{id}/aprobar`** (solo Calidad; exige `justificacion`), **GET `…/ponderaciones/historial`**.
**POST `/api/evaluacion-operadores/recalcular`** `{periodo, motivo}` (ADMIN_TI/Calidad) → 202 con jobId.
**GET `/api/evaluacion-operadores/sincronizacion`** → estado por fuente.

**fps-api Node (nuevo, solo lectura):** `GET /api/calidad/sesiones?desde=YYYYMMDD&hasta=YYYYMMDD&page&pageSize<=1000` → `[{recordKey, ot, idProceso, np, rut, resourceKey, nombreCorto, productionStart, productionEnd, prodQty, verde, azul, rojo, online, closeReason}]`; rango máx 92 días; ordenado por `RecordKey`; `x-api-key`; sin nombres (solo RUT; el nombre lo resuelve la tabla `eval_operador` con permiso). Fechas siempre `'YYYYMMDD'` (la BD usa `DATEFORMAT ydm`).

## 4. Sincronización y recálculo

- **Incremental por lotes** (job nocturno + botón manual): FPS por rango de `ProductionStartDate` con ventana de 35 días hacia atrás (cubre cierres tardíos); NC INNPACK por `fecha_actualizacion` > watermark; Faret por `actualizadoDesde` (si no existe, relectura de los últimos N meses y comparación por `hash_fuente`).
- **NC tardías:** al detectar cambio en una NC (hash distinto) se marca el período de `fecha_fab_usada` (viejo y nuevo) como **afectado**; el recálculo genera un snapshot `PROVISIONAL` y requiere aprobación para reemplazar un `OFICIAL`. Se registra diff en `eval_audit`.
- **No** consultas pesadas en la petición del usuario; las vistas leen solo `eval_*`.
- **Idempotencia:** `UPSERT` por `(fuente, id)`; recálculo determinístico dado (datos, versión).

## 5. Seguridad

- Sin conexiones directas nuevas a bases: API→API (JWT interno / `x-api-key` dedicada).
- Mínimo privilegio: usuario SQL con `SELECT/INSERT/UPDATE` solo sobre `eval_*` y `SELECT` de `no_conformidades`.
- Roles: lectura nominal solo Calidad/Supervisión; aprobación solo Calidad; recalcular ADMIN_TI/Calidad. Validación server-side (la API INNPACK hoy no restringe por rol; este módulo sí debe hacerlo).
- Datos personales: respuestas por `codigo_anonimo` salvo permiso; logs sin nombres/RUT (hash); exportes nominales auditados.
- Límites: rate-limit por usuario, tope de páginas, rangos máximos.
- Observabilidad: métricas de sync (filas, duración, errores), alerta si `ultimo_ok` > 36 h; log estructurado sin PII.
- Respaldos: tablas `eval_*` dentro del backup estándar de la BD; snapshots oficiales además exportables.
- Despliegue/rollback: ver doc 07.

## 6. Rendimiento

Cardinalidad: ~2.500 sesiones/30 días y 555 OF/90 días: volumen bajo; proyección mensual por operador (~80 operadores activos) trivial. El cuello es la lectura de FPS (paginada, ≤ 92 días) y el cruce NC↔sesiones (índices por `np`, `rut`, `fecha`).

## 7. Auditoría

`eval_audit` registra cambios de ponderación, alias, puente de máquinas, atribuciones manuales, aprobaciones y recálculos (usuario, antes/después, motivo). Prerrequisito recomendado: **log de cambios de `nivel`/`operador`/`fecha_fabricacion` en las NC de origen** (hoy no existe); alternativa mínima: el `hash_fuente` detecta cambios y los registra.

## 8. Alternativas de integración evaluadas

| Opción | Veredicto |
|---|---|
| Síncrona (cada consulta lee FPS y NC) | Descartada: carga sobre producción y lentitud |
| Vista materializada en FPS (`plan.*`) | Posible para sesiones (`plan.FactSesionKpi` ya existe pero es carga única, sin refresco) → no confiable hoy |
| Lote nocturno + proyección propia | **Recomendada** |
| CDC/streaming | Sobredimensionado |
