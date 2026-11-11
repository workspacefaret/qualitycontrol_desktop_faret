/* PROPUESTA — NO EJECUTADO. Solo la ejecuta una persona autorizada (AD\Administrador). Servidor SAP_NEW (192.168.1.230), base FPS_PRODUCCION.
   Minimo necesario: lectura de UN catalogo de maquinas (sin datos personales) para la cuenta de solo lectura. Sin escritura, sin roles. */
USE FPS_PRODUCCION;
GO
-- 1) Existencia (solo lectura; si devuelve 0 filas, la tabla no existe con ese nombre y NO se debe conceder nada)
SELECT s.name AS esquema, o.name AS objeto FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.name = 'ZZZListaMaquina';
GO
-- 2) Permiso minimo
GRANT SELECT ON OBJECT::dbo.ZZZListaMaquina TO fps_historico_ro;
GO
-- 3) Verificacion (insert debe dar 0)
EXECUTE AS USER = 'fps_historico_ro';
SELECT HAS_PERMS_BY_NAME('dbo.ZZZListaMaquina','OBJECT','SELECT') AS sel, HAS_PERMS_BY_NAME('dbo.ZZZListaMaquina','OBJECT','INSERT') AS ins;
REVERT;
GO
-- Reversion: REVOKE SELECT ON OBJECT::dbo.ZZZListaMaquina FROM fps_historico_ro;
