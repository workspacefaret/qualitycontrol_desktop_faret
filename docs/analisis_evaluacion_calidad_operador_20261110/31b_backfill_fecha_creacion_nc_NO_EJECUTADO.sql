-- Fase 31/32 — nc_no_conformidades.fecha_creacion (mejora_continua_db, SQL Server, DATETIME2(0) NULL)
-- NO EJECUTADO. Lo ejecuta el DBA con una cuenta autorizada, en este orden:
--   0) Desplegar ANTES la API Mejora Continua con el fix (INSERT con fecha_creacion = GETDATE()).
--      Si no, las NC nuevas siguen naciendo en NULL y el conteo de la guarda cambia.
--   1) Diagnóstico (solo lectura).
--   2) Recomendado: DEFAULT para la columna (mismo patrón que las 4 columnas corregidas el 08-09-2026).
--   3) Filas históricas: por defecto NO se inventan fechas (opción A). La opción B solo con decisión escrita de Calidad.
--
-- Auditoría Fase 32 (11-11-2026, GET públicos de la API, sin escribir nada):
--   * 67 NC sin fecha_creacion (ids 338..405; el 345 no existe). Todas DATA_FARET.
--   * Última NC con fecha real: id 336 = 2026-09-02 09:32:02 (cota inferior verificable).
--   * Ninguna de las 67 tiene seguimiento; solo 1 tiene fecha_cierre. Para 64 no hay cota superior.
--   * fecha_deteccion la escribe el usuario (fecha de ingreso de la PNC): NO es la hora de creación.
--     Prueba: 1 NC tiene detección 2026-09-01, anterior a la cota inferior. No es un dato verificable.
--   Conclusión: no existe fecha histórica confiable para estas 67 filas. Quedan NULL (opción A) y el Inicio
--   las muestra con su fecha de detección y un aviso explícito ("N NC no tienen fecha de creación...").

SET XACT_ABORT ON;
SET NOCOUNT ON;

-- 1) Diagnóstico (solo lectura) -------------------------------------------------------------------
SELECT COUNT(*) AS sin_fecha_creacion, MIN(id) AS id_min, MAX(id) AS id_max
FROM dbo.nc_no_conformidades
WHERE fecha_creacion IS NULL;

SELECT dc.name AS default_actual
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.nc_no_conformidades') AND c.name = N'fecha_creacion';
-- Esperado al 11-11-2026: 67 / 338 / 405 y ninguna fila de DEFAULT.

-- 2) Recomendado (DDL, requiere permiso ALTER): DEFAULT para futuras inserciones -----------------
--    Protege aunque otra versión de la API (o un INSERT manual) omita la columna. No toca filas existentes.
-- BEGIN TRANSACTION;
-- IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc JOIN sys.columns c
--                ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
--                WHERE dc.parent_object_id = OBJECT_ID(N'dbo.nc_no_conformidades') AND c.name = N'fecha_creacion')
--     ALTER TABLE dbo.nc_no_conformidades
--         ADD CONSTRAINT DF_nc_no_conformidades_fecha_creacion DEFAULT (GETDATE()) FOR fecha_creacion;
-- COMMIT TRANSACTION;
-- Rollback:  ALTER TABLE dbo.nc_no_conformidades DROP CONSTRAINT DF_nc_no_conformidades_fecha_creacion;

-- 3A) Filas históricas — OPCIÓN A (recomendada): no modificar. ------------------------------------
--     Las 67 quedan NULL: es la verdad (fecha desconocida). Nada que ejecutar.

-- 3B) OPCIÓN B (solo con decisión escrita de Calidad): copiar fecha_deteccion como APROXIMACIÓN. ---
--     Advertencia: deja de distinguirse "fecha real" de "aproximada". No usar fecha actual.
--     Respaldo -> transacción con guarda -> verificación -> COMMIT manual. Rollback desde el respaldo.
/*
IF OBJECT_ID(N'dbo.bk_nc_fecha_creacion_20261111') IS NOT NULL
    THROW 50001, 'El respaldo ya existe: revisar antes de continuar.', 1;

SELECT id, fecha_creacion, fecha_deteccion, SYSDATETIME() AS respaldado_en
INTO dbo.bk_nc_fecha_creacion_20261111
FROM dbo.nc_no_conformidades
WHERE fecha_creacion IS NULL;

SELECT COUNT(*) AS filas_respaldadas FROM dbo.bk_nc_fecha_creacion_20261111;   -- esperado: 67

BEGIN TRANSACTION;

UPDATE nc
SET nc.fecha_creacion = CAST(nc.fecha_deteccion AS DATETIME2(0))
FROM dbo.nc_no_conformidades nc
JOIN dbo.bk_nc_fecha_creacion_20261111 bk ON bk.id = nc.id
WHERE nc.fecha_creacion IS NULL            -- nunca toca fechas válidas
  AND nc.fecha_deteccion IS NOT NULL;

DECLARE @filas INT = @@ROWCOUNT;
SELECT @filas AS filas_actualizadas;
IF @filas <> (SELECT COUNT(*) FROM dbo.bk_nc_fecha_creacion_20261111 WHERE fecha_deteccion IS NOT NULL)
BEGIN
    ROLLBACK TRANSACTION;
    THROW 50002, 'Filas actualizadas distintas del respaldo: ROLLBACK.', 1;
END

-- Verificación dentro de la transacción: solo cambiaron las filas respaldadas.
SELECT COUNT(*) AS sin_fecha_restantes FROM dbo.nc_no_conformidades WHERE fecha_creacion IS NULL;
-- Si es lo esperado:  COMMIT TRANSACTION;     Si no:  ROLLBACK TRANSACTION;
*/

-- Rollback de la opción B (después de un COMMIT):
/*
BEGIN TRANSACTION;
UPDATE nc SET nc.fecha_creacion = bk.fecha_creacion        -- vuelve a NULL
FROM dbo.nc_no_conformidades nc JOIN dbo.bk_nc_fecha_creacion_20261111 bk ON bk.id = nc.id;
SELECT @@ROWCOUNT AS filas_revertidas;                     -- esperado: 67
-- COMMIT TRANSACTION;   (o ROLLBACK TRANSACTION)
*/
