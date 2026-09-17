-- Solo INNPACK. Aplicar antes de publicar la API que lee precio.
-- Respaldo previo de calidad; no modifica las tablas de qualitycontrolfaret.
USE calidad;

-- Reejecutable: conserva los registros y no altera una columna existente.
SET @precio_ddl = IF(
    EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'talleres_externos_trabajos' AND column_name = 'precio'),
    'SELECT 1',
    'ALTER TABLE talleres_externos_trabajos ADD COLUMN precio VARCHAR(200) NULL AFTER cantidad_faltante_justificacion'
);
PREPARE precio_stmt FROM @precio_ddl;
EXECUTE precio_stmt;
DEALLOCATE PREPARE precio_stmt;
