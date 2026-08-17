-- Producto Terminado (INNPACK y Faret, tabla compartida): borrado lógico, mismo criterio que el
-- resto del sistema (no_conformidades.eliminado, documentos.eliminado, etc.). Nunca DELETE físico.
-- Ejecutado en calidad.registros_producto_terminado (192.168.1.70) el 2026-08-17.

ALTER TABLE registros_producto_terminado
    ADD COLUMN eliminado TINYINT(1) NOT NULL DEFAULT 0;
