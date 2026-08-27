-- Vinculo automatico a No Conformidades cuando un resultado de Laboratorio (evaluacion = "No
-- cumple") o de Control de Recepcion - Calidad (estado = "NoConforme") lo requiere. Solo INNPACK,
-- reutiliza la tabla no_conformidades ya existente (misma que usa el modulo no-conformidades) -
-- no se crea ninguna tabla nueva, solo el puntero de vuelta.

ALTER TABLE muestra_laboratorio
    ADD COLUMN nc_id INT NULL,
    ADD CONSTRAINT fk_muestra_lab_nc FOREIGN KEY (nc_id) REFERENCES no_conformidades(id);

ALTER TABLE recepcion_lotes_control
    ADD COLUMN nc_id INT NULL,
    ADD CONSTRAINT fk_recepcion_lote_nc FOREIGN KEY (nc_id) REFERENCES no_conformidades(id);
