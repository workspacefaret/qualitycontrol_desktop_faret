-- Edicion con auditoria de un ensayo finalizado (Muestra Laboratorio, solo INNPACK).
-- No se edita in-place: se crea un ensayo nuevo (reutilizando el Guardar* normal de cada tipo)
-- vinculado al original via ensayo_reemplaza_id/motivo_reemplazo, y el original se anula
-- automaticamente conservando su fila intacta (mismo mecanismo que ya usa AnularEnsayo).
ALTER TABLE muestra_laboratorio_ensayos
    ADD COLUMN ensayo_reemplaza_id INT NULL,
    ADD COLUMN motivo_reemplazo VARCHAR(255) NULL,
    ADD CONSTRAINT fk_muestra_lab_ensayo_reemplaza FOREIGN KEY (ensayo_reemplaza_id)
        REFERENCES muestra_laboratorio_ensayos(id);
