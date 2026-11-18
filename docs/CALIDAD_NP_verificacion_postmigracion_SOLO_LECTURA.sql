-- VERIFICACION POSTERIOR (solo lectura) - Trazabilidad 1b + Calidad NP en calidad_db. No modifica nada.
USE calidad_db;
SET NOCOUNT ON;
DECLARE @fallos INT = 0;

-- 1) Tablas y secuencia esperadas (11 tablas + 1 secuencia)
SELECT 'TABLA' AS tipo, v.n AS objeto, CASE WHEN o.object_id IS NULL THEN 'FALTA' ELSE 'OK' END AS estado
FROM (VALUES ('trazabilidad_doc_requisito'),('trazabilidad_documento'),('trazabilidad_factor_item'),('trazabilidad_auditoria'),
             ('np_informe'),('np_merma'),('np_cierre'),('cert_destruccion'),('cert_destruccion_detalle'),('cert_destruccion_flujo'),('cert_destruccion_aprobacion')) v(n)
LEFT JOIN sys.tables o ON o.name = v.n AND o.schema_id = SCHEMA_ID('dbo');
SELECT 'SECUENCIA' AS tipo, 'seq_cert_destruccion' AS objeto, CASE WHEN EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_cert_destruccion') THEN 'OK' ELSE 'FALTA' END AS estado;

-- 2) Semillas esperadas: requisitos = 23, flujo = 3; tablas operativas vacias (no se ha usado nada)
SELECT 'requisitos (esperado 23)' AS dato, COUNT(*) AS valor FROM dbo.trazabilidad_doc_requisito
UNION ALL SELECT 'flujo certificado (esperado 3)', COUNT(*) FROM dbo.cert_destruccion_flujo
UNION ALL SELECT 'filas en np_merma/np_cierre/np_informe/cert_destruccion (esperado 0)',
   (SELECT COUNT(*) FROM dbo.np_merma)+(SELECT COUNT(*) FROM dbo.np_cierre)+(SELECT COUNT(*) FROM dbo.np_informe)+(SELECT COUNT(*) FROM dbo.cert_destruccion)
UNION ALL SELECT 'secuencia: valores consumidos (esperado 0)', COUNT(*) FROM sys.sequences WHERE name='seq_cert_destruccion' AND last_used_value IS NOT NULL;

-- 3) Integridad: claves foraneas (esperadas 4) y que ninguna quede no confiable/deshabilitada; PK por tabla
SELECT OBJECT_NAME(parent_object_id) AS tabla, name AS fk, is_disabled, is_not_trusted FROM sys.foreign_keys
WHERE name IN ('FK_trazabilidad_documento_requisito','FK_cert_destruccion_detalle_cert','FK_cert_destruccion_detalle_merma','FK_cert_destruccion_aprobacion_cert');
SELECT t.name AS tabla_sin_pk FROM sys.tables t
WHERE t.name IN ('trazabilidad_doc_requisito','trazabilidad_documento','trazabilidad_factor_item','trazabilidad_auditoria','np_informe','np_merma','np_cierre','cert_destruccion','cert_destruccion_detalle','cert_destruccion_flujo','cert_destruccion_aprobacion')
  AND NOT EXISTS (SELECT 1 FROM sys.indexes i WHERE i.object_id = t.object_id AND i.is_primary_key = 1);

-- 4) Permisos efectivos de qcc_innpack_api_sql (esperados vs reales). Devuelve SOLO lo que falta o sobra.
DECLARE @p TABLE (objeto SYSNAME COLLATE DATABASE_DEFAULT, permiso NVARCHAR(30) COLLATE DATABASE_DEFAULT);
INSERT @p VALUES
 ('trazabilidad_doc_requisito','SELECT'),('trazabilidad_doc_requisito','INSERT'),('trazabilidad_doc_requisito','UPDATE'),
 ('trazabilidad_documento','SELECT'),('trazabilidad_documento','INSERT'),('trazabilidad_documento','UPDATE'),
 ('trazabilidad_factor_item','SELECT'),('trazabilidad_factor_item','INSERT'),('trazabilidad_factor_item','UPDATE'),
 ('trazabilidad_auditoria','SELECT'),('trazabilidad_auditoria','INSERT'),
 ('np_informe','SELECT'),('np_informe','INSERT'),
 ('np_merma','SELECT'),('np_merma','INSERT'),('np_merma','UPDATE'),
 ('np_cierre','SELECT'),('np_cierre','INSERT'),
 ('cert_destruccion','SELECT'),('cert_destruccion','INSERT'),('cert_destruccion','UPDATE'),
 ('cert_destruccion_detalle','SELECT'),('cert_destruccion_detalle','INSERT'),('cert_destruccion_detalle','UPDATE'),('cert_destruccion_detalle','DELETE'),
 ('cert_destruccion_aprobacion','SELECT'),('cert_destruccion_aprobacion','INSERT'),('cert_destruccion_aprobacion','UPDATE'),
 ('cert_destruccion_flujo','SELECT'),('cert_destruccion_flujo','INSERT'),('cert_destruccion_flujo','UPDATE'),
 ('seq_cert_destruccion','UPDATE');
SELECT 'FALTA' AS diferencia, e.objeto, e.permiso FROM @p e
WHERE NOT EXISTS (SELECT 1 FROM sys.database_permissions dp JOIN sys.all_objects o ON o.object_id = dp.major_id
                  WHERE dp.grantee_principal_id = DATABASE_PRINCIPAL_ID('qcc_innpack_api_sql') AND dp.state IN ('G','W') AND o.name = e.objeto COLLATE DATABASE_DEFAULT AND dp.permission_name COLLATE DATABASE_DEFAULT = e.permiso)
UNION ALL
SELECT 'SOBRA', o.name COLLATE DATABASE_DEFAULT, dp.permission_name COLLATE DATABASE_DEFAULT FROM sys.database_permissions dp JOIN sys.all_objects o ON o.object_id = dp.major_id
WHERE dp.grantee_principal_id = DATABASE_PRINCIPAL_ID('qcc_innpack_api_sql') AND dp.class = 1 AND dp.state IN ('G','W')
  AND (o.name LIKE 'trazabilidad[_]%' OR o.name LIKE 'np[_]%' OR o.name LIKE 'cert[_]destruccion%' OR o.name = 'seq_cert_destruccion')
  AND NOT EXISTS (SELECT 1 FROM @p e WHERE e.objeto = o.name COLLATE DATABASE_DEFAULT AND e.permiso = dp.permission_name COLLATE DATABASE_DEFAULT);

-- 5) Que no se hayan tocado otros objetos: todo lo creado hoy debe ser solo de estos modulos
SELECT name AS objeto_inesperado_creado_hoy, type_desc FROM sys.objects
WHERE create_date >= CAST(GETDATE() AS DATE) AND is_ms_shipped = 0 AND parent_object_id = 0
  AND name NOT LIKE 'trazabilidad[_]%' AND name NOT LIKE 'np[_]%' AND name NOT LIKE 'cert[_]destruccion%' AND name <> 'seq_cert_destruccion';
