/* ============================================================================================
   Comparación de PLANES ESTIMADOS (no ejecuta las consultas) — endpoint sesiones-maquina
   Base: FPS_PRODUCCION. Solo lectura. NO crea índices ni modifica nada.
   Cómo usarlo en SSMS: seleccionar UNA consulta a la vez y pulsar Ctrl+L ("Display Estimated Execution Plan"),
   o ejecutar el archivo completo: SET SHOWPLAN_XML devuelve los planes sin ejecutar las consultas.
   Anotar de cada plan (clic derecho en el operador de WorkOrderRecords > Properties):
     - Operador y objeto:  Index Seek / Index Scan sobre QUÉ índice
     - Estimated Number of Rows to be Read   (lecturas estimadas)  <- el dato clave a comparar
     - Estimated Number of Rows (devueltas), Estimated Subtree Cost, advertencias (conversión implícita, missing index)
   ============================================================================================ */

/* ---------- Q1: consulta ORIGINAL (1 etapa), 2 máquinas × 1 mes ---------- */
SET SHOWPLAN_XML ON;
GO
SELECT TOP (1001)
  R.RecordKey, R.WorkOrderKey, CAST(R.Status AS int), R.ResourceKey, R.UserKey,
  CONVERT(varchar(19), R.SetupStartDate, 120), CONVERT(varchar(19), R.ProductionStartDate, 120), CONVERT(varchar(19), R.ProductionEndDate, 120)
FROM dbo.WorkOrderRecords R
LEFT JOIN dbo.ZZZListaMaquina m ON m.aplatz_id = R.ResourceKey
LEFT JOIN dbo.ZZZUsuarios u ON u.ID = R.UserKey
WHERE R.ResourceKey IN (15, 17)
  AND R.ProductionStartDate >= DATEADD(DAY, -14, CONVERT(datetime, '2026-01-01', 23))
  AND R.ProductionStartDate <  DATEADD(DAY, 1,  CONVERT(datetime, '2026-01-31', 23))
  AND (R.ProductionEndDate IS NULL OR R.ProductionEndDate >= CONVERT(datetime, '2026-01-01', 23))
ORDER BY R.ProductionStartDate, R.RecordKey
OPTION (MAXDOP 1);
GO

/* ---------- Q2: consulta NUEVA (2 etapas: claves por índice existente + lectura por clave primaria), misma ventana ---------- */
SELECT
  R.RecordKey, R.WorkOrderKey, CAST(R.Status AS int), R.ResourceKey, R.UserKey,
  CONVERT(varchar(19), R.SetupStartDate, 120), CONVERT(varchar(19), R.ProductionStartDate, 120), CONVERT(varchar(19), R.ProductionEndDate, 120),
  CAST(R.[Online] AS int) AS [Online], CONVERT(varchar(23), K.ProductionStartDate, 126)
FROM (
  SELECT TOP (1001) R0.RecordKey, R0.ProductionStartDate
  FROM dbo.WorkOrderRecords R0
  WHERE R0.ResourceKey IN (15, 17)
    AND R0.ProductionStartDate >= DATEADD(DAY, -14, CONVERT(datetime, '2026-01-01', 23))
    AND R0.ProductionStartDate <  DATEADD(DAY, 1,  CONVERT(datetime, '2026-01-31', 23))
  ORDER BY R0.ProductionStartDate, R0.RecordKey
) K
INNER JOIN dbo.WorkOrderRecords R ON R.RecordKey = K.RecordKey
LEFT JOIN dbo.ZZZListaMaquina m ON m.aplatz_id = R.ResourceKey
LEFT JOIN dbo.ZZZUsuarios u ON u.ID = R.UserKey
ORDER BY K.ProductionStartDate, K.RecordKey
OPTION (MAXDOP 1);
GO

/* ---------- Q3: igual que Q2 pero el caso más pesado permitido: 30 máquinas × 92 días ---------- */
SELECT
  R.RecordKey, R.UserKey, CONVERT(varchar(19), R.ProductionEndDate, 120), CAST(R.[Online] AS int) AS [Online]
FROM (
  SELECT TOP (2001) R0.RecordKey, R0.ProductionStartDate
  FROM dbo.WorkOrderRecords R0
  WHERE R0.ResourceKey IN (1,3,4,5,6,9,12,13,14,15,17,19,20,22,23,29,32,33,36,37,45,47,54,55,73,86,90,91,92,99)
    AND R0.ProductionStartDate >= DATEADD(DAY, -14, CONVERT(datetime, '2026-01-01', 23))
    AND R0.ProductionStartDate <  DATEADD(DAY, 1,  CONVERT(datetime, '2026-04-02', 23))
  ORDER BY R0.ProductionStartDate, R0.RecordKey
) K
INNER JOIN dbo.WorkOrderRecords R ON R.RecordKey = K.RecordKey
ORDER BY K.ProductionStartDate, K.RecordKey
OPTION (MAXDOP 1);
GO
SET SHOWPLAN_XML OFF;
GO

/* ====================== CORRECCIÓN de la 2.ª etapa (12-11-2026) ======================
   Q2 usó Index Seek en la etapa 1 pero Index Scan (122.450 filas) en la etapa 2: con ~1.000-2.000 claves, el modelo de costos
   considera esas búsquedas aleatorias casi tan caras como recorrer 26 MB, y elige hash join + scan. Para que la lectura por clave
   primaria no dependa de ese cálculo se prueban dos formas equivalentes. Esperado en la etapa 2:
   Nested Loops + "Clustered Index Seek (PK_WorkOrderRecords)", ~1001 ejecuciones × 1 fila (NO un scan de 122.450).
   Resultado idéntico a Q2; solo cambia cómo se lee R. ====================== */
SET SHOWPLAN_XML ON;
GO
/* ---------- Q4: INNER LOOP JOIN (la versión que está en el código local) — mismo caso que Q2 ---------- */
SELECT
  R.RecordKey, R.WorkOrderKey, CAST(R.Status AS int), R.ResourceKey, R.UserKey,
  CONVERT(varchar(19), R.SetupStartDate, 120), CONVERT(varchar(19), R.ProductionStartDate, 120), CONVERT(varchar(19), R.ProductionEndDate, 120),
  CAST(R.[Online] AS int) AS [Online], CONVERT(varchar(23), K.ProductionStartDate, 126)
FROM (
  SELECT TOP (1001) R0.RecordKey, R0.ProductionStartDate
  FROM dbo.WorkOrderRecords R0
  WHERE R0.ResourceKey IN (15, 17)
    AND R0.ProductionStartDate >= DATEADD(DAY, -14, CONVERT(datetime, '2026-01-01', 23))
    AND R0.ProductionStartDate <  DATEADD(DAY, 1,  CONVERT(datetime, '2026-01-31', 23))
  ORDER BY R0.ProductionStartDate, R0.RecordKey
) K
INNER LOOP JOIN dbo.WorkOrderRecords R ON R.RecordKey = K.RecordKey
LEFT JOIN dbo.ZZZListaMaquina m ON m.aplatz_id = R.ResourceKey
LEFT JOIN dbo.ZZZUsuarios u ON u.ID = R.UserKey
ORDER BY K.ProductionStartDate, K.RecordKey
OPTION (MAXDOP 1);
GO
/* ---------- Q5: CROSS APPLY (alternativa sin hint de join) ---------- */
SELECT
  R.RecordKey, R.WorkOrderKey, CAST(R.Status AS int), R.ResourceKey, R.UserKey,
  CONVERT(varchar(19), R.SetupStartDate, 120), CONVERT(varchar(19), R.ProductionStartDate, 120), CONVERT(varchar(19), R.ProductionEndDate, 120),
  CAST(R.[Online] AS int) AS [Online], CONVERT(varchar(23), K.ProductionStartDate, 126)
FROM (
  SELECT TOP (1001) R0.RecordKey, R0.ProductionStartDate
  FROM dbo.WorkOrderRecords R0
  WHERE R0.ResourceKey IN (15, 17)
    AND R0.ProductionStartDate >= DATEADD(DAY, -14, CONVERT(datetime, '2026-01-01', 23))
    AND R0.ProductionStartDate <  DATEADD(DAY, 1,  CONVERT(datetime, '2026-01-31', 23))
  ORDER BY R0.ProductionStartDate, R0.RecordKey
) K
CROSS APPLY (SELECT RR.* FROM dbo.WorkOrderRecords RR WHERE RR.RecordKey = K.RecordKey) R
LEFT JOIN dbo.ZZZListaMaquina m ON m.aplatz_id = R.ResourceKey
LEFT JOIN dbo.ZZZUsuarios u ON u.ID = R.UserKey
ORDER BY K.ProductionStartDate, K.RecordKey
OPTION (MAXDOP 1);
GO
/* ---------- Q6: Q4 en el caso más pesado (30 máquinas × 92 días, 2001 claves) ---------- */
SELECT R.RecordKey, R.UserKey, CONVERT(varchar(19), R.ProductionEndDate, 120), CAST(R.[Online] AS int) AS [Online]
FROM (
  SELECT TOP (2001) R0.RecordKey, R0.ProductionStartDate
  FROM dbo.WorkOrderRecords R0
  WHERE R0.ResourceKey IN (1,3,4,5,6,9,12,13,14,15,17,19,20,22,23,29,32,33,36,37,45,47,54,55,73,86,90,91,92,99)
    AND R0.ProductionStartDate >= DATEADD(DAY, -14, CONVERT(datetime, '2026-01-01', 23))
    AND R0.ProductionStartDate <  DATEADD(DAY, 1,  CONVERT(datetime, '2026-04-02', 23))
  ORDER BY R0.ProductionStartDate, R0.RecordKey
) K
INNER LOOP JOIN dbo.WorkOrderRecords R ON R.RecordKey = K.RecordKey
ORDER BY K.ProductionStartDate, K.RecordKey
OPTION (MAXDOP 1);
GO
SET SHOWPLAN_XML OFF;
GO

/* ====================== Q7: reducir las filas leídas en la 1.ª etapa (13-11-2026) ======================
   En Q4/Q6 el Index Seek usa solo ResourceKey; la fecha queda como predicado residual porque la 2.ª columna del índice es [Online] y
   no se filtra: por eso lee TODAS las filas de esas máquinas (8.685 / 98.853), no solo las de la ventana. Si [Online] solo toma 0/1,
   declararlo permite que el optimizador use (ResourceKey, Online, ProductionStartDate) como rangos de búsqueda.
   PASO 0 (solo metadatos): ¿[Online] admite NULL?  Si is_nullable = 1 usar Q7b; si = 0 usar Q7a. */
SELECT c.name, c.is_nullable FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.WorkOrderRecords') AND c.name = 'Online';
GO
SET SHOWPLAN_XML ON;
GO
/* Q7a: [Online] NOT NULL */
SELECT TOP (2001) R0.RecordKey, R0.ProductionStartDate
FROM dbo.WorkOrderRecords R0
WHERE R0.ResourceKey IN (1,3,4,5,6,9,12,13,14,15,17,19,20,22,23,29,32,33,36,37,45,47,54,55,73,86,90,91,92,99)
  AND R0.[Online] IN (0, 1)
  AND R0.ProductionStartDate >= DATEADD(DAY, -14, CONVERT(datetime, '2026-01-01', 23))
  AND R0.ProductionStartDate <  DATEADD(DAY, 1,  CONVERT(datetime, '2026-04-02', 23))
ORDER BY R0.ProductionStartDate, R0.RecordKey
OPTION (MAXDOP 1);
GO
/* Q7b: [Online] admite NULL (no se pierde ninguna fila) */
SELECT TOP (2001) R0.RecordKey, R0.ProductionStartDate
FROM dbo.WorkOrderRecords R0
WHERE R0.ResourceKey IN (1,3,4,5,6,9,12,13,14,15,17,19,20,22,23,29,32,33,36,37,45,47,54,55,73,86,90,91,92,99)
  AND (R0.[Online] IN (0, 1) OR R0.[Online] IS NULL)
  AND R0.ProductionStartDate >= DATEADD(DAY, -14, CONVERT(datetime, '2026-01-01', 23))
  AND R0.ProductionStartDate <  DATEADD(DAY, 1,  CONVERT(datetime, '2026-04-02', 23))
ORDER BY R0.ProductionStartDate, R0.RecordKey
OPTION (MAXDOP 1);
GO
SET SHOWPLAN_XML OFF;
GO
/* Esperado en Q7a/Q7b: Index Seek con 'Seek Predicates' sobre ResourceKey + Online + ProductionStartDate (rango) y
   'Estimated Number of Rows to be Read' cercano a las filas de la ventana (miles), no 98.853. */

/* ---------- Referencia: definición de los índices (solo metadatos) ---------- */
SELECT i.name AS indice, i.type_desc,
       STUFF((SELECT ', ' + c.name FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0 ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS columnas_clave,
       STUFF((SELECT ', ' + c.name FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1 FOR XML PATH('')), 1, 2, '') AS columnas_incluidas
FROM sys.indexes i WHERE i.object_id = OBJECT_ID('dbo.WorkOrderRecords') AND i.index_id > 0;
