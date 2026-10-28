-- =====================================================================================
-- 03_rollback_migracion_tipos_desviacion.sql  (v2, 28-10-2026)
-- Revierte por id lo respaldado por el script 02, una empresa por ejecucion.
-- Solo restaura categoria_defecto y solo si el valor sigue siendo el migrado (no pisa ediciones posteriores).
-- Conserva la tabla de respaldo como evidencia. Idempotente (una 2a ejecucion restaura 0).
--   sqlcmd -S 192.168.1.230 -d calidad_db -E -f 65001 -b -W -v Empresa=FARET DryRun=1 -i 03_...sql
-- =====================================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET LOCK_TIMEOUT 15000;

DECLARE @DryRun  BIT          = $(DryRun);
DECLARE @Empresa NVARCHAR(10) = N'$(Empresa)';
DECLARE @Lote    NVARCHAR(60) = N'Consolidacion tipos NC Internas 2026-10-28';

IF @Empresa NOT IN (N'FARET', N'INNPACK') THROW 50201, 'Empresa invalida: use FARET o INNPACK.', 1;
IF OBJECT_ID(N'dbo.nc_tipo_desviacion_migracion', N'U') IS NULL THROW 50202, 'No existe la tabla de respaldo: no hay nada que revertir.', 1;

BEGIN TRAN;

DECLARE @Resp INT = (SELECT COUNT(*) FROM dbo.nc_tipo_desviacion_migracion WHERE lote = @Lote AND empresa = @Empresa);

UPDATE n SET n.categoria_defecto = b.categoria_anterior
FROM dbo.no_conformidades n WITH (UPDLOCK, HOLDLOCK)
JOIN dbo.nc_tipo_desviacion_migracion b ON b.nc_id = n.id AND b.lote = @Lote AND b.empresa = @Empresa
WHERE n.categoria_defecto = b.categoria_nueva AND n.ambito = N'INTERNA';
DECLARE @Revertidas INT = @@ROWCOUNT;

SELECT N'REVERSION' AS informe, @Empresa AS empresa, @Resp AS filas_respaldadas, @Revertidas AS revertidas,
       (SELECT COUNT(*) FROM dbo.nc_tipo_desviacion_migracion b JOIN dbo.no_conformidades n ON n.id = b.nc_id
         WHERE b.lote = @Lote AND b.empresa = @Empresa AND n.categoria_defecto NOT IN (b.categoria_anterior, b.categoria_nueva)) AS editadas_despues_no_tocadas;

IF @DryRun = 1
BEGIN
    ROLLBACK TRAN;
    SELECT N'SIMULACRO: ROLLBACK, nada revertido.' AS resultado;
END
ELSE
BEGIN
    COMMIT TRAN;
    SELECT N'REVERTIDO ' + @Empresa AS resultado;
END;
