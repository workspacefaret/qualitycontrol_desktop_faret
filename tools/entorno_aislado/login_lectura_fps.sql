/* Login de SOLO LECTURA para las pruebas aisladas con datos reales (fps-api local --fps reales).
   SE EJECUTA EN EL SERVIDOR SQL DE FPS (no en SAP). Es un cambio de seguridad en un servidor productivo:
   lo revisa y ejecuta la persona autorizada (AD\Administrador). No ejecutar si ya existe un login equivalente.
   LÍMITE CONOCIDO: el 25-11 se comprobó que desde SAP-B1, con pblectura, CONEXIONFPS entra a SAP_NEW como sa. Mientras
   ese mapeo exista, quien envíe consultas libres podría volver por él con privilegios. La fps-api solo envía consultas
   fijas, pero este login no corrige ese riesgo: debe revisarlo el DBA (ver verificar_lectura_fps.sql, punto 2).
   Antes de ejecutar, reemplazar SOLO en la ventana (no guardar el archivo con claves):
     <<CLAVE_NUEVA>>      clave del login nuevo
     <<CLAVE_PBLECTURA>>  clave del usuario SAP de solo lectura pblectura
   Reversa al final del archivo. Compatible con SQL Server 2016. */
USE [master];
SET NOCOUNT ON;
SET NOEXEC OFF;

IF N'<<CLAVE_NUEVA>>' LIKE N'<<%' OR N'<<CLAVE_PBLECTURA>>' LIKE N'<<%'
BEGIN
    RAISERROR(N'Faltan las claves: no se ejecuta nada.', 16, 1);
    SET NOEXEC ON;
END
IF DB_ID(N'FPS_PRODUCCION') IS NULL OR NOT EXISTS (SELECT 1 FROM sys.servers WHERE name = N'CONEXIONSAP' AND is_linked = 1)
BEGIN
    RAISERROR(N'Este no es el servidor de FPS (falta FPS_PRODUCCION o el vinculado CONEXIONSAP).', 16, 1);
    SET NOEXEC ON;
END
IF SUSER_ID(N'qcc_lectura') IS NOT NULL
BEGIN
    RAISERROR(N'El login qcc_lectura ya existe: revisar antes de continuar.', 16, 1);
    SET NOEXEC ON;
END
GO
CREATE LOGIN [qcc_lectura] WITH PASSWORD = N'<<CLAVE_NUEVA>>', CHECK_POLICY = ON, DEFAULT_DATABASE = [FPS_PRODUCCION];
-- Al otro lado de CONEXIONSAP, este login entra como el usuario SAP de solo lectura (nunca con el mapeo general).
EXEC sp_addlinkedsrvlogin @rmtsrvname = N'CONEXIONSAP', @useself = N'false', @locallogin = N'qcc_lectura',
     @rmtuser = N'pblectura', @rmtpassword = N'<<CLAVE_PBLECTURA>>';
GO
USE [FPS_PRODUCCION];
GO
CREATE USER [qcc_lectura] FOR LOGIN [qcc_lectura];
-- Permisos mínimos: solo las tablas que lee la trazabilidad (no db_datareader).
GRANT SELECT ON dbo.ZZZMasterOT              TO [qcc_lectura];
GRANT SELECT ON dbo.ZZZProcesosProductivos   TO [qcc_lectura];
GRANT SELECT ON dbo.ZZZListaProcesos         TO [qcc_lectura];
GRANT SELECT ON dbo.ZZZProcesosWeb           TO [qcc_lectura];
GRANT SELECT ON dbo.WorkOrderRecords         TO [qcc_lectura];
GRANT SELECT ON dbo.ZZZListaMaquina          TO [qcc_lectura];
GRANT SELECT ON dbo.ZZZUsuarios (ID, Nombre_Comp) TO [qcc_lectura]; -- solo identificador y nombre
GRANT SELECT ON dbo.ZZZProcessControlResults TO [qcc_lectura];
GRANT SELECT ON dbo.DM_ControlForm           TO [qcc_lectura];
GRANT SELECT ON dbo.DM_ProcessControl        TO [qcc_lectura];
GRANT SELECT ON dbo.ETIQUETAS_PRODUCCIONES   TO [qcc_lectura];
-- Refuerzo: aunque "public" tuviera permisos, este usuario no puede escribir ni ejecutar procedimientos.
DENY INSERT, UPDATE, DELETE, ALTER, EXECUTE TO [qcc_lectura];
GO
SELECT N'qcc_lectura creado. La fps-api local vuelve a verificar los permisos antes de iniciar.' AS resultado;
GO
SET NOEXEC OFF;

/* REVERSA (al terminar las pruebas):
USE [FPS_PRODUCCION]; DROP USER [qcc_lectura];
USE [master]; EXEC sp_droplinkedsrvlogin @rmtsrvname = N'CONEXIONSAP', @locallogin = N'qcc_lectura'; DROP LOGIN [qcc_lectura];
*/
