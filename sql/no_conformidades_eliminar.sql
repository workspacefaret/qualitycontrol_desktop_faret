-- No Conformidades INNPACK: borrado lógico, mismo criterio que el resto del sistema.
-- Ejecutado en calidad.no_conformidades (192.168.1.70) el 2026-08-10.

ALTER TABLE no_conformidades
    ADD COLUMN eliminado TINYINT(1) NOT NULL DEFAULT 0;
