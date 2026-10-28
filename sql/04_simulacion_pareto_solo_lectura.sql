-- =====================================================================================
-- 04_simulacion_pareto_solo_lectura.sql
-- SIMULACION de la normalizacion de tipos de desviacion (NC Internas). SOLO SELECT + CTE.
-- Sin escrituras, sin tablas temporales ni variables de tabla, sin DDL, sin transacciones.
-- SQL Server 2016. Ejecutar con: sqlcmd -S 192.168.1.230 -d calidad_db -E -f 65001 -i <este archivo>
-- Empresa: se compara por separado; empresa NULL se cuenta como INNPACK (criterio de la API).
--
-- Estados de mapeo:
--   APROBADO       = marcado explicitamente por Pedro en su reporte (flecha/arco).
--   PEND_FORMATO   = mismo texto con distinto formato; NO marcado por Pedro. Requiere visto bueno.
--   PEND_AMBIGUO   = destino dudoso ("?" de Pedro o posible division). NO se simula.
--   SIN_DESTINO    = el destino natural esta desactivado en el catalogo. NO se simula.
-- Escenario SIM_A = solo APROBADO.  Escenario SIM_B = APROBADO + PEND_FORMATO (informativo).
-- =====================================================================================
SET NOCOUNT ON;
SET LOCK_TIMEOUT 10000;

-- 0) Contexto de conexion
SELECT DB_NAME() AS base, SUSER_SNAME() AS usuario, (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) AS nivel_compat;

-- 1) CONTROL DE MAPEOS: filas reales por nombre antiguo (incluye eliminadas). Si salen 0 donde hay datos => problema de codificacion.
WITH Map AS (
    SELECT viejo, nuevo, estado FROM (VALUES
        (N'Código SAP / arte incorrecto',       N'Código SAP/Perfil',                     'APROBADO'),
        (N'Información incompleta en carpeta',  N'Información incompleta en la carpeta',  'APROBADO'),
        (N'Barniz / Folia / Serigrafía',        N'Barniz/Folia/Serigrafía',               'PEND_FORMATO'),
        (N'Cambio de máquina / Planificación',  N'Cambio de máquina/planificación',       'PEND_FORMATO'),
        (N'Troquel / MFG no coincide',          N'Troquel/MFG',                           'PEND_FORMATO'),
        (N'Color / GMG / Muestras',             N'Color',                                 'PEND_AMBIGUO'),
        (N'Perfil no indicado en NV / carpeta', N'Código SAP/Perfil',                     'PEND_AMBIGUO'),
        (N'Otro',                               NULL,                                     'SIN_DESTINO')
    ) v (viejo, nuevo, estado)
)
SELECT m.viejo AS nombre_antiguo, m.estado, m.nuevo AS destino_propuesto, COUNT(n.id) AS filas_en_datos
FROM Map m
LEFT JOIN dbo.no_conformidades n ON n.ambito = 'INTERNA' AND n.categoria_defecto = m.viejo
GROUP BY m.viejo, m.estado, m.nuevo
ORDER BY m.estado, m.viejo;

-- 2) DETALLE por empresa y categoria
WITH Map AS (
    SELECT viejo, nuevo, estado FROM (VALUES
        (N'Código SAP / arte incorrecto',       N'Código SAP/Perfil',                     'APROBADO'),
        (N'Información incompleta en carpeta',  N'Información incompleta en la carpeta',  'APROBADO'),
        (N'Barniz / Folia / Serigrafía',        N'Barniz/Folia/Serigrafía',               'PEND_FORMATO'),
        (N'Cambio de máquina / Planificación',  N'Cambio de máquina/planificación',       'PEND_FORMATO'),
        (N'Troquel / MFG no coincide',          N'Troquel/MFG',                           'PEND_FORMATO'),
        (N'Color / GMG / Muestras',             N'Color',                                 'PEND_AMBIGUO'),
        (N'Perfil no indicado en NV / carpeta', N'Código SAP/Perfil',                     'PEND_AMBIGUO'),
        (N'Otro',                               NULL,                                     'SIN_DESTINO')
    ) v (viejo, nuevo, estado)
),
Cat AS (SELECT nombre FROM dbo.cat_nci_tipos_desviacion WHERE activo = 1),
Base AS (
    SELECT COALESCE(n.empresa, N'INNPACK') AS empresa, n.eliminado, n.categoria_defecto AS actual
    FROM dbo.no_conformidades n WHERE n.ambito = 'INTERNA'
),
Sim AS (
    SELECT b.empresa, b.eliminado, b.actual, m.estado, m.nuevo,
           CASE WHEN m.estado = 'APROBADO' THEN m.nuevo ELSE b.actual END AS simA,
           CASE WHEN m.estado IN ('APROBADO', 'PEND_FORMATO') THEN m.nuevo ELSE b.actual END AS simB
    FROM Base b LEFT JOIN Map m ON m.viejo = b.actual
)
SELECT s.empresa, s.actual AS categoria,
       CASE WHEN c.nombre IS NOT NULL THEN 'SI' ELSE 'NO' END AS en_catalogo_activo,
       ISNULL(s.estado, 'SIN_MAPEO') AS estado_mapeo, s.nuevo AS destino_propuesto,
       COUNT(*) AS total,
       SUM(CASE WHEN s.eliminado = 0 THEN 1 ELSE 0 END) AS no_eliminadas,
       SUM(CASE WHEN s.eliminado <> 0 THEN 1 ELSE 0 END) AS eliminadas,
       SUM(CASE WHEN s.simA <> s.actual THEN 1 ELSE 0 END) AS cambian_SIM_A,
       SUM(CASE WHEN s.simB <> s.actual THEN 1 ELSE 0 END) AS cambian_SIM_B
FROM Sim s LEFT JOIN Cat c ON c.nombre = s.actual
GROUP BY s.empresa, s.actual, c.nombre, s.estado, s.nuevo
ORDER BY s.empresa, en_catalogo_activo, total DESC, s.actual;

-- 3) PARETO actual vs simulado (solo NO eliminadas, igual que la pantalla)
WITH Map AS (
    SELECT viejo, nuevo, estado FROM (VALUES
        (N'Código SAP / arte incorrecto',       N'Código SAP/Perfil',                     'APROBADO'),
        (N'Información incompleta en carpeta',  N'Información incompleta en la carpeta',  'APROBADO'),
        (N'Barniz / Folia / Serigrafía',        N'Barniz/Folia/Serigrafía',               'PEND_FORMATO'),
        (N'Cambio de máquina / Planificación',  N'Cambio de máquina/planificación',       'PEND_FORMATO'),
        (N'Troquel / MFG no coincide',          N'Troquel/MFG',                           'PEND_FORMATO'),
        (N'Color / GMG / Muestras',             N'Color',                                 'PEND_AMBIGUO'),
        (N'Perfil no indicado en NV / carpeta', N'Código SAP/Perfil',                     'PEND_AMBIGUO'),
        (N'Otro',                               NULL,                                     'SIN_DESTINO')
    ) v (viejo, nuevo, estado)
),
Base AS (
    SELECT COALESCE(n.empresa, N'INNPACK') AS empresa, n.eliminado, n.categoria_defecto AS actual
    FROM dbo.no_conformidades n WHERE n.ambito = 'INTERNA'
),
Sim AS (
    SELECT b.empresa, b.eliminado, b.actual,
           CASE WHEN m.estado = 'APROBADO' THEN m.nuevo ELSE b.actual END AS simA,
           CASE WHEN m.estado IN ('APROBADO', 'PEND_FORMATO') THEN m.nuevo ELSE b.actual END AS simB
    FROM Base b LEFT JOIN Map m ON m.viejo = b.actual
),
P AS (
    SELECT empresa, '1_ACTUAL' AS escenario, actual AS cat FROM Sim WHERE eliminado = 0
    UNION ALL SELECT empresa, '2_SIM_A', simA FROM Sim WHERE eliminado = 0
    UNION ALL SELECT empresa, '3_SIM_B', simB FROM Sim WHERE eliminado = 0
),
F AS (SELECT empresa, escenario, cat, COUNT(*) AS frecuencia FROM P GROUP BY empresa, escenario, cat)
SELECT empresa, escenario, cat AS categoria, frecuencia,
       CAST(100.0 * SUM(frecuencia) OVER (PARTITION BY empresa, escenario ORDER BY frecuencia DESC, cat ROWS UNBOUNDED PRECEDING)
            / SUM(frecuencia) OVER (PARTITION BY empresa, escenario) AS DECIMAL(5, 2)) AS pct_acumulado
FROM F
ORDER BY empresa, escenario, frecuencia DESC, cat;

-- 4) CONTROLES por empresa: totales identicos en cada escenario, eliminadas y categorias que quedarian fuera del catalogo activo
WITH Map AS (
    SELECT viejo, nuevo, estado FROM (VALUES
        (N'Código SAP / arte incorrecto',       N'Código SAP/Perfil',                     'APROBADO'),
        (N'Información incompleta en carpeta',  N'Información incompleta en la carpeta',  'APROBADO'),
        (N'Barniz / Folia / Serigrafía',        N'Barniz/Folia/Serigrafía',               'PEND_FORMATO'),
        (N'Cambio de máquina / Planificación',  N'Cambio de máquina/planificación',       'PEND_FORMATO'),
        (N'Troquel / MFG no coincide',          N'Troquel/MFG',                           'PEND_FORMATO'),
        (N'Color / GMG / Muestras',             N'Color',                                 'PEND_AMBIGUO'),
        (N'Perfil no indicado en NV / carpeta', N'Código SAP/Perfil',                     'PEND_AMBIGUO'),
        (N'Otro',                               NULL,                                     'SIN_DESTINO')
    ) v (viejo, nuevo, estado)
),
Cat AS (SELECT nombre FROM dbo.cat_nci_tipos_desviacion WHERE activo = 1),
Base AS (
    SELECT COALESCE(n.empresa, N'INNPACK') AS empresa, n.eliminado, n.categoria_defecto AS actual
    FROM dbo.no_conformidades n WHERE n.ambito = 'INTERNA'
),
Sim1 AS (
    SELECT b.empresa, b.eliminado, b.actual,
           CASE WHEN m.estado = 'APROBADO' THEN m.nuevo ELSE b.actual END AS simA,
           CASE WHEN m.estado IN ('APROBADO', 'PEND_FORMATO') THEN m.nuevo ELSE b.actual END AS simB
    FROM Base b LEFT JOIN Map m ON m.viejo = b.actual
)
SELECT s.empresa,
       COUNT(*) AS total_nc,
       SUM(CASE WHEN s.eliminado = 0 THEN 1 ELSE 0 END) AS no_eliminadas,
       SUM(CASE WHEN s.eliminado <> 0 THEN 1 ELSE 0 END) AS eliminadas,
       SUM(CASE WHEN s.simA <> s.actual THEN 1 ELSE 0 END) AS cambian_SIM_A,
       SUM(CASE WHEN s.simA <> s.actual AND s.eliminado <> 0 THEN 1 ELSE 0 END) AS de_las_cuales_eliminadas_A,
       SUM(CASE WHEN s.simB <> s.actual THEN 1 ELSE 0 END) AS cambian_SIM_B,
       SUM(CASE WHEN s.simB <> s.actual AND s.eliminado <> 0 THEN 1 ELSE 0 END) AS de_las_cuales_eliminadas_B,
       SUM(CASE WHEN cA.nombre IS NULL AND s.eliminado = 0 THEN 1 ELSE 0 END) AS pendientes_fuera_catalogo_tras_A,
       SUM(CASE WHEN cB.nombre IS NULL AND s.eliminado = 0 THEN 1 ELSE 0 END) AS pendientes_fuera_catalogo_tras_B,
       (SELECT COUNT(*) FROM dbo.no_conformidades x WHERE x.ambito = 'INTERNA' AND COALESCE(x.empresa, N'INNPACK') = s.empresa) AS control_total_tabla
FROM Sim1 s
LEFT JOIN Cat cA ON cA.nombre = s.simA
LEFT JOIN Cat cB ON cB.nombre = s.simB
GROUP BY s.empresa
ORDER BY s.empresa;

-- 5) CATEGORIAS que quedarian pendientes tras SIM_A (fuera del catalogo activo), no eliminadas y eliminadas
WITH Map AS (
    SELECT viejo, nuevo, estado FROM (VALUES
        (N'Código SAP / arte incorrecto',       N'Código SAP/Perfil',                     'APROBADO'),
        (N'Información incompleta en carpeta',  N'Información incompleta en la carpeta',  'APROBADO'),
        (N'Barniz / Folia / Serigrafía',        N'Barniz/Folia/Serigrafía',               'PEND_FORMATO'),
        (N'Cambio de máquina / Planificación',  N'Cambio de máquina/planificación',       'PEND_FORMATO'),
        (N'Troquel / MFG no coincide',          N'Troquel/MFG',                           'PEND_FORMATO'),
        (N'Color / GMG / Muestras',             N'Color',                                 'PEND_AMBIGUO'),
        (N'Perfil no indicado en NV / carpeta', N'Código SAP/Perfil',                     'PEND_AMBIGUO'),
        (N'Otro',                               NULL,                                     'SIN_DESTINO')
    ) v (viejo, nuevo, estado)
),
Cat AS (SELECT nombre FROM dbo.cat_nci_tipos_desviacion WHERE activo = 1),
Base AS (
    SELECT COALESCE(n.empresa, N'INNPACK') AS empresa, n.eliminado, n.categoria_defecto AS actual
    FROM dbo.no_conformidades n WHERE n.ambito = 'INTERNA'
),
Sim1 AS (
    SELECT b.empresa, b.eliminado, b.actual, m.estado,
           CASE WHEN m.estado = 'APROBADO' THEN m.nuevo ELSE b.actual END AS simA
    FROM Base b LEFT JOIN Map m ON m.viejo = b.actual
)
SELECT s.empresa, s.simA AS categoria_pendiente, ISNULL(s.estado, 'SIN_MAPEO') AS estado_mapeo,
       SUM(CASE WHEN s.eliminado = 0 THEN 1 ELSE 0 END) AS no_eliminadas,
       SUM(CASE WHEN s.eliminado <> 0 THEN 1 ELSE 0 END) AS eliminadas
FROM Sim1 s LEFT JOIN Cat c ON c.nombre = s.simA
WHERE c.nombre IS NULL
GROUP BY s.empresa, s.simA, s.estado
ORDER BY s.empresa, no_eliminadas DESC, s.simA;
