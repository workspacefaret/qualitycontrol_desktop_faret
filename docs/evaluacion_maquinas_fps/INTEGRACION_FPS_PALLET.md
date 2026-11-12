# Evaluación por Máquina — integración FPS para Pallet/Papel (estado local, 12-11-2026)

Estado: **implementado y probado en local. Nada desplegado, publicado, commiteado ni activado para usuarios finales.**

## Qué se agregó
| Pieza | Archivo |
|---|---|
| Endpoint FPS `GET /api/produccion/sesiones-maquina` | `fps-api/src/services/sesionesMaquina.service.js`, `src/routes/sesionesMaquina.routes.js`; `src/server.js` (solo montaje, +2 líneas); `package.json` (script `test`); `tests/sesionesMaquina.test.js` |
| Método de consulta | `src/Backend/Services/FpsApi/FpsSesionesApiService.cs` (`ObtenerPorMaquinaAsync`) |
| Equivalencias verificadas | `src/Backend/Modules/EvaluacionMaquinas/PalletMaquinaEquivalencias.cs` |
| Clasificador puro | `.../PalletAtribucionFps.cs` |
| Auditoría de cobertura (apagada) | `FaretEvaluacionMaquinasHandler.cs` acción `faret.evaluacionMaquinas.coberturaFps`; `PermisosService.cs`; `MessageRouter.cs` |
| Pruebas | `tools/evaluacion_maquinas_tests` (141) |

## Contrato del endpoint
`GET /api/produccion/sesiones-maquina?maquina=15,17&desde=2026-01-01&hasta=2026-01-31[&limite=1000][&despues=<cursor>]`
- Auth: `x-api-key` (mismo middleware). Si el servidor no tiene `API_KEY`, este endpoint responde 503 (falla cerrado).
- Límites: 30 máquinas, 92 días, `limite` 1–2000 (defecto 1000); 400 si se exceden. 429 si hay 2 consultas en curso; 504 a los 15 s (la consulta se cancela).
- Respuesta: `{ ok, consultadoEn, data: { maquinas, desde, hasta, limite, sesiones: [{RecordKey, IdProceso, Status, IdMaquina, Maquina, MaquinaDescripcion, IdOperador, Operador, SetupStartDate, ProductionStartDate, ProductionEndDate}], siguiente } }`; `siguiente` = cursor `AAAA-MM-DDTHH:mm:ss.fff|RecordKey` o `null`.
- Orden estable `(ProductionStartDate, RecordKey)` con keyset (sin OFFSET, sin duplicados entre páginas).
- Protección SQL: filtro sargable por `ProductionStartDate` (con retroceso fijo de 14 días para sesiones largas), `TOP (limite+1)`, `SET LOCK_TIMEOUT 5000`, `OPTION (MAXDOP 1)`. Solo `SELECT` sobre `WorkOrderRecords`, `ZZZListaMaquina`, `ZZZUsuarios` (mismas tablas y cuenta que `/sesiones-documentos`: sin permisos nuevos).
- Limitaciones: no devuelve sesiones sin `ProductionStartDate` (solo Setup). Las fechas son texto local (CONVERT 120).
- Logs: solo cantidades y tiempos; nunca nombres ni la clave.

## Reglas de atribución (clasificador)
Confiable / Probable / Sin identificación; nunca por NP ni por máquina sola; ambigüedad ⇒ no se atribuye. Detalle en el encabezado de `PalletAtribucionFps.cs`.
Activar la auditoría: `config.json` → `"EvaluacionMaquinas": { "CoberturaFpsHabilitada": true }` **y** usuario ADMIN_TI. Devuelve solo conteos (global, por máquina, por mes, motivos). No asigna 10/5/1 ni toca el cálculo del módulo.

## Equivalencias de máquinas
22 verificadas (nombre idéntico al catálogo FPS). **9 PENDIENTES de confirmación humana** (no se usan):

| Formulario Pallet | FPS (aplatz_id) | Diferencia |
|---|---|---|
| SIRYUS | 86 SYRIUS STEINEMANN | Ortografía y falta 'STEINEMANN' |
| APOLLO DIMENSIONADORA | 12 DIMENSIONADORA APOLO | Orden y ortografía |
| DIMENSIONADORA CHINA (EUROPA) | 91 DIMENSIONADORA CHINA (EUR) | Sufijo |
| GUILLOTINA 1 POLAR 137 | 30 GUILLOTINA POLAR 137 XT | Numeración y sufijo |
| GUILLOTINA 2 POLAR 155 | 99 GUILLOTINA POLAR 155 | Numeración |
| SM 74 | 47 SM 74 - ZL | Nombre parcial |
| FOLIA 2 | 92 FOLIA2 | Espaciado |
| SAKURAI | 45 SAKURAI. | Punto final |
| CD 102 4-L | 9 CD 102 4 -L | Espaciado |

## Reversión (local)
- fps-api: borrar `src/services/sesionesMaquina.service.js`, `src/routes/sesionesMaquina.routes.js`, `tests/sesionesMaquina.test.js`; quitar de `src/server.js` el `require` y el `app.use` de `sesionesMaquinaRoutes`; quitar el script `test` de `package.json` (copias originales de `server.js` y `package.json` con su hash en el scratchpad de la sesión).
- Desktop: `git checkout` de los archivos modificados y borrar los nuevos (ningún otro módulo cambió).

## Revisión tras la validación SQL (12-11-2026)
Evidencia de SSMS: SQL Server 2016, `WorkOrderRecords` 122.447 filas (~26 MB), plan de la v1 = Index Scan sobre `IX_WorkOrderRecords_WorkOrderKey_ResourceKey` (122.447 filas leídas para ~3.029), reloj SQL de FPS_PRODUCCION y calidad_db coherente (UTC−03:00).
- **Causa del scan:** el único índice con `ResourceKey` como clave, `IX_WorkOrderRecords_ResourceKey_Online_ProdTime` (ResourceKey, Online, ProductionStartDate, SetupStartDate, WorkOrderKey; INCLUDE Status, ProductionQuantity), **no incluye `ProductionEndDate` ni `UserKey`**, así que el optimizador prefirió recorrer el índice que sí los cubre (fuente: KB `programa-produccion.api/docs/db-kb/tablas/dbo.WorkOrderRecords.md`).
- **Cambio (v2, sin índices nuevos):** consulta en dos etapas — la etapa interna toma solo claves (`RecordKey`, `ProductionStartDate`) por `ResourceKey` + fecha (cubierta por ese índice), con TOP y keyset; la externa lee el resto por la clave primaria solo para esas claves. Se quitó el filtro por `ProductionEndDate` (no está en el índice): el cliente descarta lo que no cubre su instante.
- **Nuevo campo `Online`** en la respuesta: en FPS Station (VB) el `ProductionEndDate` de una sesión abierta es una estimación que se recalcula; el desktop trata `Online=1` como sesión sin término real (a lo más "probable").
- Desktop pide 2000 filas por página (máximo del endpoint) para reducir lecturas.
- **Sin verificar:** que el plan de la v2 reduzca las lecturas. Ejecutar `plan_comparativo_SOLO_LECTURA.sql` (planes estimados, no ejecuta nada) y comparar *Estimated Number of Rows to be Read* de Q1 vs Q2/Q3.
- **Fechas de FPS:** `ProductionStartDate`/`ProductionEndDate` las escribe la estación (VB `DateTime.Now`, Python `datetime.now()`), es decir, el **reloj del PC de planta**, no `GETDATE()` del servidor (este solo se usa en `CreateDate`/`UpdateDate`). La coherencia horaria depende de los relojes de las estaciones.

## Pendiente antes de publicar
1. Ejecutar `diagnostico_workorderrecords_SOLO_LECTURA.sql` (bloques A y B primero) y revisar índices y plan.
2. Confirmar las 9 equivalencias.
3. Despliegue supervisado de fps-api (respaldo con hash, copiar archivos, reiniciar solo la tarea `FpsApi`), prueba de 1 máquina × 1 día.
4. Medir cobertura real con la auditoría (flag + ADMIN_TI) antes de cualquier atribución.
