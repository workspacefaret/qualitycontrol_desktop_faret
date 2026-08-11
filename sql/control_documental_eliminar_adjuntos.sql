-- Control Documental (INNPACK y Faret, tabla compartida): borrado lógico de documentos +
-- adjuntos reales por versión (uno por versión, reemplazable).
-- Ejecutado en calidad (192.168.1.70) el 2026-08-10.

ALTER TABLE documentos
    ADD COLUMN eliminado TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE documento_adjuntos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    documento_version_id INT NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    tipo_mime VARCHAR(100) NOT NULL,
    tamano_bytes INT NOT NULL,
    contenido LONGBLOB NOT NULL,
    subido_por VARCHAR(150) NULL,
    fecha_subida DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (documento_version_id),
    FOREIGN KEY (documento_version_id) REFERENCES documento_versiones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
