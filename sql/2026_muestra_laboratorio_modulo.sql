-- Modulo nuevo "Muestra Laboratorio" (esqueleto + 3 primeros ensayos: Humedad, Gramaje, Cobb).
-- Nombre distinto al modulo YA EXISTENTE "Laboratorio" (Modules/Laboratorio, tabla-visor de
-- ensayos entrados por la app movil) para no chocar con esas tablas/acciones/rutas ya en uso.
-- Solo INNPACK. No se toca ninguna tabla existente.

CREATE TABLE IF NOT EXISTS muestra_laboratorio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_ingreso DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_ensayo DATETIME NULL,
    analista_usuario_id INT NULL,
    analista_nombre VARCHAR(150) NULL,

    origen VARCHAR(50) NOT NULL,        -- ControlRecepcion/Corrugado/Emplacado/Troquelado/Pegado/ProductoTerminado/MuestraExterna/Pruebas
    tipo_muestra VARCHAR(50) NOT NULL,   -- Papel/Monotapa/CartonCorrugadoEmplacado/PliegoImpreso/CajaPegada/CajaMaster/AdhesivoPVA/AdhesivoCorrugado/Otro

    np VARCHAR(50) NULL,
    cliente VARCHAR(150) NULL,
    codigo_producto VARCHAR(100) NULL,
    descripcion VARCHAR(255) NULL,
    maquina VARCHAR(100) NULL,
    turno VARCHAR(50) NULL,
    lote VARCHAR(100) NULL,
    proveedor VARCHAR(150) NULL,
    observacion VARCHAR(500) NULL,

    estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente',          -- Pendiente/En analisis/Finalizada/Anulada
    evaluacion VARCHAR(30) NOT NULL DEFAULT 'Sin especificacion', -- Cumple/No cumple/Parcialmente evaluada/Sin especificacion

    creado_por VARCHAR(150) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    eliminado TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Maestro minimo de especificaciones (limite min/max por tipo_muestra+tipo_ensayo, opcionalmente
-- por codigo_producto). Se congela en el ensayo al evaluar (especificacion_min/max/unidad propias
-- del ensayo) para que un cambio futuro acá no altere resultados historicos. Sin UI de
-- administracion todavia (se carga por SQL directo) - ver documentacion, pendiente fase futura.
CREATE TABLE IF NOT EXISTS muestra_laboratorio_especificaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo_muestra VARCHAR(50) NOT NULL,
    tipo_ensayo VARCHAR(30) NOT NULL,   -- HUMEDAD/GRAMAJE/COBB
    codigo_producto VARCHAR(100) NULL,  -- NULL = aplica a todo el tipo_muestra
    limite_min DECIMAL(12,4) NULL,
    limite_max DECIMAL(12,4) NULL,
    unidad VARCHAR(20) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS muestra_laboratorio_ensayos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    muestra_id INT NOT NULL,
    tipo_ensayo VARCHAR(30) NOT NULL,   -- HUMEDAD/GRAMAJE/COBB
    metodo VARCHAR(150) NULL,
    analista_usuario_id INT NULL,
    analista_nombre VARCHAR(150) NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente', -- Pendiente/En ensayo/Finalizado/Anulado

    resultado_valor DECIMAL(12,4) NULL,
    resultado_unidad VARCHAR(20) NULL,
    especificacion_min DECIMAL(12,4) NULL,
    especificacion_max DECIMAL(12,4) NULL,
    especificacion_unidad VARCHAR(20) NULL,
    cumplimiento VARCHAR(30) NOT NULL DEFAULT 'Sin especificacion', -- Cumple/No cumple/Sin especificacion

    observacion VARCHAR(500) NULL,
    motivo_anulacion VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_muestra_lab_ensayo_muestra FOREIGN KEY (muestra_id)
        REFERENCES muestra_laboratorio(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS muestra_laboratorio_humedad (
    ensayo_id INT PRIMARY KEY,
    metodo_equipo VARCHAR(20) NOT NULL, -- Higrometro/Termobalanza/Horno

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

    CONSTRAINT fk_muestra_lab_humedad_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS muestra_laboratorio_gramaje (
    ensayo_id INT PRIMARY KEY,
    tipo_material VARCHAR(30) NOT NULL, -- Papel/Cartulina/Pliego/ComplejoCorrugado
    modalidad VARCHAR(20) NOT NULL,     -- ProbetaPeso/Directo
    muestra_1 DECIMAL(10,4) NULL,
    muestra_2 DECIMAL(10,4) NULL,
    muestra_3 DECIMAL(10,4) NULL,
    promedio DECIMAL(10,4) NULL,

    CONSTRAINT fk_muestra_lab_gramaje_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS muestra_laboratorio_cobb (
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

    CONSTRAINT fk_muestra_lab_cobb_ensayo FOREIGN KEY (ensayo_id)
        REFERENCES muestra_laboratorio_ensayos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
