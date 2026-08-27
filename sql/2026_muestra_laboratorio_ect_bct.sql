-- Ensayos ECT, BCT medido y BCT teorico (McKee). McKee NO es un ensayo fisico independiente:
-- toma datos de un ECT y un Espesor YA FINALIZADOS de la MISMA muestra (se guardan sus ids para
-- trazabilidad/auditoria) mas Largo/Ancho interno que ingresa el usuario.

CREATE TABLE IF NOT EXISTS muestra_laboratorio_ect (
    ensayo_id INT PRIMARY KEY,
    -- 5 probetas: Force [lbf] lo mide el equipo. Strength [lbf/m] = Force / 0.1m, calculado, no
    -- ingresado a mano.
    p1_force DECIMAL(10,4) NULL, p1_strength DECIMAL(10,4) NULL,
    p2_force DECIMAL(10,4) NULL, p2_strength DECIMAL(10,4) NULL,
    p3_force DECIMAL(10,4) NULL, p3_strength DECIMAL(10,4) NULL,
    p4_force DECIMAL(10,4) NULL, p4_strength DECIMAL(10,4) NULL,
    p5_force DECIMAL(10,4) NULL, p5_strength DECIMAL(10,4) NULL,
    promedio_force DECIMAL(10,4) NULL,
    promedio_strength_lbf_m DECIMAL(10,4) NULL, -- resultado principal del ECT
    promedio_strength_lb_in DECIMAL(10,4) NULL, -- convertido, se usa para McKee
    CONSTRAINT fk_muestra_lab_ect_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS muestra_laboratorio_bct_medido (
    ensayo_id INT PRIMARY KEY,
    cajas_ensayadas INT NOT NULL, -- 1, 2 o 3
    motivo_menos_3 VARCHAR(255) NULL, -- obligatorio si cajas_ensayadas < 3

    c1_largo DECIMAL(10,2) NULL, c1_ancho DECIMAL(10,2) NULL, c1_alto DECIMAL(10,2) NULL,
    c1_tipo_onda VARCHAR(50) NULL, c1_gramaje_complejo DECIMAL(10,2) NULL,
    c1_espesor_complejo DECIMAL(10,4) NULL, c1_resultado_lbf DECIMAL(10,4) NULL,

    c2_largo DECIMAL(10,2) NULL, c2_ancho DECIMAL(10,2) NULL, c2_alto DECIMAL(10,2) NULL,
    c2_tipo_onda VARCHAR(50) NULL, c2_gramaje_complejo DECIMAL(10,2) NULL,
    c2_espesor_complejo DECIMAL(10,4) NULL, c2_resultado_lbf DECIMAL(10,4) NULL,

    c3_largo DECIMAL(10,2) NULL, c3_ancho DECIMAL(10,2) NULL, c3_alto DECIMAL(10,2) NULL,
    c3_tipo_onda VARCHAR(50) NULL, c3_gramaje_complejo DECIMAL(10,2) NULL,
    c3_espesor_complejo DECIMAL(10,4) NULL, c3_resultado_lbf DECIMAL(10,4) NULL,

    promedio_lbf DECIMAL(10,4) NULL,
    CONSTRAINT fk_muestra_lab_bct_medido_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS muestra_laboratorio_bct_teorico (
    ensayo_id INT PRIMARY KEY,
    ect_ensayo_id INT NOT NULL,
    espesor_ensayo_id INT NOT NULL,

    ect_lbf_m DECIMAL(10,4) NOT NULL,
    ect_lb_in DECIMAL(10,4) NOT NULL,
    espesor_mm DECIMAL(10,4) NOT NULL,
    espesor_in DECIMAL(10,6) NOT NULL,
    largo_mm DECIMAL(10,2) NOT NULL,
    largo_in DECIMAL(10,6) NOT NULL,
    ancho_mm DECIMAL(10,2) NOT NULL,
    ancho_in DECIMAL(10,6) NOT NULL,
    perimetro_in DECIMAL(10,6) NOT NULL,

    bct_teorico_lbf DECIMAL(10,4) NOT NULL,
    bct_teorico_kgf DECIMAL(10,4) NOT NULL,

    CONSTRAINT fk_muestra_lab_bct_teorico_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id),
    CONSTRAINT fk_muestra_lab_bct_teorico_ect FOREIGN KEY (ect_ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id),
    CONSTRAINT fk_muestra_lab_bct_teorico_espesor FOREIGN KEY (espesor_ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
