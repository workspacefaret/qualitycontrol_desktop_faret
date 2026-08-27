-- Replica de Control de Recepcion - Calidad para Faret: tabla COMPARTIDA con columna empresa
-- (mismo patron que registros_producto_terminado), no tablas separadas - decision explicita del
-- usuario. NULL = INNPACK (registros creados antes de esta columna). Solo tipo "Bobina" habilitado
-- para Faret por ahora (sin PVA ni Pliego Faret de ese lado).
ALTER TABLE recepcion_lotes_control
    ADD COLUMN empresa VARCHAR(10) NULL; -- INNPACK/FARET
