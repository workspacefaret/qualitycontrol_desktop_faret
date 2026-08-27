-- No Conformidades (INNPACK): adjuntos (PDF análisis de causa raíz + evidencia fotográfica).
-- Mismo mecanismo ya probado en producción para Faret (nc_adjuntos en mejora_continua) y en
-- Control Documental/Recepción-Calidad (LONGBLOB en calidad) -- una sola tabla genérica por tipo,
-- FK real hacia no_conformidades (misma BD), borrado logico. Nombre de tabla nc_adjuntos para
-- mantener el mismo prefijo que sus tablas hermanas ya existentes (nc_analisis, nc_seguimiento,
-- nc_acciones_correctivas) en esta misma BD calidad.

CREATE TABLE IF NOT EXISTS nc_adjuntos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    no_conformidad_id INT NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    tipo_mime VARCHAR(100) NOT NULL,
    tamano_bytes INT NOT NULL,
    contenido LONGBLOB NOT NULL,
    subido_por VARCHAR(150) NULL,
    fecha_subida DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    eliminado TINYINT(1) NOT NULL DEFAULT 0,
    CONSTRAINT fk_nc_adjuntos_no_conformidades FOREIGN KEY (no_conformidad_id) REFERENCES no_conformidades(id),
    INDEX idx_nc_adjuntos_nc (no_conformidad_id, tipo, eliminado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
