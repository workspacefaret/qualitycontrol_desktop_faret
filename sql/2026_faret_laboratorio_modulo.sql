-- Replica de "Laboratorio - Muestras" para Faret: laboratorio separado (equipo/analistas
-- distintos a INNPACK), decision explicita del usuario - tablas 100% propias, mismo servidor
-- MySQL "calidad", mismo esquema exacto que las tablas muestra_laboratorio* de INNPACK (sql/
-- 2026_muestra_laboratorio_modulo.sql + _espesor_rct_fct + _ect_bct +
-- _viscosidad_ph_solidos_lugol + _reemplazo_ensayo), solo con prefijo faret_. Backend/frontend
-- reutilizan los mismos DTOs de C# (QualityControlCenter.Modules.MuestraLaboratorio) y la misma
-- logica de calculo - solo cambia a que tablas apunta el SQL (FaretLaboratorioRepository).

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_ingreso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_ensayo DATETIME NULL,
    analista_usuario_id INT NULL,
    analista_nombre VARCHAR(150) NULL,

    origen VARCHAR(50) NOT NULL,
    tipo_muestra VARCHAR(50) NOT NULL,

    np VARCHAR(50) NULL,
    cliente VARCHAR(150) NULL,
    codigo_producto VARCHAR(100) NULL,
    descripcion VARCHAR(255) NULL,
    maquina VARCHAR(100) NULL,
    turno VARCHAR(50) NULL,
    lote VARCHAR(100) NULL,
    proveedor VARCHAR(150) NULL,
    observacion VARCHAR(500) NULL,

    estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
    evaluacion VARCHAR(30) NOT NULL DEFAULT 'Sin especificacion',

    recepcion_lote_id INT NULL, -- vinculo con recepcion_lotes_control (empresa=FARET) cuando origen=ControlRecepcion
    nc_id INT NULL,             -- vinculo con no_conformidades (misma tabla compartida que INNPACK)

    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    eliminado TINYINT(1) NOT NULL DEFAULT 0,

    CONSTRAINT fk_faret_muestra_lab_recepcion_lote FOREIGN KEY (recepcion_lote_id)
        REFERENCES recepcion_lotes_control(id),
    CONSTRAINT fk_faret_muestra_lab_nc FOREIGN KEY (nc_id)
        REFERENCES no_conformidades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_especificaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo_muestra VARCHAR(50) NOT NULL,
    tipo_ensayo VARCHAR(30) NOT NULL,
    codigo_producto VARCHAR(100) NULL,
    limite_min DECIMAL(12,4) NULL,
    limite_max DECIMAL(12,4) NULL,
    unidad VARCHAR(20) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_ensayos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    muestra_id INT NOT NULL,
    tipo_ensayo VARCHAR(30) NOT NULL,
    metodo VARCHAR(150) NULL,
    analista_usuario_id INT NULL,
    analista_nombre VARCHAR(150) NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',

    resultado_valor DECIMAL(12,4) NULL,
    resultado_unidad VARCHAR(20) NULL,
    especificacion_min DECIMAL(12,4) NULL,
    especificacion_max DECIMAL(12,4) NULL,
    especificacion_unidad VARCHAR(20) NULL,
    cumplimiento VARCHAR(30) NOT NULL DEFAULT 'Sin especificacion',

    observacion VARCHAR(500) NULL,
    motivo_anulacion VARCHAR(255) NULL,
    ensayo_reemplaza_id INT NULL,
    motivo_reemplazo VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_faret_muestra_lab_ensayo_muestra FOREIGN KEY (muestra_id)
        REFERENCES faret_muestra_laboratorio(id),
    CONSTRAINT fk_faret_muestra_lab_ensayo_reemplaza FOREIGN KEY (ensayo_reemplaza_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_humedad (
    ensayo_id INT PRIMARY KEY,
    metodo_equipo VARCHAR(20) NOT NULL,

    higrometro_izquierdo DECIMAL(6,2) NULL,
    higrometro_centro DECIMAL(6,2) NULL,
    higrometro_derecho DECIMAL(6,2) NULL,
    higrometro_promedio DECIMAL(6,2) NULL,

    termobalanza_valor DECIMAL(6,2) NULL,

    horno_1_peso_inicial DECIMAL(10,4) NULL,
    horno_1_peso_final DECIMAL(10,4) NULL,
    horno_2_peso_inicial DECIMAL(10,4) NULL,
    horno_2_peso_final DECIMAL(10,4) NULL,
    horno_3_peso_inicial DECIMAL(10,4) NULL,
    horno_3_peso_final DECIMAL(10,4) NULL,
    horno_promedio DECIMAL(6,2) NULL,

    diferencia_metodos DECIMAL(6,2) NULL,

    CONSTRAINT fk_faret_muestra_lab_humedad_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_gramaje (
    ensayo_id INT PRIMARY KEY,
    tipo_material VARCHAR(30) NOT NULL,
    modalidad VARCHAR(20) NOT NULL,
    muestra_1 DECIMAL(10,4) NULL,
    muestra_2 DECIMAL(10,4) NULL,
    muestra_3 DECIMAL(10,4) NULL,
    promedio DECIMAL(10,4) NULL,

    CONSTRAINT fk_faret_muestra_lab_gramaje_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_cobb (
    ensayo_id INT PRIMARY KEY,

    p1_bobina VARCHAR(100) NULL, p1_cara VARCHAR(20) NULL,
    p1_peso_inicial DECIMAL(10,4) NULL, p1_peso_final DECIMAL(10,4) NULL,
    p1_tiempo VARCHAR(50) NULL, p1_resultado DECIMAL(10,4) NULL,

    p2_bobina VARCHAR(100) NULL, p2_cara VARCHAR(20) NULL,
    p2_peso_inicial DECIMAL(10,4) NULL, p2_peso_final DECIMAL(10,4) NULL,
    p2_tiempo VARCHAR(50) NULL, p2_resultado DECIMAL(10,4) NULL,

    p3_bobina VARCHAR(100) NULL, p3_cara VARCHAR(20) NULL,
    p3_peso_inicial DECIMAL(10,4) NULL, p3_peso_final DECIMAL(10,4) NULL,
    p3_tiempo VARCHAR(50) NULL, p3_resultado DECIMAL(10,4) NULL,

    promedio DECIMAL(10,4) NULL,

    CONSTRAINT fk_faret_muestra_lab_cobb_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_espesor (
    ensayo_id INT PRIMARY KEY,
    tipo_medicion VARCHAR(20) NOT NULL,
    medicion_1 DECIMAL(10,4) NULL,
    medicion_2 DECIMAL(10,4) NULL,
    medicion_3 DECIMAL(10,4) NULL,
    promedio DECIMAL(10,4) NULL,
    CONSTRAINT fk_faret_muestra_lab_espesor_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_resistencia (
    ensayo_id INT PRIMARY KEY,
    componente VARCHAR(10) NULL,

    p1_bobina VARCHAR(100) NULL, p1_force DECIMAL(10,4) NULL, p1_strength DECIMAL(10,4) NULL,
    p2_bobina VARCHAR(100) NULL, p2_force DECIMAL(10,4) NULL, p2_strength DECIMAL(10,4) NULL,
    p3_bobina VARCHAR(100) NULL, p3_force DECIMAL(10,4) NULL, p3_strength DECIMAL(10,4) NULL,

    promedio_force DECIMAL(10,4) NULL,
    promedio_strength DECIMAL(10,4) NULL,
    strength_unidad VARCHAR(20) NULL,

    CONSTRAINT fk_faret_muestra_lab_resistencia_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_ect (
    ensayo_id INT PRIMARY KEY,
    p1_force DECIMAL(10,4) NULL, p1_strength DECIMAL(10,4) NULL,
    p2_force DECIMAL(10,4) NULL, p2_strength DECIMAL(10,4) NULL,
    p3_force DECIMAL(10,4) NULL, p3_strength DECIMAL(10,4) NULL,
    p4_force DECIMAL(10,4) NULL, p4_strength DECIMAL(10,4) NULL,
    p5_force DECIMAL(10,4) NULL, p5_strength DECIMAL(10,4) NULL,
    promedio_force DECIMAL(10,4) NULL,
    promedio_strength_lbf_m DECIMAL(10,4) NULL,
    promedio_strength_lb_in DECIMAL(10,4) NULL,
    CONSTRAINT fk_faret_muestra_lab_ect_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_bct_medido (
    ensayo_id INT PRIMARY KEY,
    cajas_ensayadas INT NOT NULL,
    motivo_menos_3 VARCHAR(255) NULL,

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
    CONSTRAINT fk_faret_muestra_lab_bct_medido_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_bct_teorico (
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

    CONSTRAINT fk_faret_muestra_lab_bct_teorico_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id),
    CONSTRAINT fk_faret_muestra_lab_bct_teorico_ect FOREIGN KEY (ect_ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id),
    CONSTRAINT fk_faret_muestra_lab_bct_teorico_espesor FOREIGN KEY (espesor_ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_viscosidad (
    ensayo_id INT PRIMARY KEY,
    tipo_adhesivo VARCHAR(100) NULL,
    temperatura DECIMAL(6,2) NULL,
    equipo VARCHAR(100) NULL,
    husillo VARCHAR(50) NULL,
    velocidad_rpm DECIMAL(10,2) NULL,
    resultado_cp DECIMAL(10,2) NULL,
    CONSTRAINT fk_faret_muestra_lab_viscosidad_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_ph (
    ensayo_id INT PRIMARY KEY,
    valor_texto VARCHAR(50) NOT NULL,
    valor_numerico DECIMAL(6,2) NULL,
    color_observado VARCHAR(100) NULL,
    CONSTRAINT fk_faret_muestra_lab_ph_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_solidos (
    ensayo_id INT PRIMARY KEY,
    d1_m1 DECIMAL(10,4) NULL, d1_m2 DECIMAL(10,4) NULL, d1_m3 DECIMAL(10,4) NULL,
    d1_masa_muestra DECIMAL(10,4) NULL, d1_masa_residuo DECIMAL(10,4) NULL, d1_porcentaje DECIMAL(6,2) NULL,

    d2_m1 DECIMAL(10,4) NULL, d2_m2 DECIMAL(10,4) NULL, d2_m3 DECIMAL(10,4) NULL,
    d2_masa_muestra DECIMAL(10,4) NULL, d2_masa_residuo DECIMAL(10,4) NULL, d2_porcentaje DECIMAL(6,2) NULL,

    d3_m1 DECIMAL(10,4) NULL, d3_m2 DECIMAL(10,4) NULL, d3_m3 DECIMAL(10,4) NULL,
    d3_masa_muestra DECIMAL(10,4) NULL, d3_masa_residuo DECIMAL(10,4) NULL, d3_porcentaje DECIMAL(6,2) NULL,

    promedio DECIMAL(6,2) NULL,
    CONSTRAINT fk_faret_muestra_lab_solidos_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faret_muestra_laboratorio_lugol (
    ensayo_id INT PRIMARY KEY,
    punto_muestra VARCHAR(100) NULL,
    coloracion VARCHAR(100) NULL,
    resultado VARCHAR(20) NOT NULL,
    interpretacion VARCHAR(255) NULL,
    CONSTRAINT fk_faret_muestra_lab_lugol_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES faret_muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
