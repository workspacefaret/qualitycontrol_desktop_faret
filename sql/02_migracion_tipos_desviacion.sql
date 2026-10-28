-- =====================================================================================
-- 02_migracion_tipos_desviacion.sql  (v2, 28-10-2026)
-- Consolida 5 tipos de desviacion historicos de NC INTERNAS, UNA empresa por ejecucion.
--
-- Solo modifica no_conformidades.categoria_defecto, solo en ambito='INTERNA' y solo para las
-- 5 equivalencias autorizadas. No borra ni cambia ningun otro campo, estado ni catalogo.
-- Excluidas a proposito (NO se tocan): "Color / GMG / Muestras", "Perfil no indicado en NV / carpeta", "Otro".
--
-- Uso (sqlcmd, una empresa por vez):
--   sqlcmd -S 192.168.1.230 -d calidad_db -E -f 65001 -b -W -v Empresa=FARET DryRun=1 Autorizado=NINGUNO -i 02_...sql
--   Para aplicar: DryRun=0 y Autorizado="Nombre de quien autoriza"
--
-- Garantias:
--  * DryRun=1 => TODO (incluida la tabla de respaldo) ocurre dentro de la transaccion y se revierte con ROLLBACK.
--  * La seleccion de filas usa UPDLOCK+HOLDLOCK: nadie puede cambiar/insertar filas del alcance hasta el COMMIT/ROLLBACK.
--  * Debe coincidir exactamente con el conteo auditado por empresa y equivalencia; si los datos cambiaron, aborta.
--  * Idempotente: si ya se aplico, informa "YA APLICADO" y no hace nada.
--  * Respaldo por id en dbo.nc_tipo_desviacion_migracion; reversion con 03_rollback_...sql.
-- =====================================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET LOCK_TIMEOUT 15000;

DECLARE @DryRun        BIT           = $(DryRun);
DECLARE @Empresa       NVARCHAR(10)  = N'$(Empresa)';
DECLARE @AutorizadoPor NVARCHAR(100) = N'$(Autorizado)';
DECLARE @Lote          NVARCHAR(60)  = N'Consolidacion tipos NC Internas 2026-10-28';

-- ---- Las 5 equivalencias autorizadas ----
DECLARE @Map TABLE (viejo NVARCHAR(150) NOT NULL PRIMARY KEY, nuevo NVARCHAR(150) NOT NULL);
INSERT INTO @Map (viejo, nuevo) VALUES
 (N'Código SAP / arte incorrecto',       N'Código SAP/Perfil'),
 (N'Información incompleta en carpeta',  N'Información incompleta en la carpeta'),
 (N'Barniz / Folia / Serigrafía',        N'Barniz/Folia/Serigrafía'),
 (N'Cambio de máquina / Planificación',  N'Cambio de máquina/planificación'),
 (N'Troquel / MFG no coincide',          N'Troquel/MFG');

-- ---- Conteos auditados (incluyen eliminadas; INNPACK incluye empresa NULL) ----
DECLARE @Esperado TABLE (empresa NVARCHAR(10) NOT NULL, viejo NVARCHAR(150) NOT NULL, filas INT NOT NULL, PRIMARY KEY (empresa, viejo));
INSERT INTO @Esperado (empresa, viejo, filas) VALUES
 (N'FARET',   N'Código SAP / arte incorrecto',       12),
 (N'FARET',   N'Información incompleta en carpeta',   5),
 (N'FARET',   N'Barniz / Folia / Serigrafía',        11),
 (N'FARET',   N'Cambio de máquina / Planificación',   3),
 (N'FARET',   N'Troquel / MFG no coincide',          15),
 (N'INNPACK', N'Código SAP / arte incorrecto',       10),
 (N'INNPACK', N'Información incompleta en carpeta',   1),
 (N'INNPACK', N'Barniz / Folia / Serigrafía',         6),
 (N'INNPACK', N'Cambio de máquina / Planificación',   1),
 (N'INNPACK', N'Troquel / MFG no coincide',           5);

-- ---- Controles previos (abortan antes de abrir la transaccion) ----
IF @Empresa NOT IN (N'FARET', N'INNPACK') THROW 50101, 'Empresa invalida: use FARET o INNPACK.', 1;
IF @DryRun = 0 AND (LTRIM(RTRIM(@AutorizadoPor)) IN (N'', N'NINGUNO')) THROW 50102, 'Para aplicar (DryRun=0) indique Autorizado=<nombre>.', 1;
IF (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'no_conformidades'
      AND COLUMN_NAME IN ('id', 'ambito', 'empresa', 'categoria_defecto', 'eliminado')) <> 5
    THROW 50104, 'Faltan columnas esperadas en no_conformidades.', 1;
IF (SELECT COUNT(*) FROM @Map m JOIN dbo.cat_nci_tipos_desviacion c ON c.nombre = m.nuevo AND c.activo = 1) <> 5
    THROW 50103, 'Las 5 categorias destino deben existir y estar activas en cat_nci_tipos_desviacion.', 1;

BEGIN TRAN;

-- Respaldo: se crea DENTRO de la transaccion (DDL transaccional), asi un DryRun no deja nada.
IF OBJECT_ID(N'dbo.nc_tipo_desviacion_migracion', N'U') IS NULL
    CREATE TABLE dbo.nc_tipo_desviacion_migracion (
        id_mig             INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_nc_tipo_desviacion_migracion PRIMARY KEY,
        nc_id              INT           NOT NULL,
        empresa            NVARCHAR(10)  NOT NULL,
        categoria_anterior NVARCHAR(150) NOT NULL,
        categoria_nueva    NVARCHAR(150) NOT NULL,
        eliminado          INT           NULL,
        lote               NVARCHAR(60)  NOT NULL,
        autorizado_por     NVARCHAR(100) NULL,
        fecha              DATETIME2     NOT NULL CONSTRAINT DF_nc_tipo_desviacion_migracion_fecha DEFAULT SYSDATETIME()
    );

-- Alcance bloqueado (UPDLOCK + HOLDLOCK): ambito INTERNA + empresa + nombre antiguo autorizado
DECLARE @Alcance TABLE (id INT NOT NULL PRIMARY KEY, viejo NVARCHAR(150) NOT NULL, nuevo NVARCHAR(150) NOT NULL, eliminado INT NULL);
INSERT INTO @Alcance (id, viejo, nuevo, eliminado)
SELECT n.id, n.categoria_defecto, m.nuevo, n.eliminado
FROM dbo.no_conformidades n WITH (UPDLOCK, HOLDLOCK)
JOIN @Map m ON m.viejo = n.categoria_defecto
WHERE n.ambito = N'INTERNA'
  AND ((@Empresa = N'INNPACK' AND (n.empresa = N'INNPACK' OR n.empresa IS NULL)) OR (@Empresa = N'FARET' AND n.empresa = N'FARET'));
DECLARE @NAlcance INT = (SELECT COUNT(*) FROM @Alcance);

-- Idempotencia: sin filas por migrar y respaldo previo de este lote/empresa => ya aplicado
IF @NAlcance = 0 AND OBJECT_ID(N'dbo.nc_tipo_desviacion_migracion', N'U') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.nc_tipo_desviacion_migracion WHERE lote = @Lote AND empresa = @Empresa)
BEGIN
    ROLLBACK TRAN;
    SELECT N'YA APLICADO: no hay nada que migrar para ' + @Empresa AS resultado;
    RETURN;
END;

-- Debe coincidir exactamente con lo auditado
IF EXISTS (SELECT 1 FROM @Esperado e
           WHERE e.empresa = @Empresa AND e.filas <> (SELECT COUNT(*) FROM @Alcance a WHERE a.viejo = e.viejo))
    THROW 50121, 'El conteo por equivalencia no coincide con lo auditado. No se aplica: re-auditar.', 1;

-- Fotografia previa de la empresa (para comparar al final)
DECLARE @TotalAntes INT = (SELECT COUNT(*) FROM dbo.no_conformidades WHERE ambito = N'INTERNA'
    AND ((@Empresa = N'INNPACK' AND (empresa = N'INNPACK' OR empresa IS NULL)) OR (@Empresa = N'FARET' AND empresa = N'FARET')));
DECLARE @ElimAntes INT = (SELECT COUNT(*) FROM dbo.no_conformidades WHERE ambito = N'INTERNA' AND eliminado <> 0
    AND ((@Empresa = N'INNPACK' AND (empresa = N'INNPACK' OR empresa IS NULL)) OR (@Empresa = N'FARET' AND empresa = N'FARET')));

SELECT N'ALCANCE' AS informe, @Empresa AS empresa, a.viejo, a.nuevo, COUNT(*) AS registros,
       SUM(CASE WHEN a.eliminado <> 0 THEN 1 ELSE 0 END) AS eliminadas
FROM @Alcance a GROUP BY a.viejo, a.nuevo ORDER BY registros DESC;

-- 1) Respaldo por id
INSERT INTO dbo.nc_tipo_desviacion_migracion (nc_id, empresa, categoria_anterior, categoria_nueva, eliminado, lote, autorizado_por)
SELECT a.id, @Empresa, a.viejo, a.nuevo, a.eliminado, @Lote, @AutorizadoPor FROM @Alcance a;
DECLARE @NRespaldo INT = @@ROWCOUNT;

-- 2) Unico UPDATE: solo categoria_defecto
UPDATE n SET n.categoria_defecto = a.nuevo
FROM dbo.no_conformidades n
JOIN @Alcance a ON a.id = n.id AND n.categoria_defecto = a.viejo AND n.ambito = N'INTERNA';
DECLARE @NCambiadas INT = @@ROWCOUNT;

-- ---- Controles posteriores (cualquier fallo => ROLLBACK automatico por XACT_ABORT) ----
IF @NRespaldo <> @NAlcance OR @NCambiadas <> @NAlcance THROW 50111, 'Respaldo o filas cambiadas distintas del alcance.', 1;
IF @TotalAntes <> (SELECT COUNT(*) FROM dbo.no_conformidades WHERE ambito = N'INTERNA'
        AND ((@Empresa = N'INNPACK' AND (empresa = N'INNPACK' OR empresa IS NULL)) OR (@Empresa = N'FARET' AND empresa = N'FARET')))
    THROW 50112, 'El total de NC internas cambio.', 1;
IF @ElimAntes <> (SELECT COUNT(*) FROM dbo.no_conformidades WHERE ambito = N'INTERNA' AND eliminado <> 0
        AND ((@Empresa = N'INNPACK' AND (empresa = N'INNPACK' OR empresa IS NULL)) OR (@Empresa = N'FARET' AND empresa = N'FARET')))
    THROW 50114, 'La cantidad de eliminadas cambio.', 1;
IF EXISTS (SELECT 1 FROM @Alcance a JOIN dbo.no_conformidades n ON n.id = a.id WHERE n.categoria_defecto <> a.nuevo)
    THROW 50113, 'Alguna fila no quedo con la categoria destino.', 1;
IF EXISTS (SELECT 1 FROM dbo.no_conformidades n JOIN @Map m ON m.viejo = n.categoria_defecto
           WHERE n.ambito = N'INTERNA'
             AND ((@Empresa = N'INNPACK' AND (n.empresa = N'INNPACK' OR n.empresa IS NULL)) OR (@Empresa = N'FARET' AND n.empresa = N'FARET')))
    THROW 50115, 'Quedan nombres antiguos autorizados sin migrar.', 1;

SELECT N'CONTROL' AS informe, @Empresa AS empresa, @TotalAntes AS total_nc_antes_y_despues, @ElimAntes AS eliminadas_antes_y_despues,
       @NAlcance AS alcance, @NRespaldo AS filas_respaldadas, @NCambiadas AS filas_cambiadas;
SELECT N'PARETO DESPUES (no eliminadas)' AS informe, categoria_defecto, COUNT(*) AS frecuencia
FROM dbo.no_conformidades
WHERE ambito = N'INTERNA' AND eliminado = 0
  AND ((@Empresa = N'INNPACK' AND (empresa = N'INNPACK' OR empresa IS NULL)) OR (@Empresa = N'FARET' AND empresa = N'FARET'))
GROUP BY categoria_defecto ORDER BY frecuencia DESC, categoria_defecto;

IF @DryRun = 1
BEGIN
    ROLLBACK TRAN;
    SELECT N'SIMULACRO (DryRun=1): ROLLBACK completo, nada persistio (ni siquiera la tabla de respaldo).' AS resultado;
END
ELSE
BEGIN
    COMMIT TRAN;
    SELECT N'APLICADO a ' + @Empresa + N' por ' + @AutorizadoPor AS resultado;
END;
