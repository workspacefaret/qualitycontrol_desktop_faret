-- Ensayos nuevos del modulo Muestra Laboratorio: Espesor, RCT y FCT. Mismo patron de cabecera
-- (muestra_laboratorio_ensayos.tipo_ensayo = 'ESPESOR'/'RCT'/'FCT') + tabla de detalle propia.

CREATE TABLE IF NOT EXISTS muestra_laboratorio_espesor (
    ensayo_id INT PRIMARY KEY,
    tipo_medicion VARCHAR(20) NOT NULL, -- Ubicacion (izquierda/centro/derecha) / Muestra (1/2/3)
    medicion_1 DECIMAL(10,4) NULL,
    medicion_2 DECIMAL(10,4) NULL,
    medicion_3 DECIMAL(10,4) NULL,
    promedio DECIMAL(10,4) NULL,
    CONSTRAINT fk_muestra_lab_espesor_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sirve tanto para RCT (papel/bobina, con "componente" Liner/Onda) como para FCT (carton
-- corrugado emplacado, sin componente) - la diferencia la marca muestra_laboratorio_ensayos.
-- tipo_ensayo, no esta tabla. El equipo entrega Force [lbf] directo. Strength es opcional (si el
-- equipo tambien lo entrega, se guarda aparte con su propia unidad, sin recalcularlo).
CREATE TABLE IF NOT EXISTS muestra_laboratorio_resistencia (
    ensayo_id INT PRIMARY KEY,
    componente VARCHAR(10) NULL, -- Liner/Onda (solo RCT), NULL en FCT

    p1_bobina VARCHAR(100) NULL, p1_force DECIMAL(10,4) NULL, p1_strength DECIMAL(10,4) NULL,
    p2_bobina VARCHAR(100) NULL, p2_force DECIMAL(10,4) NULL, p2_strength DECIMAL(10,4) NULL,
    p3_bobina VARCHAR(100) NULL, p3_force DECIMAL(10,4) NULL, p3_strength DECIMAL(10,4) NULL,

    promedio_force DECIMAL(10,4) NULL,
    promedio_strength DECIMAL(10,4) NULL,
    strength_unidad VARCHAR(20) NULL,

    CONSTRAINT fk_muestra_lab_resistencia_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
