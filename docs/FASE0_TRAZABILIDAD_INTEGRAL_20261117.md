# Fase 0 — Trazabilidad integral, Balance/Mermas, Cierre NP y Certificados de Destrucción (INNPACK)

Fecha: 17-11-2026. Solo lectura: no se modificó código, datos, configuración ni producción.
Acceso usado: MCP `ia-sqlserver` (servidor SAP 192.168.1.231, usuario sin escritura) → bases
`FARET_PRODUCCION`, `INNPACK_PRODUCCION`, `Faret_Control_Calidad` y FPS (`FPS_PRODUCCION`, .230)
vía linked server `CONEXIONFPS` (`OPENQUERY`). Documentación de esquema FPS:
`programa-produccion/programa-produccion/docs/db-kb` (tablas `WorkOrderRecords`, `ZZZProcesosProductivos`, `ZZZLiberaciones`).

## 1. Caso de referencia: NP 4007 (INNPACK, AGRICOLA MONFRUT LTDA.) — multi-ítem real

| Dato | Fuente | Resultado verificado |
|---|---|---|
| NP → OT | FPS `ZZZMasterOT` (`NotaVentaInnpack=4007`) | OT 22811 (`NotaVentaFaret` 22811), ingreso 13-08-2026 |
| Ítems solicitados | SAP INNPACK `ORDR/RDR1` DocNum 4007 (`U_NroItem`) | 6 líneas: ítem 1 TP MONFRUT 140.000; 2 BS MONFRUT 140.000; 3 TP MOLINO 70.000; 4 BS MOLINO 70.000; 5 TP MOLINO 30.000; 6 BS MOLINO 30.000 (3/5 y 4/6 mismo código, líneas distintas) |
| Ruta de procesos | FPS `ZZZProcesosProductivos` (OT 22811) | Dimensionado → (Pliego 1 y Pliego 2) CTP, Tintas, Impresión+barniz, Corrugado, Emplacado, Molde, Troquelado, Desgajar → 90 Conteo y paletizado por ítem. Sin pegado (autosoportantes) |
| Corridas | FPS `WorkOrderRecords` | Por sesión: fecha, máquina, operador, `SetupQuantity`, `ProductionQuantity`, `PlGreen/Blue/RedQuantity`, `CloseReasonId`. Ej. troquelado pliego 1: 18 sesiones, 3 operadores (incl. César Segovia), máquina 143-3 SFM |
| Consumo real de materiales con lote | SAP FARET y SAP INNPACK `OIGE/IGE1` (`U_NumOT='22811'`) + `OITL/ITL1/OBTN` | FARET: cartulina Crown Board (33 pallets/lotes, proveedor y contenedor), barniz (lotes), tintas, planchas. INNPACK: papel onda y liner (16 bobinas c/u, con lote), adhesivo, y pliegos impresos por código de producto |
| Origen de un lote | `OITL` DocType 20/59 | Lote 5082-1 → recepción 40199 del 12-05-2026, proveedor Fornaroli Carta → salida 21-08 a OT 22811 |
| Trazabilidad inversa | `OBTN → ITL1 → OITL(60) → IGE1.U_NumOT` | Lote barniz 5433-1 → OT 22735, 22782, 22786, 22739, 22798, 22775, 22795, 22790, 22811 |
| Liberaciones | `Faret_Control_Calidad` (`CCMaster/MasterNP/CabeceraProCc`, `CantInspec`, `BodegaDest`) | Ítem 1: 11 folios = 140.000; ítem 2: 140.000; ítems 3 y 4: 3 folios = 66.000 cada uno. Todo a PRODUCTOS TERMINADOS |
| Despachos | SAP INNPACK `OINV/INV1` (`BaseType=17`, `BaseEntry=4007`, `BaseLine`=línea NV) | 9 facturas (sin guía previa). Ítem 1 = 140.000 (7 facturas); ítem 3 = 66.000; `RDR1.OpenQty` 4.000 en ítems 3/4 y 30.000 en 5/6. `U_Numero_Pallet` por factura |
| PDF de factura | SAP `ATC1` (`\\sap-b1.ad.faret.cl\b1_shr\...`) | Existe para las facturas de la NP 4007; cobertura general 343/871 facturas (39 %) desde 01-08-2026 |

Cadena completa demostrada: **proveedor → recepción → lote → OT/NP → proceso/sesión → liberación (folio) → factura → cliente**, por ítem.

## 2. Hallazgos que cambian supuestos anteriores

1. **La trazabilidad inversa por lote SÍ es viable** para materiales con lote en SAP (cartulina, papeles en bobina, barniz, adhesivo). `ManBtchNum='Y'`: 2.375/2.375 líneas de salida con lote desde 01-08-2026 y 2.356 con OT. Lo que estaba vacío era `IBT1` (tabla vieja) y `U_BultoLote`; el registro real está en `OITL/ITL1/OBTN`. Tintas, planchas y mantillas no tienen lote (solo cantidad por OT).
2. **El módulo Trazabilidad actual muestra materiales PLANIFICADOS** (`ZZZMateriasPrimasOT`, lista de materiales), no los consumidos. El consumo real con lote está en SAP `IGE1` por `U_NumOT`.
3. **FPS ya registra pérdidas por sesión**: `SetupQuantity` (arranque) y `PlBlueQuantity`/`PlRedQuantity`. Desde 01-08-2026: 23.143 sesiones, rojo en 5.626 (24 %), azul en 2.234 (10 %), setup en 10.780. Totales: rojo 1.048.385, azul 2.053.187, setup 2.095.028. **Significado no confirmado** (hipótesis según los datos: verde = conforme, azul = parte de la producción apartada/retenida, rojo = rechazo). Los campos son `nvarchar` (usar `TRY_CONVERT`).
4. **Las cantidades de FPS no cuadran entre etapas por sí solas**: pliego 1 → impresión 73.027, corrugado 52.320, emplacado 74.509, troquelado 70.681 (con 74.300 programados). Hay sesiones con `ProductionQuantity=0` y verde 30.000. El balance automático solo puede ser **PROVISIONAL**.
5. **Unidades por pliego**: no existe un factor estructurado confiable. FPS `NumeroMoldes`=4 en DESGAJAR (por pliego, no por ítem; el KB documenta que no concilia). La ficha técnica en SAP (`OITM.U_*`) está vacía para estos códigos. En FPS, `NrPl` de los bloques 31/32 es el **número de pliego**, no el ítem de la NV (un pliego alimenta varios ítems).
6. **Puente pliego → ítem**: INNPACK consume "PL.IMP.<producto>" por código (TP MONFRUT 37.000 pliegos, TP MOLINO 17.350…). Permite un balance por ítem desde la etapa INNPACK (pliegos impresos entregados vs unidades liberadas), con el factor ingresado por Calidad.
7. **No hay datos de la etapa 90 (conteo y paletizado) en FPS** para la NP 4007 (0 sesiones). El paletizado está en `registro_paletizado` (el módulo Trazabilidad actual lo muestra).

## 3. Matriz de información

| Requisito | Estado | Fuente / observación |
|---|---|---|
| Ficha NP: NV, cliente, ítems, código, descripción, cantidad solicitada | DISPONIBLE | SAP `ORDR/RDR1` + FPS `ZZZMasterOT` |
| NP Faret relacionada | DISPONIBLE | `ZZZMasterOT.NotaVentaFaret` |
| Ruta de procesos real | DISPONIBLE | FPS `ZZZProcesosProductivos` |
| Corridas (fecha, turno derivable, máquina, operador, cantidades) | DISPONIBLE | FPS `WorkOrderRecords` (clave real `RecordKey`) |
| Pliegos de entrada/salida por proceso | PARCIAL | Una sola cantidad por sesión (`ProductionQuantity`); "entrada" = salida de la etapa anterior |
| Unidades por pliego (factor) | NO ESTRUCTURADO | Ingreso por Calidad por NP/ítem (auditado), sugerido desde FPS |
| Pérdidas por sesión (setup, azul, rojo) | DISPONIBLE, semántica por confirmar | FPS `WorkOrderRecords` |
| Materias primas consumidas, lotes, proveedor, recepción | DISPONIBLE | SAP FARET e INNPACK `IGE1` + `OITL/ITL1/OBTN` + documento de entrada |
| Trazabilidad inversa por lote | DISPONIBLE (materiales con lote) | Misma cadena, al revés |
| Certificados de proveedor | NO DIGITAL (verificar) | No encontrados vinculados al lote en SAP; carga manual |
| Controles, defectos, mermas de Calidad, NC, Producto Terminado, Laboratorio | DISPONIBLE (verificado por código, no con datos en esta sesión) | API INNPACK (calidad_db, otro servidor no accesible con esta herramienta) |
| Liberaciones y certificado de calidad PDF | DISPONIBLE | `Faret_Control_Calidad` + fps-api `/liberaciones/certificados/:folio/pdf` |
| Cuarentena/destrucción en QCS | DISPONIBLE (sin casos en NP 4007) | `CabeceraProCc.BodegaDest` |
| Despachos y facturas por NP/ítem | DISPONIBLE | SAP INNPACK `OINV/INV1` y `ODLN/DLN1` por `BaseEntry/BaseLine` |
| PDF de factura/guía | PARCIAL (39 %) | SAP `ATC1` en share `b1_shr`; requiere acceso del servidor de la API al share |
| Guía técnica | NO VERIFICADA | No está en `OITM.U_*`; texto libre en FPS `Obs1..3`. Preguntar dónde vive (PDF/sistema) |
| POES, mantención, plagas, sala de tintas, inspección de camiones | NO DIGITAL en sistemas revisados | Carga manual por NP (los formularios LCC de camiones existen en `control_bins`, sin NP) |
| Inventario por NP | NO APLICA directo | Saldo = liberado − despachado por ítem (calculable) |

## 4. Componentes reutilizables

- fps-api: ya consulta FPS y SAP (`OPENQUERY(CONEXIONSAP, …)` con enteros validados), endpoints `procesos-por-np`, `sesiones-documentos`, `materiales-por-proceso`, `liberaciones/*` (incluye PDF del certificado).
- Desktop: `Modules/Trazabilidad` (se amplía), `FpsApiClient` + servicios `Fps*ApiService`, `InnpackApiClient`, `PermisosService`, `PrintExporter`, `ExcelExporter`, `TableUtils`, patrón BLOB de Control Documental, auditoría con historial (patrón NC/Laboratorio).
- API INNPACK: endpoints de registros de control, NC, Producto Terminado, Laboratorio y Certificados (filtros por NP a confirmar en Fase 1).

## 5. Consultas base verificadas (para el endpoint de Fase 1)

```sql
-- NP -> OT (FPS)
SELECT OrdenTrabajo, NotaVentaFaret, NotaVentaInnpack, RazonSocial FROM dbo.ZZZMasterOT WHERE NotaVentaInnpack=@np OR NotaVentaFaret=@np
-- Sesiones por proceso de la OT (FPS)
SELECT R.RecordKey, R.WorkOrderKey, R.ProductionStartDate, m.NombreCorto, u.Nombre_Comp, R.SetupQuantity, R.ProductionQuantity,
       R.PlGreenQuantity, R.PlBlueQuantity, R.PlRedQuantity, R.CloseReasonId
FROM dbo.ZZZProcesosProductivos P JOIN dbo.WorkOrderRecords R ON R.WorkOrderKey=P.Id_Proceso
LEFT JOIN dbo.ZZZListaMaquina m ON m.aplatz_id=R.ResourceKey LEFT JOIN dbo.ZZZUsuarios u ON u.ID=R.UserKey WHERE P.OrdenTrabajo=@ot
-- Consumo real con lote (SAP, repetir en FARET_PRODUCCION e INNPACK_PRODUCCION)
SELECT H.DocNum, H.DocDate, D.ItemCode, D.Dscription, D.Quantity, B.DistNumber, B.MnfSerial, B.LotNumber, I.Quantity
FROM IGE1 D JOIN OIGE H ON H.DocEntry=D.DocEntry
LEFT JOIN OITL T ON T.DocType=60 AND T.DocEntry=D.DocEntry AND T.DocLine=D.LineNum
LEFT JOIN ITL1 I ON I.LogEntry=T.LogEntry LEFT JOIN OBTN B ON B.ItemCode=I.ItemCode AND B.SysNumber=I.SysNumber
WHERE D.U_NumOT=@ot
-- Despachos por ítem (SAP INNPACK)
SELECT H.DocNum, H.DocDate, H.FolioNum, D.BaseLine, D.ItemCode, D.Quantity, H.U_Numero_Pallet FROM INV1 D JOIN OINV H ON H.DocEntry=D.DocEntry
WHERE H.CANCELED='N' AND ((D.BaseType=17 AND D.BaseEntry=@docEntryNV) OR (D.BaseType=15 AND D.BaseEntry IN (SELECT DocEntry FROM DLN1 WHERE BaseType=17 AND BaseEntry=@docEntryNV)))
-- Liberaciones por ítem y destino (Faret_Control_Calidad)
SELECT B2.NumItem, B6.BodegaDest, COUNT(*), SUM(B6.CantInspec) FROM CCMaster B1 JOIN MasterNP B2 ON B1.IDMaster=B2.ID
JOIN CabeceraProCc B6 ON B1.IDCabeseraCalidad=B6.ID WHERE B2.NP=@np AND B6.Cancelado='0' GROUP BY B2.NumItem, B6.BodegaDest
```
Pendiente en Fase 1: facturas ya incluidas en una entrega (evitar doble conteo factura+entrega, ver `project-despachos-sap-investigacion`), notas de crédito/devoluciones y el `DocEntry` de la NV (en NP 4007 coincide con DocNum, no asumirlo).

## 6. Limitaciones de esta auditoría

- `calidad_db` (SQL Server de Calidad) no es accesible con la herramienta de solo lectura usada: los datos de Calidad de la NP 4007 se verificaron por código, no con filas.
- No se confirmó el significado de los pallets verde/azul/rojo ni de `CloseReasonId` 3/90.
- No se probó el acceso al share `b1_shr` (PDF de facturas).
- Solo se probó a fondo una NP (4007, ya multi-ítem, multi-día y multi-máquina). Repetir la consulta del endpoint con 3-5 NP más antes de publicar.

> **Seguimiento:** la Fase 1a (Trazabilidad integral) se implementó localmente el 17-11-2026, sin desplegar. Detalle en `contex.md` Paso 141.
