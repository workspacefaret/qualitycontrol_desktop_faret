-- Amplía "No Conformidades" INNPACK con familia de producto y disposición
-- (reposición/destrucción), aplicable solo cuando corresponda (Cuarentena / Rechazo Cliente).
-- Todas las columnas son nullable: no afecta registros existentes.
-- Ejecutado en calidad.no_conformidades (192.168.1.70) el 2026-08-10.

ALTER TABLE no_conformidades
    ADD COLUMN familia_producto VARCHAR(50) NULL AFTER producto,
    ADD COLUMN disposicion      VARCHAR(50) NULL AFTER pct_recuperacion,
    ADD COLUMN cant_destruida   DECIMAL(12,2) NULL AFTER disposicion,
    ADD COLUMN cant_repuesta    DECIMAL(12,2) NULL AFTER cant_destruida;
