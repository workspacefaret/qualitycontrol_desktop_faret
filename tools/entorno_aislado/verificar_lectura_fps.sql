/* SOLO LECTURA (únicamente SELECT; no crea ni cambia nada). Ejecutar en SAP_NEW con autenticación Windows.
   Responde: ¿hay un login reutilizable para leer FPS sin escribir? y ¿con qué identidad cruzan CONEXIONSAP?
   No muestra claves ni hashes. Compatible con SQL Server 2016. */
SET NOCOUNT ON;

PRINT '--- 1. Identidad y servidor';
SELECT @@SERVERNAME AS servidor, CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(30)) AS version_sql,
       SUSER_SNAME() AS conectado_como, IS_SRVROLEMEMBER('sysadmin') AS es_sysadmin,
       IS_SRVROLEMEMBER('securityadmin') AS es_securityadmin,
       CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS int) AS solo_autenticacion_windows,
       CASE WHEN DB_ID('FPS_PRODUCCION') IS NULL THEN 'NO' ELSE 'SI' END AS existe_fps_produccion;

PRINT '--- 2. Servidores vinculados y con qué identidad entra cada login local';
SELECT s.name AS vinculado, s.data_source,
       CASE WHEN l.local_principal_id = 0 THEN '(TODOS: mapeo por defecto)' ELSE SUSER_NAME(l.local_principal_id) END AS login_local,
       l.uses_self_credential AS usa_su_propia_identidad, l.remote_name AS usuario_remoto
FROM sys.servers s INNER JOIN sys.linked_logins l ON l.server_id = s.server_id
WHERE s.is_linked = 1
ORDER BY s.name, l.local_principal_id;

PRINT '--- 3. Logins habilitados SIN roles de servidor que tienen usuario en FPS_PRODUCCION (candidatos)';
SELECT sp.name AS login, sp.type_desc, dp.name AS usuario_fps,
       STUFF((SELECT ', ' + r.name FROM FPS_PRODUCCION.sys.database_role_members m
              INNER JOIN FPS_PRODUCCION.sys.database_principals r ON r.principal_id = m.role_principal_id
              WHERE m.member_principal_id = dp.principal_id FOR XML PATH('')), 1, 2, '') AS roles_en_fps,
       (SELECT COUNT(*) FROM FPS_PRODUCCION.sys.database_permissions p
         WHERE p.grantee_principal_id = dp.principal_id AND p.state IN ('G', 'W')
           AND p.permission_name NOT IN ('CONNECT', 'SELECT', 'VIEW DEFINITION')) AS permisos_distintos_de_lectura,
       CASE WHEN EXISTS (SELECT 1 FROM sys.linked_logins l INNER JOIN sys.servers s ON s.server_id = l.server_id
                         WHERE s.name = 'CONEXIONSAP' AND l.local_principal_id = sp.principal_id)
            THEN 'propio' ELSE 'hereda el mapeo por defecto' END AS mapeo_conexionsap
FROM sys.server_principals sp
INNER JOIN FPS_PRODUCCION.sys.database_principals dp ON dp.sid = sp.sid
WHERE sp.type IN ('S', 'U', 'G') AND sp.is_disabled = 0
  AND NOT EXISTS (SELECT 1 FROM sys.server_role_members m WHERE m.member_principal_id = sp.principal_id)
ORDER BY sp.name;

PRINT '--- 4. Permisos de escritura que cualquiera hereda por el rol public en FPS_PRODUCCION';
SELECT p.permission_name, p.state_desc, COUNT(*) AS veces
FROM FPS_PRODUCCION.sys.database_permissions p
INNER JOIN FPS_PRODUCCION.sys.database_principals r ON r.principal_id = p.grantee_principal_id
WHERE r.name = 'public' AND p.permission_name IN ('INSERT', 'UPDATE', 'DELETE', 'ALTER', 'CONTROL', 'EXECUTE')
  AND (p.class = 0 OR (p.class = 1 AND p.major_id > 0
       AND EXISTS (SELECT 1 FROM FPS_PRODUCCION.sys.objects o WHERE o.object_id = p.major_id AND o.is_ms_shipped = 0)))
GROUP BY p.permission_name, p.state_desc;

PRINT '--- 5. Objetos de FPS que usa la consulta (tipo; una vista podría leer otra base)';
SELECT n.nombre, ISNULL(o.type_desc, 'NO EXISTE') AS tipo
FROM (VALUES ('ZZZMasterOT'), ('ZZZProcesosProductivos'), ('ZZZListaProcesos'), ('ZZZProcesosWeb'), ('WorkOrderRecords'),
             ('ZZZListaMaquina'), ('ZZZUsuarios'), ('ZZZProcessControlResults'), ('DM_ControlForm'),
             ('DM_ProcessControl'), ('ETIQUETAS_PRODUCCIONES')) n(nombre)
LEFT JOIN FPS_PRODUCCION.sys.objects o ON o.name = n.nombre AND o.schema_id = 1
ORDER BY n.nombre;
