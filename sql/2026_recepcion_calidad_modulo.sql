-- Modulo "Control de Recepcion - Calidad" (solo INNPACK). Consume SAP (via apisapfaret,
-- Service Layer) solo de lectura y arma lotes de inspeccion + plan de muestreo NCh44 propios de
-- QCC. No duplica ni vuelve a escribir nada de lo que ya vive en SAP.

CREATE TABLE IF NOT EXISTS recepcion_lotes_control (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo_materia_prima VARCHAR(30) NOT NULL, -- Bobina/PVA/PliegoFaret
    proveedor VARCHAR(150) NULL,
    guia VARCHAR(50) NULL,
    item_code VARCHAR(100) NULL,
    descripcion VARCHAR(255) NULL,
    lote_proveedor VARCHAR(100) NULL,
    ancho_declarado DECIMAL(10,2) NULL,
    gramaje_declarado DECIMAL(10,2) NULL,
    cantidad_total_lote DECIMAL(12,2) NULL,  -- bobinas seleccionadas para este lote de inspeccion
    estado VARCHAR(30) NOT NULL DEFAULT 'PendienteMuestreo',
    -- PendienteMuestreo/PendienteLaboratorio/EnAnalisis/RecibidaConforme/RecibidaConObservacion/NoConforme
    creado_por VARCHAR(150) NULL,
    eliminado TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bobinas de SAP (OBTN.DistNumber) que Calidad decidio incluir en este lote de inspeccion.
CREATE TABLE IF NOT EXISTS recepcion_lote_bobinas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lote_id INT NOT NULL,
    numero_bobina VARCHAR(100) NOT NULL,
    doc_entry_sap INT NULL,
    CONSTRAINT fk_recepcion_lote_bobinas_lote FOREIGN KEY (lote_id)
        REFERENCES recepcion_lotes_control(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Plan de muestreo NCh44 calculado para el lote (1:1).
CREATE TABLE IF NOT EXISTS recepcion_plan_muestreo (
    lote_id INT PRIMARY KEY,
    norma VARCHAR(20) NOT NULL DEFAULT 'NCh44',
    tamano_lote INT NOT NULL,
    nivel_inspeccion VARCHAR(10) NOT NULL, -- I/II/III
    aql DECIMAL(6,2) NOT NULL,
    letra_codigo VARCHAR(2) NOT NULL,
    tamano_muestra INT NOT NULL,
    numero_aceptacion INT NULL,
    numero_rechazo INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recepcion_plan_lote FOREIGN KEY (lote_id)
        REFERENCES recepcion_lotes_control(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bobinas efectivamente muestreadas (subconjunto de recepcion_lote_bobinas).
CREATE TABLE IF NOT EXISTS recepcion_bobinas_muestreadas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lote_id INT NOT NULL,
    numero_bobina VARCHAR(100) NOT NULL,
    seleccion_tipo VARCHAR(20) NOT NULL, -- Aleatoria/Manual
    criterio_manual VARCHAR(255) NULL,
    usuario VARCHAR(150) NULL,
    fecha_seleccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recepcion_muestreadas_lote FOREIGN KEY (lote_id)
        REFERENCES recepcion_lotes_control(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Catalogo NCh44 (equivalente a ISO 2859-1/MIL-STD-105E): tamano de lote -> letra codigo, por
-- nivel de inspeccion. Sembrado completo SOLO para Nivel II (el de uso general, el que pide la
-- inmensa mayoria de los planes de muestreo de packaging) - Nivel I/III quedan para una etapa
-- futura si se necesitan.
CREATE TABLE IF NOT EXISTS recepcion_muestreo_letras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nivel_inspeccion VARCHAR(10) NOT NULL,
    tamano_min INT NOT NULL,
    tamano_max INT NULL, -- NULL = sin tope superior
    letra_codigo VARCHAR(2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO recepcion_muestreo_letras (nivel_inspeccion, tamano_min, tamano_max, letra_codigo) VALUES
('II', 2, 8, 'A'),
('II', 9, 15, 'B'),
('II', 16, 25, 'C'),
('II', 26, 50, 'D'),
('II', 51, 90, 'E'),
('II', 91, 150, 'F'),
('II', 151, 280, 'G'),
('II', 281, 500, 'H'),
('II', 501, 1200, 'J'),
('II', 1201, 3200, 'K'),
('II', 3201, 10000, 'L'),
('II', 10001, 35000, 'M'),
('II', 35001, 150000, 'N'),
('II', 150001, 500000, 'P'),
('II', 500001, NULL, 'Q');

-- Letra codigo -> tamano de muestra (n). Estandar, no depende del AQL.
CREATE TABLE IF NOT EXISTS recepcion_muestreo_tamanos (
    letra_codigo VARCHAR(2) PRIMARY KEY,
    tamano_muestra INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO recepcion_muestreo_tamanos (letra_codigo, tamano_muestra) VALUES
('A', 2), ('B', 3), ('C', 5), ('D', 8), ('E', 13), ('F', 20), ('G', 32), ('H', 50),
('J', 80), ('K', 125), ('L', 200), ('M', 315), ('N', 500), ('P', 800), ('Q', 1250), ('R', 2000);

-- Letra codigo + AQL -> Ac/Re (muestreo simple, inspeccion NORMAL). Sembrado completo SOLO para
-- AQL 2.5 (el mas usado en defectos generales de packaging) - IMPORTANTE: validar estos valores
-- contra el documento oficial NCh44:2007 antes de usarlos para decisiones reales de
-- aceptacion/rechazo. Quedan pendientes el resto de los AQL habituales (0.65/1.0/1.5/4.0/6.5).
CREATE TABLE IF NOT EXISTS recepcion_muestreo_planes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    letra_codigo VARCHAR(2) NOT NULL,
    aql DECIMAL(6,2) NOT NULL,
    numero_aceptacion INT NULL, -- NULL = usar el plan de la letra inmediatamente superior/inferior (flecha en la norma), no soportado aun
    numero_rechazo INT NULL,
    UNIQUE KEY uq_letra_aql (letra_codigo, aql)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO recepcion_muestreo_planes (letra_codigo, aql, numero_aceptacion, numero_rechazo) VALUES
('C', 2.5, 0, 1),
('D', 2.5, 1, 2),
('E', 2.5, 1, 2),
('F', 2.5, 2, 3),
('G', 2.5, 3, 4),
('H', 2.5, 5, 6),
('J', 2.5, 7, 8),
('K', 2.5, 10, 11),
('L', 2.5, 14, 15),
('M', 2.5, 21, 22),
('N', 2.5, 21, 22),
('P', 2.5, 21, 22),
('Q', 2.5, 21, 22);

-- Vinculo con el modulo Laboratorio ya existente: una muestra creada desde un lote de recepcion
-- queda trazable a ese lote (origen='ControlRecepcion' ya existe como valor de texto en
-- muestra_laboratorio.origen, esta FK es lo unico que faltaba agregar).
ALTER TABLE muestra_laboratorio
    ADD COLUMN recepcion_lote_id INT NULL;

ALTER TABLE muestra_laboratorio
    ADD CONSTRAINT fk_muestra_lab_recepcion_lote FOREIGN KEY (recepcion_lote_id)
        REFERENCES recepcion_lotes_control(id);
