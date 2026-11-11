/* =====================================================================================
   21 - Consultas de cobertura historica NC -> NP -> fabricacion -> maquina -> operador
   SOLO LECTURA (SELECT). Para ejecutar por una persona con cuenta autorizada de lectura.
   No ejecutadas por Claude (sin acceso autorizado a FPS_PRODUCCION). Sin datos reales en este archivo.
   Parte A: calidad_db (SQL Server INNPACK).  Parte B: FPS_PRODUCCION (cuenta autorizada distinta).
   Parte C: MySQL Faret (importacion_pnc) - consultar con la cuenta/API Faret autorizada.
   Relacion clave: no_conformidades.np_nv  <->  ZZZMasterOT.NotaVentaFaret (= vw_FactProduccion.NP)
   ===================================================================================== */

/* ---------- A. calidad_db: universo de NC (cuenta qcc_audit_ro sirve) ---------- */
-- A1 NC por ambito / empresa / eliminado y rango de fechas
SELECT ambito, empresa, eliminado, COUNT(*) AS nc,
       MIN(fecha_fabricacion) AS fab_min, MAX(fecha_fabricacion) AS fab_max,
       MIN(fecha_deteccion)   AS det_min, MAX(fecha_deteccion)   AS det_max
FROM dbo.no_conformidades
GROUP BY ambito, empresa, eliminado;

-- A2 NC de producto con NP "valido" (formato numerico de 5 digitos tipico de NotaVentaFaret) vs no valido
SELECT CASE WHEN np_nv IS NULL OR LTRIM(RTRIM(np_nv)) = '' THEN 'sin NP'
            WHEN LTRIM(RTRIM(np_nv)) NOT LIKE '%[^0-9]%' THEN 'NP numerico'
            ELSE 'NP con texto (revisar)' END AS tipo_np,
       COUNT(*) AS nc
FROM dbo.no_conformidades
WHERE eliminado = 0 AND ambito = 'PRODUCTO'
GROUP BY CASE WHEN np_nv IS NULL OR LTRIM(RTRIM(np_nv)) = '' THEN 'sin NP'
              WHEN LTRIM(RTRIM(np_nv)) NOT LIKE '%[^0-9]%' THEN 'NP numerico'
              ELSE 'NP con texto (revisar)' END;

-- A3 NP repetidos en NC (varias NC del mismo NP: no duplicar penalizacion por NP)
SELECT np_nv, COUNT(*) AS nc FROM dbo.no_conformidades
WHERE eliminado = 0 AND ambito = 'PRODUCTO' AND np_nv IS NOT NULL
GROUP BY np_nv HAVING COUNT(*) > 1;

/* ---------- B. FPS_PRODUCCION (requiere cuenta de lectura autorizada; NO usar CONEXIONFPS/pblectura) ---------- */
-- B1 cobertura temporal de sesiones y de operador informado
SELECT MIN(SetupStartDate) AS desde, MAX(SetupStartDate) AS hasta, COUNT(*) AS sesiones,
       SUM(CASE WHEN u.ID IS NULL THEN 1 ELSE 0 END) AS sin_usuario,
       SUM(CASE WHEN LOWER(LTRIM(RTRIM(u.Nombre_Comp))) IN ('admin','administrador','') THEN 1 ELSE 0 END) AS usuario_generico
FROM dbo.WorkOrderRecords w LEFT JOIN dbo.ZZZUsuarios u ON u.ID = w.UserKey;

-- B2 sesiones por mes (cobertura mensual utilizable)
SELECT FORMAT(SetupStartDate,'yyyy-MM') AS mes, COUNT(*) AS sesiones,
       COUNT(DISTINCT UserKey) AS usuarios, COUNT(DISTINCT ResourceKey) AS maquinas
FROM dbo.WorkOrderRecords GROUP BY FORMAT(SetupStartDate,'yyyy-MM') ORDER BY 1;

-- B3 por cada NP de las NC: sesiones de fabricacion, operadores y maquinas distintos
--    (@nps = lista de NP obtenida de A; cargar en tabla temporal #nc_np(np varchar(20)) por la persona que ejecuta)
SELECT n.np,
       COUNT(*)                          AS sesiones,
       COUNT(DISTINCT f.OPERADOR)        AS operadores,
       COUNT(DISTINCT f.MAQUINA)         AS maquinas,
       MIN(f.[FECHA INICIO])             AS primera_sesion,
       MAX(f.[FECHA TERMINO])            AS ultima_sesion
FROM #nc_np n
LEFT JOIN [plan].vw_FactProduccion f ON CAST(f.NP AS varchar(20)) = n.np
GROUP BY n.np;

-- B4 detalle por NC: nivel Confirmada/Probable/No atribuible (maquina Y fecha de fabricacion dentro de la sesion)
--    #nc(id, np varchar(20), maquina varchar(100), fecha_fab date, operador_nc varchar(150))
SELECT c.id,
       COUNT(f.ID) AS sesiones_np,
       SUM(CASE WHEN f.MAQUINA = c.maquina AND c.fecha_fab >= CAST(f.[FECHA INICIO] AS date)
                 AND c.fecha_fab <= CAST(f.[FECHA TERMINO] AS date) THEN 1 ELSE 0 END) AS sesiones_maquina_y_fecha,
       COUNT(DISTINCT CASE WHEN f.MAQUINA = c.maquina AND c.fecha_fab >= CAST(f.[FECHA INICIO] AS date)
                 AND c.fecha_fab <= CAST(f.[FECHA TERMINO] AS date) THEN f.OPERADOR END) AS operadores_en_ventana,
       MAX(CASE WHEN f.OPERADOR = c.operador_nc THEN 1 ELSE 0 END) AS operador_nc_coincide_con_fps
FROM #nc c LEFT JOIN [plan].vw_FactProduccion f ON CAST(f.NP AS varchar(20)) = c.np
GROUP BY c.id;

-- B5 turnos reales de operador (eventos de login/logout; datos desde 2026-08-05 segun documentacion)
SELECT MIN(1) AS placeholder; -- ver programa-produccion.api/api/Sql/vista_turnos_sesion.sql para columnas exactas
