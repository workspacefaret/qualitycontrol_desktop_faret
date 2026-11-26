/* SOLO LECTURA. Ejecutar CONECTADO CON EL LOGIN QUE SE VA A PROBAR (no como administrador).
   Muestra la identidad y los permisos EFECTIVOS en FPS y al otro lado de CONEXIONSAP. No escribe nada.
   Compatible con SQL Server 2016. */
SET NOCOUNT ON;

PRINT '--- 1. Identidad en FPS (esperado: el login probado y todos los roles en 0)';
SELECT @@SERVERNAME AS servidor, SUSER_SNAME() AS login, DB_NAME() AS base,
       IS_SRVROLEMEMBER('sysadmin') AS sysadmin, IS_SRVROLEMEMBER('securityadmin') AS securityadmin,
       IS_SRVROLEMEMBER('serveradmin') AS serveradmin, IS_SRVROLEMEMBER('dbcreator') AS dbcreator,
       IS_ROLEMEMBER('db_owner') AS db_owner, IS_ROLEMEMBER('db_datawriter') AS db_datawriter;

PRINT '--- 2. Permisos efectivos de escritura en la base (esperado: todos en 0)';
SELECT p.permiso, HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', p.permiso) AS tiene
FROM (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('ALTER'), ('CONTROL'), ('EXECUTE'), ('CREATE TABLE')) p(permiso);

PRINT '--- 3. Tablas con escritura efectiva (esperado: 0)';
SELECT COUNT(*) AS tablas_escribibles FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE HAS_PERMS_BY_NAME(QUOTENAME(s.name) + '.' + QUOTENAME(t.name), 'OBJECT', 'INSERT') = 1
   OR HAS_PERMS_BY_NAME(QUOTENAME(s.name) + '.' + QUOTENAME(t.name), 'OBJECT', 'UPDATE') = 1
   OR HAS_PERMS_BY_NAME(QUOTENAME(s.name) + '.' + QUOTENAME(t.name), 'OBJECT', 'DELETE') = 1;

PRINT '--- 4. Lectura de los objetos que usa la trazabilidad (esperado: todos en 1)';
SELECT n.nombre, HAS_PERMS_BY_NAME('dbo.' + n.nombre, 'OBJECT', 'SELECT') AS puede_leer
FROM (VALUES ('ZZZMasterOT'), ('ZZZProcesosProductivos'), ('ZZZListaProcesos'), ('ZZZProcesosWeb'), ('WorkOrderRecords'),
             ('ZZZListaMaquina'), ('ZZZProcessControlResults'), ('DM_ControlForm'), ('DM_ProcessControl'),
             ('ETIQUETAS_PRODUCCIONES')) n(nombre);
SELECT 'ZZZUsuarios (ID, Nombre_Comp)' AS nombre,
       HAS_PERMS_BY_NAME('dbo.ZZZUsuarios', 'OBJECT', 'SELECT', 'ID', 'COLUMN') AS lee_id,
       HAS_PERMS_BY_NAME('dbo.ZZZUsuarios', 'OBJECT', 'SELECT', 'Nombre_Comp', 'COLUMN') AS lee_nombre,
       HAS_PERMS_BY_NAME('dbo.ZZZUsuarios', 'OBJECT', 'SELECT') AS lee_tabla_completa;

PRINT '--- 5. Identidad al otro lado de CONEXIONSAP (esperado: pblectura u otro sin escritura; NUNCA sa)';
SELECT * FROM OPENQUERY(CONEXIONSAP,
 'SELECT @@SERVERNAME AS servidor, SUSER_SNAME() AS login, IS_SRVROLEMEMBER(''sysadmin'') AS sysadmin,
         IS_SRVROLEMEMBER(''securityadmin'') AS securityadmin, IS_SRVROLEMEMBER(''serveradmin'') AS serveradmin,
         IS_SRVROLEMEMBER(''dbcreator'') AS dbcreator');

PRINT '--- 6. Permisos efectivos de escritura al otro lado (esperado: todos en 0)';
SELECT * FROM OPENQUERY(CONEXIONSAP,
 'SELECT d.base, p.permiso, HAS_PERMS_BY_NAME(d.base, ''DATABASE'', p.permiso) AS tiene
  FROM (VALUES (''INNPACK_PRODUCCION''), (''FARET_PRODUCCION''), (''Faret_Control_Calidad'')) d(base)
  CROSS JOIN (VALUES (''INSERT''), (''UPDATE''), (''DELETE''), (''ALTER''), (''CONTROL''), (''EXECUTE''), (''CREATE TABLE'')) p(permiso)');

PRINT '--- 7. Tablas con escritura efectiva al otro lado, otorgada tabla por tabla (esperado: 0 en las tres bases)';
SELECT * FROM OPENQUERY(CONEXIONSAP,
 'SELECT ''INNPACK_PRODUCCION'' AS base, COUNT(*) AS tablas_escribibles
    FROM INNPACK_PRODUCCION.sys.tables t JOIN INNPACK_PRODUCCION.sys.schemas s ON s.schema_id = t.schema_id
   WHERE HAS_PERMS_BY_NAME(''INNPACK_PRODUCCION.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''INSERT'') = 1
      OR HAS_PERMS_BY_NAME(''INNPACK_PRODUCCION.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''UPDATE'') = 1
      OR HAS_PERMS_BY_NAME(''INNPACK_PRODUCCION.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''DELETE'') = 1
  UNION ALL
  SELECT ''FARET_PRODUCCION'', COUNT(*)
    FROM FARET_PRODUCCION.sys.tables t JOIN FARET_PRODUCCION.sys.schemas s ON s.schema_id = t.schema_id
   WHERE HAS_PERMS_BY_NAME(''FARET_PRODUCCION.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''INSERT'') = 1
      OR HAS_PERMS_BY_NAME(''FARET_PRODUCCION.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''UPDATE'') = 1
      OR HAS_PERMS_BY_NAME(''FARET_PRODUCCION.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''DELETE'') = 1
  UNION ALL
  SELECT ''Faret_Control_Calidad'', COUNT(*)
    FROM Faret_Control_Calidad.sys.tables t JOIN Faret_Control_Calidad.sys.schemas s ON s.schema_id = t.schema_id
   WHERE HAS_PERMS_BY_NAME(''Faret_Control_Calidad.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''INSERT'') = 1
      OR HAS_PERMS_BY_NAME(''Faret_Control_Calidad.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''UPDATE'') = 1
      OR HAS_PERMS_BY_NAME(''Faret_Control_Calidad.'' + QUOTENAME(s.name) + ''.'' + QUOTENAME(t.name), ''OBJECT'', ''DELETE'') = 1');
