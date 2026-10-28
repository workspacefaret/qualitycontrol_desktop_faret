-- 01_auditoria_solo_lectura.sql  |  SOLO SELECT. Ejecutar en calidad_db (basta una cuenta con SELECT).
SET NOCOUNT ON;

-- A) Esquema real de la tabla y triggers que podrian reaccionar a un UPDATE
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'no_conformidades' ORDER BY ORDINAL_POSITION;
SELECT name AS trigger_en_no_conformidades, is_disabled FROM sys.triggers WHERE parent_id = OBJECT_ID('no_conformidades');

-- B) Catalogo de tipos (activos e inactivos)
SELECT nombre, activo, creado_por FROM cat_nci_tipos_desviacion ORDER BY activo DESC, nombre;

-- C) Todos los tipos usados por NC INTERNAS, por empresa (NULL = INNPACK legacy) y estado de eliminacion.
--    en_catalogo_activo = 0  =>  nombre antiguo/huerfano que ensucia el Pareto.
SELECT n.empresa, n.eliminado, n.categoria_defecto,
       CASE WHEN c.nombre IS NOT NULL THEN 1 ELSE 0 END AS en_catalogo_activo,
       COUNT(*) AS registros
FROM no_conformidades n
LEFT JOIN cat_nci_tipos_desviacion c ON c.nombre = n.categoria_defecto AND c.activo = 1
WHERE n.ambito = 'INTERNA'
GROUP BY n.empresa, n.eliminado, n.categoria_defecto, CASE WHEN c.nombre IS NOT NULL THEN 1 ELSE 0 END
ORDER BY n.empresa, n.eliminado, en_catalogo_activo, registros DESC;

-- D) Variantes invisibles (espacios finales, mayusculas) que un GROUP BY exacto separaria
SELECT categoria_defecto, LEN(categoria_defecto) AS largo, DATALENGTH(categoria_defecto) AS bytes, COUNT(*) AS registros
FROM no_conformidades WHERE ambito = 'INTERNA' AND eliminado = 0
GROUP BY categoria_defecto ORDER BY categoria_defecto;

-- E) Los mismos nombres antiguos en NC de PRODUCTO (NO deben tocarse: otro modulo)
SELECT ambito, categoria_defecto, COUNT(*) AS registros FROM no_conformidades
WHERE ambito <> 'INTERNA' AND categoria_defecto IN (
 N'Color / GMG / Muestras', N'Código SAP / arte incorrecto', N'Perfil no indicado en NV / carpeta',
 N'Información incompleta en carpeta', N'Barniz / Folia / Serigrafía', N'Troquel / MFG no coincide',
 N'Cambio de máquina / Planificación', N'Otro')
GROUP BY ambito, categoria_defecto;

-- F) Pareto actual tal como lo calcula la pantalla (eliminado = 0), por empresa
SELECT ISNULL(empresa,'INNPACK(NULL)') AS empresa, categoria_defecto, COUNT(*) AS frecuencia
FROM no_conformidades WHERE ambito = 'INTERNA' AND eliminado = 0
GROUP BY empresa, categoria_defecto ORDER BY empresa, frecuencia DESC;
