-- Módulo "Talleres Externos" (INNPACK) — Quality Control Center desktop
-- Tablas nuevas exclusivamente, en la BD "calidad" (192.168.1.70) que ya usa INNPACK.
-- Completamente independientes de las tablas homónimas del módulo Talleres Externos de FARET
-- (esas viven en la BD qualitycontrolfaret, en el servidor de la API Faret, y se acceden solo
-- por REST — nunca por MySQL directo desde este desktop). No modifica ninguna tabla existente.
--
-- CÓMO EJECUTAR (manual, no automatizado):
--   1. Hacer un respaldo (mysqldump) de la base "calidad" antes de aplicar el script.
--   2. Ejecutar este archivo completo con un cliente MySQL (mysql -u <user> -p calidad <
--      2026_talleres_externos_innpack.sql) o pegarlo en un cliente gráfico (Workbench/HeidiSQL)
--      conectado al servidor real (192.168.1.70).
--   3. Verificar con SHOW TABLES LIKE 'talleres_externos%'; y SHOW TABLES LIKE 'cat_%externos';
--
-- REVERSIÓN (si hace falta deshacer todo, sin datos que preservar):
--   DROP TABLE IF EXISTS talleres_externos_trabajos;
--   DROP TABLE IF EXISTS cat_procesos_externos;
--   DROP TABLE IF EXISTS cat_talleres_externos;

CREATE TABLE IF NOT EXISTS cat_talleres_externos (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_talleres_externos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cat_procesos_externos (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cat_procesos_externos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla principal. taller_externo_id/proceso_id/responsable_interno_id son FK nullable + copia
-- histórica de texto: si el catálogo se renombra o desactiva después, los trabajos ya guardados
-- conservan el texto tal como se vio al momento de guardar (mismo criterio que Faret).
CREATE TABLE IF NOT EXISTS talleres_externos_trabajos (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nv VARCHAR(50) NOT NULL,
    producto VARCHAR(255) NOT NULL,
    codigo_producto VARCHAR(50) NULL,
    item VARCHAR(20) NOT NULL,
    cliente VARCHAR(150) NULL,
    fecha_asignacion DATE NULL,
    taller_externo_id INT NULL,
    taller_externo_texto VARCHAR(150) NULL,
    proceso_id INT NULL,
    proceso_texto VARCHAR(150) NULL,
    responsable_interno_id INT NULL,
    responsable_interno_texto VARCHAR(150) NULL,
    prioridad ENUM('BAJA','MEDIA','ALTA') NOT NULL DEFAULT 'MEDIA',
    fecha_compromiso DATE NULL,
    estado ENUM('PENDIENTE_ASIGNACION','ASIGNADO','EN_PROCESO','ENTREGADO','ANULADO')
        NOT NULL DEFAULT 'PENDIENTE_ASIGNACION',
    cantidad_a_revisar DECIMAL(18,2) NOT NULL DEFAULT 0,
    cantidad_revisada_entregada DECIMAL(18,2) NOT NULL DEFAULT 0,
    cantidad_faltante DECIMAL(18,2) NOT NULL DEFAULT 0,
    cantidad_faltante_ajuste_manual TINYINT(1) NOT NULL DEFAULT 0,
    cantidad_faltante_justificacion VARCHAR(500) NULL,
    observaciones VARCHAR(2000) NULL,
    version INT NOT NULL DEFAULT 1,
    creado_por INT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por INT NULL,
    fecha_actualizacion DATETIME NULL,
    eliminado TINYINT(1) NOT NULL DEFAULT 0,
    fecha_anulacion DATETIME NULL,
    anulado_por INT NULL,
    CONSTRAINT fk_tei_taller FOREIGN KEY (taller_externo_id) REFERENCES cat_talleres_externos(id),
    CONSTRAINT fk_tei_proceso FOREIGN KEY (proceso_id) REFERENCES cat_procesos_externos(id),
    CONSTRAINT fk_tei_responsable FOREIGN KEY (responsable_interno_id) REFERENCES usuarios(id),
    CONSTRAINT fk_tei_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id),
    CONSTRAINT fk_tei_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios(id),
    CONSTRAINT fk_tei_anulado_por FOREIGN KEY (anulado_por) REFERENCES usuarios(id),
    INDEX idx_tei_nv (nv),
    INDEX idx_tei_estado (estado),
    INDEX idx_tei_eliminado (eliminado),
    INDEX idx_tei_fecha_compromiso (fecha_compromiso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
