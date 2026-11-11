# 02 — Mapeo de datos y correlación Quality Control ↔ FPS

## 1. Matriz de campos

| Concepto | Sistema | Tabla / endpoint | Campo | Tipo | Calidad / disponibilidad | Inconsistencias | Transformación |
|---|---|---|---|---|---|---|---|
| Nivel NC | QC INNPACK | `no_conformidades` (SQL Server) | `nivel` | texto (catálogo abierto `cat_nc_niveles`) | Obligatorio solo en PRODUCTO. Cobertura real PENDIENTE (Q2) | Catálogo sembrado con Crítico/Mayor/Menor **más todos los valores históricos**; sin whitelist | Normalizar (trim, acentos, mayúsculas) → {Crítico, Mayor, Menor, NO_CLASIFICADO} |
| Nivel NC | QC Faret | `importacion_pnc.nivel` | VARCHAR(30) | Obligatorio en Excel y "Nueva NC", texto libre | `PorNivel` agrupa por string crudo; solo `UPPER IN ('CRÍTICO','CRITICO')` está hardcodeado | Ídem |
| Severidad | QC | `no_conformidades.severidad` / `nc_no_conformidades.severidad` | ALTA/MEDIA/BAJA | Conversión con pérdida del nivel; default MEDIA para desconocidos (`faret-nc.controller.js:2222`) | **No usar como fuente del peso** |
| Operador (NC) | QC INNPACK | `no_conformidades.operador` | texto libre | Opcional; sin FK; sugerencias desde `usuarios` (INFERIDO: inspectores/admins, no operadores de planta) | Variantes de grafía | Mapeo alias→RUT |
| Operador (NC) | QC Faret | `importacion_pnc.operador` | VARCHAR(150) | Opcional; combo sobre `cat_operadores` solo sugiere; guarda nombre, no id | Ídem | Ídem |
| Operador (producción) | FPS | `WorkOrderRecords.UserKey` → `ZZZUsuarios.ID`, `Rut` | int / nvarchar(15) | **100 %** de sesiones con `UserKey` (30 d: 2.572 sesiones, 77 operadores) | 11 RUT repetidos entre 449 usuarios | Clave de negocio = RUT normalizado |
| Máquina (NC) | QC | `maquina` (texto libre; INNPACK sugiere desde `maquinas`+`codigo_qr`; Faret `cat_maquinas`) | texto | Opcional | Sin ID | Tabla puente |
| Máquina (producción) | FPS | `WorkOrderRecords.ResourceKey` = `ZZZListaMaquina.aplatz_id`; `NombreCorto` nvarchar(10) | int/texto | 100 %; 99 máquinas (80 activas, 13 sin nombre corto) | **No hay QR en FPS** | Puente `aplatz_id ↔ maquinas.codigo_qr / cat_maquinas.id` (PENDIENTE de construir y validar con Calidad) |
| NP/NV | QC | `np_nv` | texto/VARCHAR(50) | Obligatorio al crear | Puede traer formato libre | Extraer numérico |
| NP | FPS | `ZZZMasterOT.NotaVentaFaret` / `NotaVentaInnpack` | int | Cruce con `OR` (ya lo hace fps-api Node) | — | `TRY_CAST` del lado QC |
| Orden de fabricación | FPS | `ZZZMasterOT.OrdenTrabajo` (OF) → `ZZZProcesosProductivos.Id_Proceso` (proceso/OT hija) → `WorkOrderRecords.WorkOrderKey` | int / bigint | 0 sesiones huérfanas en 90 d | "OF finalizada" no existe como estado literal | Definir con `CloseReasonName`/`Online` |
| Fecha de fabricación | QC INNPACK/Faret | `fecha_fabricacion` | DATE NULL | **Opcional**; capturada en formulario o Excel (`FECHA FABRIC.`, `requerido:false`). **No** la captura Flutter. Cobertura real PENDIENTE (Q1/Q3) | Los filtros/indicadores actuales usan `fecha_ingreso` | Ver §4 |
| Fecha de fabricación | FPS | **No existe como campo operativo.** Candidatas: `WorkOrderRecords.ProductionStartDate/EndDate` (por sesión); `ZZZMasterOT.FechaIngreso/FechaEntrega` son fechas de pedido | datetime | 6 sesiones con fin<inicio (90 d); 13 en curso sin fin | `plan.CalidadPncHistorico.FechaFabricacion` es una carga única de Excel (246 filas) | `ProductionEndDate` (propuesta) |
| Fecha de ingreso/registro | QC | `fecha_ingreso` (INNPACK: copia de `fecha_deteccion` en internas); Faret editable al crear (Paso 42) y al editar | date | Obligatoria | No es fecha de fabricación | — |
| Fecha de inspección | QC | `registros_control.fecha_registro/hora_registro`; `registros_producto_terminado` | datetime | — | Es fecha de registro | — |
| Turno | FPS | `ZZZSesionEventos` (desde 2026-08-05): `TurnoKey`=ticks del LOGIN, eventos LOGIN/LOGOUT/SETUP/PRODUCCION/IMPRODUCTIVO; 58.004 filas, 4.840 turnos, `UserKey` 100 % | — | Solo si la estación tiene `[session].log_enabled`; antes del 05-08 no hay turnos reconstruibles | `ZZZListaMaquina.TurnoA/B/C` es calendario de máquina, no del operador | Reconstruir turno desde eventos |
| Cantidad producida | FPS | `WorkOrderRecords.ProductionQuantity`, `SetupQuantity` | numeric | 12 % de sesiones con cantidad nula/0 (30 d) | Conteo por GPIO con multiplicador ×1/×2/×3 elegido por el operario; riesgo documentado de sobreconteo (`fps-analyzer`) | — |
| Buenos/malos | FPS | `PlGreenQuantity`, `PlBlueQuantity`, `PlRedQuantity` | **nvarchar(50)** | verde>0 en 7.039 de 7.855 sesiones (90 d) | Texto, usar `TRY_CAST` | Calidad FPS = (verde+azul)/(verde+azul+rojo) |
| Cant. rechazada NC | QC | `cant_rechazada`, `cant_requerida`, `cant_recuperada` | decimal | Obligatorias en formulario Nueva NC | — | — |
| Unidades inspeccionadas | QC | `registros_producto_terminado.unidades_nc`, `defectos_totales` (precalculados por Flutter), plan NCh44 | — | Mejor candidato a "inspeccionadas" en producto terminado | Sin operador | — |
| Estado de OF | FPS | `ZZZMasterOT.EstadoDocumento` (Producción 8.557, Cancelada 219, Terminada 135, Abierta 11, Pendiente 6); `ZZZMateriasPrimasOT.Estatus` 10/20/30 | — | Estatus=30 solo lo pone la API al cerrar con motivo "terminada" | — | — |
| Reproceso | FPS | **No hay flag**. Se infiere por varios records del mismo `Id_Proceso` tras PARCIAL/LEVANTAMIENTO | — | INFERIDO | — | — |
| Inspector | QC | `registros_control.usuario_id` | int | Es el inspector, **no** el operador | — | No usar como operador |

## 2. Cardinalidades reales (FPS, últimos 90 días, CONFIRMADO)

| Métrica | OF | Procesos |
|---|---|---|
| Total | 555 | 3.860 |
| Con >1 operador | **498 (90 %)** | 893 (23 %) |
| Con >1 máquina | 491 | 160 |
| Con >1 registro/sesión | — | 1.340 |

Motivos de cierre (90 d): PRODUCCION TERMINADA 3.665 · PARCIAL 3.377 · CAMBIO DE OPERADOR 535 · LEVANTAMIENTO 228 · NULL 43 · cierre automático 2. Tras "CAMBIO DE OPERADOR": 447 de 535 siguientes sesiones son de otro operador.

**Conclusión:** la OF no es unidad de atribución. El grano mínimo es la **sesión** (`RecordKey`).

## 3. Clasificación de relaciones

| Relación | Clase | Justificación |
|---|---|---|
| Sesión FPS → operador (RUT) | **Directa y verificada** | `UserKey` 100 % poblado |
| Sesión FPS → máquina | **Directa y verificada** | `ResourceKey` 100 % |
| Sesión FPS → OF/proceso/NP | **Directa y verificada** | FK y 0 huérfanas |
| NC → NP | **Indirecta determinística** | `np_nv` texto → entero; cruce con ambas columnas de NV |
| NC → OF/proceso | **Indirecta pero determinística si el NP tiene un único proceso/ítem; si no, inferida** | `np_nv` no identifica proceso ni ítem |
| NC → sesión(es) | **Inferida** | Requiere ventana por fecha de fabricación + máquina; el NP puede tener decenas de sesiones |
| NC → operador (declarado en la NC) | **Inferida con incertidumbre** | Texto libre sin ID; opcional |
| NC → operador (por cruce con sesiones) | **Inferida** | Único solo si exactamente una sesión del NP cubre máquina+fecha; en otro caso compartido |
| NC → máquina | **Inferida** | Texto libre → requiere puente |
| NC interna → operador | **No disponible** | No capturan operador/nivel/fecha de fabricación |
| Operador (texto NC) ↔ RUT FPS | **Inferida** | Sin clave común; sin catálogo con ID |
| Fecha de fabricación NC ↔ fecha de producción FPS | **Inferida** | FPS no tiene "fecha de fabricación"; equivale a rango de sesiones |

## 4. Reglas propuestas de tratamiento (PROPUESTA)

**Atribución de una NC a operador(es)** — niveles de confianza, reportados siempre en el detalle:

| Nivel | Condición | Tratamiento |
|---|---|---|
| A (verificada) | NC trae operador, el alias resuelve a un RUT, y existe sesión de ese RUT en NP + (máquina) + ventana de fecha de fabricación | Penalización 100 % al operador |
| B (determinística) | NC sin operador (o no resuelto) pero una sola sesión (un solo operador) cubre NP+máquina+fecha | Penalización 100 % a ese operador, marcada "derivada" |
| C (compartida) | Varias sesiones/operadores cubren la ventana | Reparto proporcional a minutos de producción en la ventana **o** "no atribuida" (decisión de Calidad, ver doc 08) |
| D (no atribuible) | Sin operador, sin NP resoluble, sin sesión, NC interna, fecha de fabricación nula sin fallback aprobado | Cuenta en indicadores de planta/máquina, **no** en el de operador |

Duplicados: clave de detección `NP + UPPER(operador) + fecha_fabricacion + nivel + categoría_defecto + cant_rechazada`; los candidatos se listan para revisión, no se eliminan automáticamente. NC anuladas: `eliminado=1` se excluyen. Registros sin correspondencia: se reportan en una bandeja "Sin atribución" con contadores.

**Fecha de fabricación nula:** (1) excluir y publicar cobertura, o (2) fallback explícito a `fecha_ingreso` marcado en el detalle. No decidir sin Calidad (doc 08, P2).

## 5. Brechas para calcular un índice por operador

1. Alias de operador → RUT (no existe). 2. Puente de máquina. 3. Cobertura de `fecha_fabricacion`. 4. Normalización de `nivel`. 5. Auditoría de cambios (no existe por campo; en Faret `importacion_pnc` ni siquiera guarda `actualizado_por`). 6. Endpoint de sesiones de FPS por período (no existe; el más cercano es `/laboratorio/registros?np=` y filtra por categorías de laboratorio). 7. Definición oficial de denominador.

## 6. Consultas de verificación para ejecución humana (solo lectura)

SQL Server `calidad` (INNPACK, tabla `no_conformidades`); para Faret adaptar a `importacion_pnc` (MySQL).

```sql
-- Q1 cobertura de atribución (agregados)
SELECT ambito, empresa, COUNT(*) total,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(operador)),'') IS NOT NULL THEN 1 ELSE 0 END) con_operador,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(maquina)),'')  IS NOT NULL THEN 1 ELSE 0 END) con_maquina,
  SUM(CASE WHEN fecha_fabricacion IS NOT NULL THEN 1 ELSE 0 END) con_fecha_fab,
  SUM(CASE WHEN NULLIF(LTRIM(RTRIM(np_nv)),'') IS NOT NULL THEN 1 ELSE 0 END) con_np
FROM no_conformidades WHERE eliminado=0 GROUP BY ambito, empresa;
-- Q2 distribución de nivel
SELECT nivel, severidad, COUNT(*) n FROM no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO' GROUP BY nivel, severidad ORDER BY n DESC;
-- Q3 mes de fabricación vs mes de ingreso
SELECT FORMAT(fecha_fabricacion,'yyyy-MM') mes_fab, FORMAT(fecha_ingreso,'yyyy-MM') mes_ing, COUNT(*) n
FROM no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO' GROUP BY FORMAT(fecha_fabricacion,'yyyy-MM'), FORMAT(fecha_ingreso,'yyyy-MM') ORDER BY 1,2;
-- Q4 variantes de operador
SELECT COUNT(DISTINCT operador) crudos, COUNT(DISTINCT UPPER(LTRIM(RTRIM(operador)))) normalizados
FROM no_conformidades WHERE eliminado=0 AND NULLIF(LTRIM(RTRIM(operador)),'') IS NOT NULL;
-- Q5 duplicados aparentes
SELECT np_nv, UPPER(LTRIM(RTRIM(operador))) op, fecha_fabricacion, COUNT(*) n
FROM no_conformidades WHERE eliminado=0 GROUP BY np_nv, UPPER(LTRIM(RTRIM(operador))), fecha_fabricacion HAVING COUNT(*)>1;
-- Q6 ediciones tardías
SELECT COUNT(*) FROM no_conformidades WHERE eliminado=0 AND DATEDIFF(day,fecha_creacion,fecha_actualizacion)>30;
```

FPS (vía quien tenga acceso a `FPS_PRODUCCION`):
```sql
-- F1 match NP de una muestra de NC contra OF
SELECT COUNT(*) FROM ZZZMasterOT WHERE NotaVentaFaret=@np OR NotaVentaInnpack=@np;
-- F2 sesiones con cantidades no numéricas
SELECT COUNT(*) FROM WorkOrderRecords WHERE PlRedQuantity IS NOT NULL AND TRY_CAST(PlRedQuantity AS int) IS NULL;
-- F3 cobertura de eventos de turno por máquina desde 2026-08-05
-- F4 plan.FactSesionKpi (122.019) vs WorkOrderRecords (122.189): ¿qué falta y se refresca?
-- F5 RUT duplicados (449 usuarios vs 438 RUT)
-- F6 fracción de NC (NP + fecha de fabricación) que cae dentro de alguna sesión del NP
```
