-- Ultimos 4 ensayos: Viscosidad, pH, Solidos totales (todos PVA) y Lugol (adhesivo de corrugado).

CREATE TABLE IF NOT EXISTS muestra_laboratorio_viscosidad (
    ensayo_id INT PRIMARY KEY,
    tipo_adhesivo VARCHAR(100) NULL,
    temperatura DECIMAL(6,2) NULL,
    equipo VARCHAR(100) NULL,
    husillo VARCHAR(50) NULL,
    velocidad_rpm DECIMAL(10,2) NULL,
    resultado_cp DECIMAL(10,2) NULL,
    CONSTRAINT fk_muestra_lab_viscosidad_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- pH por tiras indicadoras, NO por pHimetro (sin equipo/temperatura/promedio, ver pedido original).
-- valor_texto conserva lo que realmente marco la tira (puede ser un rango, ej "6-7").
-- valor_numerico es el valor usado para comparar contra especificacion (parseado en backend: si
-- es un numero simple se usa tal cual, si es un rango se promedia, si no se puede interpretar
-- queda NULL y el ensayo resulta "Sin especificacion").
CREATE TABLE IF NOT EXISTS muestra_laboratorio_ph (
    ensayo_id INT PRIMARY KEY,
    valor_texto VARCHAR(50) NOT NULL,
    valor_numerico DECIMAL(6,2) NULL,
    color_observado VARCHAR(100) NULL,
    CONSTRAINT fk_muestra_lab_ph_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS muestra_laboratorio_solidos (
    ensayo_id INT PRIMARY KEY,
    d1_m1 DECIMAL(10,4) NULL, d1_m2 DECIMAL(10,4) NULL, d1_m3 DECIMAL(10,4) NULL,
    d1_masa_muestra DECIMAL(10,4) NULL, d1_masa_residuo DECIMAL(10,4) NULL, d1_porcentaje DECIMAL(6,2) NULL,

    d2_m1 DECIMAL(10,4) NULL, d2_m2 DECIMAL(10,4) NULL, d2_m3 DECIMAL(10,4) NULL,
    d2_masa_muestra DECIMAL(10,4) NULL, d2_masa_residuo DECIMAL(10,4) NULL, d2_porcentaje DECIMAL(6,2) NULL,

    d3_m1 DECIMAL(10,4) NULL, d3_m2 DECIMAL(10,4) NULL, d3_m3 DECIMAL(10,4) NULL,
    d3_masa_muestra DECIMAL(10,4) NULL, d3_masa_residuo DECIMAL(10,4) NULL, d3_porcentaje DECIMAL(6,2) NULL,

    promedio DECIMAL(6,2) NULL,
    CONSTRAINT fk_muestra_lab_solidos_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lugol es categorico (Positivo/Negativo/No concluyente), no numerico - por eso NO pasa por el
-- mecanismo automatico de especificacion (FinalizarEnsayo) que usan los demas ensayos: el analista
-- elige el Cumplimiento directamente en el formulario, a partir de su interpretacion.
CREATE TABLE IF NOT EXISTS muestra_laboratorio_lugol (
    ensayo_id INT PRIMARY KEY,
    punto_muestra VARCHAR(100) NULL,
    coloracion VARCHAR(100) NULL,
    resultado VARCHAR(20) NOT NULL, -- Positivo/Negativo/NoConcluyente
    interpretacion VARCHAR(255) NULL,
    CONSTRAINT fk_muestra_lab_lugol_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
