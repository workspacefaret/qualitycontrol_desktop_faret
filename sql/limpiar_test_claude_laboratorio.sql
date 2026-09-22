-- Limpieza de datos de prueba "TEST-CLAUDE-BORRAR" dejados en el módulo Laboratorio - Muestras
-- (INNPACK) durante el rediseño REG-LAB-04. Ejecutar contra calidad_db (SQL Server, 192.168.1.230)
-- con una cuenta con permiso DELETE (la cuenta de la API qcc_innpack_api_sql no lo tiene, por
-- diseño: la app nunca borra físico, solo anula/marca eliminado).
--
-- Alcance verificado antes de escribir este script (solo lectura, 22-09-2026):
--   - 21 ensayos de prueba (ids 71-91, estado 'Anulado') quedaron pegados a la muestra id=20,
--     que es un registro REAL y activo (NP 3996) — por eso el texto de prueba se colaba en el
--     informe impreso de una muestra real. La muestra 20 en sí NO se toca.
--   - 10 muestras 100% de prueba (ids 21,27-35) ya tienen eliminado=1 pero conservan el texto en
--     BD — se borran físicas por ser datos fabricados, junto con sus 6 ensayos (68,69,70,92,93,94).
--   - Todas las 14 filas de muestra_laboratorio_ensayo_bobinas pertenecen a estos ensayos de
--     prueba (no hay ninguna fila real todavía).
--   - Faret (faret_muestra_laboratorio*) está en 0 filas en las 15 tablas — nada que limpiar ahí.
--   - muestra_laboratorio_metodos id=4 (TAPPI T 410, GRAMAJE): contenido real correcto, solo el
--     rastro de auditoría (actualizado_por/fecha_actualizacion) quedó con un valor de prueba.

BEGIN TRANSACTION;

-- 0. Verificación previa (debe devolver 27 ensayos y 10 muestras)
-- SELECT COUNT(*) AS ensayos_test FROM muestra_laboratorio_ensayos
--   WHERE id IN (68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94);
-- SELECT COUNT(*) AS muestras_test FROM muestra_laboratorio WHERE id IN (21,27,28,29,30,31,32,33,34,35);

-- 1. Bobinas múltiples por sustrato (Punto 11) ligadas a los ensayos de prueba
DELETE FROM muestra_laboratorio_ensayo_bobinas
WHERE ensayo_id IN (68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94);

-- 2. Detalle por tipo de ensayo (12 tablas satélite)
DELETE FROM muestra_laboratorio_bct_medido   WHERE ensayo_id IN (80);
DELETE FROM muestra_laboratorio_bct_teorico  WHERE ensayo_id IN (81);
DELETE FROM muestra_laboratorio_cobb         WHERE ensayo_id IN (76);
DELETE FROM muestra_laboratorio_ect          WHERE ensayo_id IN (79);
DELETE FROM muestra_laboratorio_espesor      WHERE ensayo_id IN (75,89);
DELETE FROM muestra_laboratorio_gramaje      WHERE ensayo_id IN (68,69,70,74,86,88,91);
DELETE FROM muestra_laboratorio_humedad      WHERE ensayo_id IN (71,72,73,87,90,92,93,94);
DELETE FROM muestra_laboratorio_lugol        WHERE ensayo_id IN (85);
DELETE FROM muestra_laboratorio_ph           WHERE ensayo_id IN (83);
DELETE FROM muestra_laboratorio_resistencia  WHERE ensayo_id IN (77,78);
DELETE FROM muestra_laboratorio_solidos      WHERE ensayo_id IN (84);
DELETE FROM muestra_laboratorio_viscosidad   WHERE ensayo_id IN (82);

-- 3. Los 27 ensayos de prueba en sí (21 pegados a la muestra real 20 + 6 de las muestras de prueba)
DELETE FROM muestra_laboratorio_ensayos
WHERE id IN (68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94);

-- 4. Las 10 muestras 100% de prueba (NO incluye la 20, que es un registro real)
DELETE FROM muestra_laboratorio WHERE id IN (21,27,28,29,30,31,32,33,34,35);

-- 5. Rastro de auditoría de prueba en el catálogo de métodos (contenido real, no se toca)
UPDATE muestra_laboratorio_metodos
SET actualizado_por = NULL, fecha_actualizacion = NULL
WHERE id = 4 AND actualizado_por = 'Claude-Test-Restauracion';

-- 6. Verificación posterior (debe devolver 0 en todo, y la muestra 20 debe seguir existiendo)
-- SELECT COUNT(*) FROM muestra_laboratorio WHERE descripcion LIKE '%CLAUDE%' OR motivo_anulacion_registro LIKE '%CLAUDE%' OR anulado_por LIKE '%CLAUDE%';
-- SELECT COUNT(*) FROM muestra_laboratorio_ensayos WHERE observacion LIKE '%CLAUDE%' OR motivo_anulacion LIKE '%CLAUDE%' OR motivo_reemplazo LIKE '%CLAUDE%' OR analista_nombre LIKE '%CLAUDE%';
-- SELECT id, np, estado, eliminado FROM muestra_laboratorio WHERE id = 20;

COMMIT TRANSACTION;
