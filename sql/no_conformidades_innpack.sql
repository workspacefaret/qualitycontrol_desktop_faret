-- Módulo "No Conformidades" — INNPACK (standalone, MySQL `calidad`, 192.168.1.70)
-- Replica el módulo No Conformidades ya funcionando en Faret, adaptado a INNPACK:
-- una sola tabla combinada (sin separación Data/NC de dos APIs externas) más
-- 3 tablas hijas para seguimiento, análisis de causa raíz y acciones correctivas.
-- No tiene relación con ninguna tabla de Faret ni con registros_control.

CREATE TABLE no_conformidades (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    codigo                  VARCHAR(30) NOT NULL UNIQUE,        -- generado: NC-2026-00001

    -- Cabecera
    tipo                    ENUM('INTERNA','EXTERNA') NOT NULL DEFAULT 'INTERNA',
    origen                  ENUM('AUDITORIA_INTERNA','AUDITORIA_EXTERNA') NOT NULL DEFAULT 'AUDITORIA_INTERNA',
    titulo                  VARCHAR(255) NOT NULL,
    descripcion             TEXT NOT NULL,
    severidad               ENUM('ALTA','MEDIA','BAJA') NOT NULL DEFAULT 'MEDIA',
    proceso                 VARCHAR(150) NOT NULL,
    norma                   VARCHAR(100) NULL,
    reportado_por           VARCHAR(150) NULL,
    fecha_deteccion         DATE NOT NULL,
    estado                  VARCHAR(30) NOT NULL DEFAULT 'ABIERTA',

    -- Gestión operativa
    responsable              VARCHAR(150) NULL,
    estado_gestion            ENUM('PENDIENTE','ASIGNADA','EN_GESTION','CERRADA') NOT NULL DEFAULT 'PENDIENTE',
    fecha_compromiso          DATE NULL,

    -- Cierre
    cerrado_por              VARCHAR(150) NULL,
    comentario_cierre        TEXT NULL,
    fecha_cierre              DATETIME NULL,

    -- Campos tipo "Nueva NC" (equivalente al formulario PNC de Faret, todos opcionales)
    tipo_pnc                 VARCHAR(50) NULL,      -- Cuarentena / Rechazo / Reclamo
    fecha_ingreso             DATE NULL,
    fecha_salida              DATE NULL,
    np_nv                    VARCHAR(100) NULL,
    cliente                  VARCHAR(150) NULL,
    codigo_producto           VARCHAR(100) NULL,
    producto                 VARCHAR(255) NULL,
    cant_requerida            DECIMAL(12,2) NULL,
    cant_rechazada            DECIMAL(12,2) NULL,
    cant_recuperada           DECIMAL(12,2) NULL,
    pnc_real                 DECIMAL(12,2) NULL,
    pct_recuperacion          DECIMAL(6,2) NULL,     -- calculado: cant_recuperada / cant_rechazada * 100
    fecha_fabricacion         DATE NULL,
    descripcion_defecto       TEXT NULL,
    categoria_defecto         VARCHAR(150) NULL,
    nivel                    VARCHAR(20) NULL,      -- Crítico / Mayor / Menor
    tipo_falla                VARCHAR(150) NULL,
    area                     VARCHAR(150) NULL,
    maquina                  VARCHAR(150) NULL,
    operador                 VARCHAR(150) NULL,
    supervisor                VARCHAR(150) NULL,
    revisado_por              VARCHAR(150) NULL,
    impacto                  VARCHAR(50) NULL,      -- Calidad / Legalidad
    observacion               TEXT NULL,
    causa_raiz                TEXT NULL,             -- texto libre del formulario (distinto del análisis estructurado)
    acciones_correctivas      TEXT NULL,             -- texto libre del formulario (distinto del plan de acciones estructurado)
    verificacion_seguimiento  TEXT NULL,

    creado_por                VARCHAR(150) NULL,
    fecha_creacion             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por           VARCHAR(150) NULL,
    fecha_actualizacion        DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_estado_gestion (estado_gestion),
    INDEX idx_severidad (severidad),
    INDEX idx_fecha_deteccion (fecha_deteccion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE nc_seguimiento (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    no_conformidad_id   INT NOT NULL,
    comentario          TEXT NOT NULL,
    autor               VARCHAR(150) NULL,
    creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (no_conformidad_id) REFERENCES no_conformidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE nc_analisis (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    no_conformidad_id   INT NOT NULL,
    metodologia         ENUM('CINCO_PORQUES','ISHIKAWA','MIXTA') NOT NULL,
    problema_detectado  TEXT NOT NULL,
    porque1             VARCHAR(500) NULL,
    porque2             VARCHAR(500) NULL,
    porque3             VARCHAR(500) NULL,
    porque4             VARCHAR(500) NULL,
    porque5             VARCHAR(500) NULL,
    causa_raiz          TEXT NULL,
    conclusion          TEXT NULL,
    creado_por          VARCHAR(150) NULL,
    creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por     VARCHAR(150) NULL,
    actualizado_en      DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (no_conformidad_id) REFERENCES no_conformidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE nc_acciones_correctivas (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    no_conformidad_id   INT NOT NULL,
    analisis_id         INT NULL,
    descripcion         VARCHAR(500) NOT NULL,
    responsable         VARCHAR(150) NOT NULL,
    fecha_limite        DATE NOT NULL,
    prioridad           ENUM('ALTA','MEDIA','BAJA') NULL,
    estado              ENUM('PENDIENTE','EN_PROCESO','COMPLETADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
    creado_por          VARCHAR(150) NULL,
    creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por     VARCHAR(150) NULL,
    actualizado_en      DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (no_conformidad_id) REFERENCES no_conformidades(id) ON DELETE CASCADE,
    FOREIGN KEY (analisis_id) REFERENCES nc_analisis(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
