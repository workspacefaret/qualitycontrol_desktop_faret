-- Módulo "Talleres Externos" (INNPACK) — sincronización de avance con FPS/SAP.
-- Tabla nueva exclusivamente, en la BD "calidad" (192.168.1.70). No modifica ninguna tabla
-- existente (talleres_externos_trabajos, cat_talleres_externos, cat_procesos_externos).
--
-- Guarda cada liberación de FPS (Faret_Control_Calidad, vía la API fps-api) ya aplicada al avance
-- de un trabajo, identificada por folio_fps — el UNIQUE es la garantía real contra duplicados si
-- la sincronización se corre más de una vez (no una validación de aplicación).
--
-- CÓMO EJECUTAR (manual, no automatizado):
--   1. Backup (mysqldump) de la base "calidad" antes de aplicar el script.
--   2. mysql -u <user> -p calidad < 2026_talleres_externos_liberaciones_fps.sql
--   3. Verificar con SHOW TABLES LIKE 'talleres_externos_liberaciones_fps';
--
-- REVERSIÓN: DROP TABLE IF EXISTS talleres_externos_liberaciones_fps;

CREATE TABLE IF NOT EXISTS talleres_externos_liberaciones_fps (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    trabajo_id BIGINT NOT NULL,
    folio_fps VARCHAR(30) NOT NULL,
    nv VARCHAR(50) NOT NULL,
    item VARCHAR(20) NOT NULL,
    codigo_producto VARCHAR(50) NOT NULL,
    cantidad DECIMAL(18,2) NOT NULL,
    fecha_liberacion DATETIME NOT NULL,
    fecha_sincronizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_telf_trabajo FOREIGN KEY (trabajo_id) REFERENCES talleres_externos_trabajos(id),
    UNIQUE KEY uq_telf_folio (folio_fps),
    INDEX idx_telf_trabajo (trabajo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
