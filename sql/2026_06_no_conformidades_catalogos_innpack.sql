-- Catálogos administrables del formulario de No Conformidades de INNPACK (módulo
-- no-conformidades, tabla no_conformidades en la BD `calidad`, conexión directa via DbService —
-- INNPACK no pasa por ninguna API REST, a diferencia de Faret). Réplica del mecanismo ya probado
-- en Faret (cat_faret_*), adaptada a lo que corresponde acá:
--   - creado_por es VARCHAR(150) libre (nombre), no INT FK a usuarios(id) — sigue la convención
--     real ya usada en no_conformidades.creado_por/actualizado_por/reportado_por/cerrado_por.
--   - Longitudes de "nombre" calcadas de las columnas reales de no_conformidades (confirmado con
--     SHOW CREATE TABLE): cliente/categoria_defecto/tipo_falla/area/supervisor/revisado_por=150,
--     familia_producto/impacto=50, nivel=20.
--   - Máquina y Operador NO se tocan (decisión explícita): esos campos siguen sugiriendo desde
--     las tablas reales `maquinas` (con codigo_qr, usadas por Máquinas y Procesos) y `usuarios`
--     (login real) — no se les agrega "crear nuevo" para no divergir de esos registros reales.
--   - Tipo PNC y Disposición NO se tocan (pilotan lógica: visibilidad de Disposición e
--     indicadores) — igual que en Faret.
--
-- Seed: cada tabla se siembra con (a) los valores que antes estaban hardcodeados en el <select>
-- (para Familia/Nivel/Impacto/Tipo de falla) y (b) TODOS los valores reales ya usados hoy en
-- no_conformidades (para los 9 campos) — a diferencia de Faret, acá si hay historial real que
-- preservar como opciones ya disponibles desde el primer día, no solo el catálogo fijo original.
--
-- Alcance: exclusivo INNPACK, tabla `calidad`. Aditivo, reversible, no modifica no_conformidades
-- ni ninguna otra tabla existente.
--
-- REVERSIÓN:
--   DROP TABLE IF EXISTS cat_nc_clientes;
--   DROP TABLE IF EXISTS cat_nc_categorias_defecto;
--   DROP TABLE IF EXISTS cat_nc_tipos_falla;
--   DROP TABLE IF EXISTS cat_nc_supervisores;
--   DROP TABLE IF EXISTS cat_nc_revisores;
--   DROP TABLE IF EXISTS cat_nc_areas;
--   DROP TABLE IF EXISTS cat_nc_familias_producto;
--   DROP TABLE IF EXISTS cat_nc_niveles;
--   DROP TABLE IF EXISTS cat_nc_impactos;


-- ============================================================
-- INSPECCIÓN PREVIA
-- ============================================================
SHOW TABLES LIKE 'cat_nc_%';


-- ============================================================
-- MODIFICACIÓN: 9 tablas nuevas
-- ============================================================

CREATE TABLE IF NOT EXISTS cat_nc_clientes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_clientes_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_nc_categorias_defecto (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_categorias_defecto_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_nc_tipos_falla (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_tipos_falla_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_nc_supervisores (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_supervisores_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_nc_revisores (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_revisores_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_nc_areas (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_areas_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_nc_familias_producto (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_familias_producto_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_nc_niveles (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(20) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_niveles_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_nc_impactos (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_nc_impactos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- SEED: catálogo fijo anterior (donde existía) + histórico real ya guardado
-- ============================================================

INSERT IGNORE INTO cat_nc_familias_producto (nombre) VALUES
    ('Etiquetas'), ('Estuches'), ('Folletos'), ('Preformas');
INSERT IGNORE INTO cat_nc_familias_producto (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(familia_producto), ' +', ' ')
    FROM no_conformidades
    WHERE familia_producto IS NOT NULL AND TRIM(familia_producto) <> '';

INSERT IGNORE INTO cat_nc_niveles (nombre) VALUES ('Crítico'), ('Mayor'), ('Menor');
INSERT IGNORE INTO cat_nc_niveles (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(nivel), ' +', ' ')
    FROM no_conformidades
    WHERE nivel IS NOT NULL AND TRIM(nivel) <> '';

INSERT IGNORE INTO cat_nc_impactos (nombre) VALUES ('Calidad'), ('Legalidad');
INSERT IGNORE INTO cat_nc_impactos (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(impacto), ' +', ' ')
    FROM no_conformidades
    WHERE impacto IS NOT NULL AND TRIM(impacto) <> '';

INSERT IGNORE INTO cat_nc_tipos_falla (nombre) VALUES
    ('Sin clasificar'), ('Control operacional'), ('Fallas Ajuste de máquina'),
    ('Fallas del Proceso de Configuración Inicial'), ('Fallas de limpieza/ condición de equipo'),
    ('Fallas de Supervisión'), ('Fallas de control de insumos en el proceso'),
    ('Fallas de Comunicación Operativa');
INSERT IGNORE INTO cat_nc_tipos_falla (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(tipo_falla), ' +', ' ')
    FROM no_conformidades
    WHERE tipo_falla IS NOT NULL AND TRIM(tipo_falla) <> '';

INSERT IGNORE INTO cat_nc_clientes (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(cliente), ' +', ' ')
    FROM no_conformidades
    WHERE cliente IS NOT NULL AND TRIM(cliente) <> '';

INSERT IGNORE INTO cat_nc_categorias_defecto (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(categoria_defecto), ' +', ' ')
    FROM no_conformidades
    WHERE categoria_defecto IS NOT NULL AND TRIM(categoria_defecto) <> '';

INSERT IGNORE INTO cat_nc_supervisores (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(supervisor), ' +', ' ')
    FROM no_conformidades
    WHERE supervisor IS NOT NULL AND TRIM(supervisor) <> '';

INSERT IGNORE INTO cat_nc_revisores (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(revisado_por), ' +', ' ')
    FROM no_conformidades
    WHERE revisado_por IS NOT NULL AND TRIM(revisado_por) <> '';

INSERT IGNORE INTO cat_nc_areas (nombre)
    SELECT DISTINCT REGEXP_REPLACE(TRIM(area), ' +', ' ')
    FROM no_conformidades
    WHERE area IS NOT NULL AND TRIM(area) <> '';


-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT 'cat_nc_clientes' AS tabla, COUNT(*) AS filas FROM cat_nc_clientes
UNION ALL SELECT 'cat_nc_categorias_defecto', COUNT(*) FROM cat_nc_categorias_defecto
UNION ALL SELECT 'cat_nc_tipos_falla', COUNT(*) FROM cat_nc_tipos_falla
UNION ALL SELECT 'cat_nc_supervisores', COUNT(*) FROM cat_nc_supervisores
UNION ALL SELECT 'cat_nc_revisores', COUNT(*) FROM cat_nc_revisores
UNION ALL SELECT 'cat_nc_areas', COUNT(*) FROM cat_nc_areas
UNION ALL SELECT 'cat_nc_familias_producto', COUNT(*) FROM cat_nc_familias_producto
UNION ALL SELECT 'cat_nc_niveles', COUNT(*) FROM cat_nc_niveles
UNION ALL SELECT 'cat_nc_impactos', COUNT(*) FROM cat_nc_impactos;
