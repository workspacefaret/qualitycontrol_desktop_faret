/* ============================================================================================
   Diagnóstico de SOLO LECTURA para el endpoint fps-api GET /api/produccion/sesiones-maquina
   Base: FPS_PRODUCCION. NO crea índices, NO modifica tablas, NO usa servidores enlazados.
   Ejecutar con una cuenta de solo lectura, FUERA del horario pico, un bloque a la vez, y
   compartir los resultados (no contienen nombres de personas).
   Orden: A (solo metadatos, no recorre la tabla) -> B (plan estimado, no ejecuta) -> C/D (recorren datos: solo si A/B lo permiten).
   ============================================================================================ */
SET NOCOUNT ON;
SET LOCK_TIMEOUT 5000;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

/* ---- A1. Filas aproximadas (metadatos; no recorre la tabla) ---- */
SELECT t.name AS tabla, SUM(ps.row_count) AS filas_aprox, SUM(ps.used_page_count) * 8 / 1024 AS mb_usados
FROM sys.dm_db_partition_stats ps
JOIN sys.tables t ON t.object_id = ps.object_id
WHERE t.name IN ('WorkOrderRecords','ZZZListaMaquina','ZZZUsuarios') AND ps.index_id IN (0,1)
GROUP BY t.name;

/* ---- A2. Índices de WorkOrderRecords y sus columnas (¿existe uno por ResourceKey y/o ProductionStartDate?) ---- */
SELECT i.name AS indice, i.type_desc, i.is_unique, i.is_primary_key,
       STUFF((SELECT ', ' + c.name + CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE '' END
              FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
              ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS columnas_clave,
       STUFF((SELECT ', ' + c.name
              FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
              FOR XML PATH('')), 1, 2, '') AS columnas_incluidas
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('dbo.WorkOrderRecords') AND i.index_id > 0;

/* ---- A3. Tipos de las columnas que usa la consulta ---- */
SELECT c.name, ty.name AS tipo, c.max_length, c.is_nullable
FROM sys.columns c JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.WorkOrderRecords')
  AND c.name IN ('RecordKey','WorkOrderKey','ResourceKey','UserKey','Status','SetupStartDate','ProductionStartDate','ProductionEndDate');

/* ---- B. Plan ESTIMADO de la consulta del endpoint (SHOWPLAN no ejecuta la consulta). Buscar "Index Seek" por ProductionStartDate/ResourceKey;
        un "Clustered Index Scan"/"Table Scan" de WorkOrderRecords significa que NO se debe desplegar sin un índice (decisión del DBA). ---- */
SET SHOWPLAN_XML ON;
GO
SELECT TOP (1001)
  R.RecordKey, R.WorkOrderKey, CAST(R.Status AS int), R.ResourceKey, R.UserKey,
  R.SetupStartDate, R.ProductionStartDate, R.ProductionEndDate
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
SET SHOWPLAN_XML OFF;
GO

/* ---- C. SOLO si A2/B muestran acceso por índice. Volumen total y de los últimos 92 días (recorren datos). ---- */
SELECT COUNT_BIG(*) AS filas_total, MIN(ProductionStartDate) AS primera, MAX(ProductionStartDate) AS ultima
FROM dbo.WorkOrderRecords OPTION (MAXDOP 1);

SELECT COUNT_BIG(*) AS filas_ultimos_92_dias
FROM dbo.WorkOrderRecords
WHERE ProductionStartDate >= DATEADD(DAY, -92, GETDATE()) OPTION (MAXDOP 1);

/* ---- D. Distribución por máquina y mes (últimos 12 meses; solo si C fue rápida). Sin datos de personas. ---- */
SELECT R.ResourceKey AS aplatz_id, m.bez AS maquina,
       CONVERT(char(7), R.ProductionStartDate, 120) AS mes,
       COUNT_BIG(*) AS sesiones,
       SUM(CASE WHEN R.ProductionEndDate IS NULL THEN 1 ELSE 0 END) AS sin_termino,
       SUM(CASE WHEN DATEDIFF(HOUR, R.ProductionStartDate, R.ProductionEndDate) > 16 THEN 1 ELSE 0 END) AS mas_de_16h
FROM dbo.WorkOrderRecords R
LEFT JOIN dbo.ZZZListaMaquina m ON m.aplatz_id = R.ResourceKey
WHERE R.ProductionStartDate >= DATEADD(MONTH, -12, GETDATE())
  AND R.ResourceKey IN (1,3,4,5,6,13,14,15,17,19,20,22,23,29,32,33,36,37,54,55,73,90)  -- máquinas con equivalencia verificada
GROUP BY R.ResourceKey, m.bez, CONVERT(char(7), R.ProductionStartDate, 120)
ORDER BY R.ResourceKey, mes
OPTION (MAXDOP 1);
