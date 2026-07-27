-- Módulo "Control Documental" — INNPACK (standalone, MySQL `calidad`, 192.168.1.70)
-- Etapa 1: solo el modelo base (documento + historial de versiones).
-- No toca ninguna tabla existente. Reversible con DROP TABLE.
-- Decisiones (ver contex-control-documental.md):
--   - Estado colapsado a 3 valores: VIGENTE / EN_REVISION / OBSOLETO ("Actualizado" = VIGENTE).
--   - Sin adjuntos reales en el MVP (ubicacion queda como texto/ruta).
--   - Sin gating de permisos adicional (igual que No Conformidades INNPACK).
--   - Historial arranca desde la versión vigente actual hacia adelante (sin reconstrucción).
--   - Políticas SGSI y Fodas Areas quedan fuera del MVP.

CREATE TABLE documentos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    codigo_base         VARCHAR(50) NOT NULL UNIQUE,       -- código sin versión, ej. PRO-CDP
    tipo_documento       VARCHAR(100) NOT NULL,             -- Procedimiento / Instructivo / Registro / Formulario
    area                VARCHAR(150) NULL,
    nombre              VARCHAR(255) NOT NULL,
    alcance_empresa      ENUM('INNPACK','FARET','AMBAS') NOT NULL DEFAULT 'INNPACK',
    estado              ENUM('VIGENTE','EN_REVISION','OBSOLETO') NOT NULL DEFAULT 'VIGENTE',
    responsable          VARCHAR(150) NULL,
    ubicacion            VARCHAR(500) NULL,                 -- ruta/URL, no archivo subido (MVP)
    observaciones        TEXT NULL,

    creado_por           VARCHAR(150) NULL,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por      VARCHAR(150) NULL,
    fecha_actualizacion   DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_estado (estado),
    INDEX idx_tipo_documento (tipo_documento),
    INDEX idx_alcance_empresa (alcance_empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE documento_versiones (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    documento_id         INT NOT NULL,
    version              VARCHAR(20) NOT NULL,              -- ej. V02
    fecha_actualizacion   DATE NOT NULL,
    proxima_revision      DATE NULL,                         -- calculada: fecha_actualizacion + 365 días, editable
    es_version_vigente     TINYINT(1) NOT NULL DEFAULT 1,

    creado_por           VARCHAR(150) NULL,
    fecha_creacion        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_documento_version (documento_id, version),
    FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
