-- Módulo "Frecuencias mínimas de inspección" (INNPACK, Inicio) — Quality Control Center desktop
-- Tabla nueva exclusivamente, en la BD "calidad" (192.168.1.70). No modifica ninguna tabla
-- existente. Exclusivo de INNPACK, no toca nada de Faret.
--
-- CÓMO EJECUTAR (manual, no automatizado):
--   1. Hacer un respaldo (mysqldump) de la base "calidad" antes de aplicar el script.
--   2. Ejecutar este archivo completo con un cliente MySQL (mysql -u <user> -p calidad <
--      2026_frecuencias_inspeccion_innpack.sql) o pegarlo en un cliente gráfico (Workbench/
--      HeidiSQL) conectado al servidor real (192.168.1.70).
--   3. Verificar con SELECT * FROM cat_frecuencias_inspeccion;
--
-- REVERSIÓN:
--   DROP TABLE IF EXISTS cat_frecuencias_inspeccion;

CREATE TABLE IF NOT EXISTS cat_frecuencias_inspeccion (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo_referencia ENUM('PROCESO','AREA') NOT NULL,
    proceso_id INT NULL,
    area_valor VARCHAR(20) NULL,
    frecuencia_minutos INT NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NULL,
    CONSTRAINT fk_cfi_proceso FOREIGN KEY (proceso_id) REFERENCES procesos(id),
    UNIQUE KEY uq_cfi_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- proceso_id real (confirmado en la BD): Corrugado=1, Emplacado=2, Troquelado=3, Pegado=4,
-- Termoformado=5. "Calidad"/"Autocontrol de Producción" se comparan contra rc.area
-- (valores reales: CALIDAD, CALIDAD INNPACK, PRODUCCION).
INSERT IGNORE INTO cat_frecuencias_inspeccion (nombre, tipo_referencia, proceso_id, area_valor, frecuencia_minutos) VALUES
    ('Calidad', 'AREA', NULL, 'CALIDAD', 60),
    ('Corrugado', 'PROCESO', 1, NULL, 60),
    ('Emplacado', 'PROCESO', 2, NULL, 60),
    ('Troquel', 'PROCESO', 3, NULL, 60),
    ('Termoformado', 'PROCESO', 5, NULL, 30),
    ('Pegado', 'PROCESO', 4, NULL, 30),
    ('Autocontrol de Producción', 'AREA', NULL, 'PRODUCCION', 120);
