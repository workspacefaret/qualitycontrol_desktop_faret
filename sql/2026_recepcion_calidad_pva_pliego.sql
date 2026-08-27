-- Formularios completos de PVA y Pliegos Faret en Control de Recepcion - Calidad (solo INNPACK).
-- Antes de esto, el "Bloque manual (PVA/Pliego)" del modulo era un formulario generico de 5
-- campos (Proveedor/Guia/Codigo/Lote proveedor/Descripcion, ya cubiertos por
-- recepcion_lotes_control) sin ningun campo especifico de cada tipo. Estas 2 tablas nuevas
-- agregan SOLO lo que le falta a cada tipo (1:1 con el lote, mismo patron que
-- muestra_laboratorio_<tipo>) - los campos ya genericos (proveedor/guia/codigo/lote
-- proveedor/descripcion) siguen viviendo en recepcion_lotes_control, no se duplican aqui.

CREATE TABLE IF NOT EXISTS recepcion_pva (
    lote_id INT PRIMARY KEY,
    nombre_adhesivo VARCHAR(150) NULL,
    cantidad_bins DECIMAL(10,2) NULL,
    fecha_fabricacion_vencimiento DATE NULL,
    certificado_calidad VARCHAR(20) NULL, -- Si/No/Pendiente
    condicion_general VARCHAR(20) NULL,   -- Conforme/ConObservacion/NoConforme
    observacion VARCHAR(500) NULL,
    foto LONGBLOB NULL,      -- solo cuando exista dano o filtracion, mismo patron que
    foto_mime VARCHAR(50) NULL, -- documento_adjuntos (Control Documental)
    CONSTRAINT fk_recepcion_pva_lote FOREIGN KEY (lote_id)
        REFERENCES recepcion_lotes_control(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recepcion_pliego_faret (
    lote_id INT PRIMARY KEY,
    np VARCHAR(50) NULL,
    cliente VARCHAR(150) NULL,
    producto VARCHAR(255) NULL,
    cantidad_total DECIMAL(12,2) NULL,
    cantidad_verde DECIMAL(12,2) NULL,
    cantidad_azul DECIMAL(12,2) NULL,
    cantidad_roja DECIMAL(12,2) NULL,
    estado_carpeta VARCHAR(20) NULL,   -- Recibida/Incompleta/NoRecibida
    condicion_visual VARCHAR(255) NULL,
    tipo_hallazgo VARCHAR(50) NULL,    -- DiferenciaTono/GotasBarniz/PiojosSuciedad/ReservaBarniz/
                                        -- Rayas/Repinte/DanoBordes/Otro
    cantidad_afectada DECIMAL(12,2) NULL,
    observacion VARCHAR(500) NULL,
    foto LONGBLOB NULL,      -- solo cuando exista hallazgo
    foto_mime VARCHAR(50) NULL,
    CONSTRAINT fk_recepcion_pliego_lote FOREIGN KEY (lote_id)
        REFERENCES recepcion_lotes_control(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
