using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Home
{
    public class HomeService
    {
        private readonly DbService _db;

        public HomeService(DbService db)
        {
            _db = db;
        }

        public async Task<object> ObtenerKpis()
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var controlesHoy = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registros_control
                WHERE fecha_registro = CURDATE();
                "
            );

            var noConformesHoy = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                WHERE rc.fecha_registro = CURDATE();
                "
            );

            // Tarjeta "Laboratorio" de Inicio: apunta al módulo "Laboratorio - Muestras"
            // (muestra_laboratorio*) desde que se eliminó el módulo viejo (visor de
            // registro_ensayos de la app móvil). "Pendiente" = muestras sin cerrar; "Críticos" =
            // ensayos finalizados que no cumplen especificación.
            var laboratorioPendiente = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM muestra_laboratorio
                WHERE estado IN ('Pendiente','En analisis');
                "
            );

            var laboratorioCriticos = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM muestra_laboratorio_ensayos
                WHERE estado = 'Finalizado' AND cumplimiento = 'No cumple';
                "
            );

            decimal mermaHoy = await DecimalValue(
                conn,
                @"
                SELECT IFNULL(SUM(rc.cantidad_merma), 0)
                FROM registros_control rc
                WHERE rc.fecha_registro = CURDATE()
                  AND rc.requiere_merma = 1;
                "
            );

            var controlesAyer = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registros_control
                WHERE fecha_registro = CURDATE() - INTERVAL 1 DAY;
                "
            );

            var noConformesAyer = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                WHERE rc.fecha_registro = CURDATE() - INTERVAL 1 DAY;
                "
            );

            decimal mermaAyer = await DecimalValue(
                conn,
                @"
                SELECT IFNULL(SUM(rc.cantidad_merma), 0)
                FROM registros_control rc
                WHERE rc.fecha_registro = CURDATE() - INTERVAL 1 DAY
                  AND rc.requiere_merma = 1;
                "
            );

            return new
            {
                controlesHoy,
                noConformesHoy,
                mermaHoy,
                laboratorioPendiente,
                laboratorioCriticos,
                variacionControles = VariacionPorcentaje(controlesHoy, controlesAyer),
                variacionNoConformes = VariacionPorcentaje(noConformesHoy, noConformesAyer),
                variacionMerma = VariacionPorcentaje(mermaHoy, mermaAyer),
            };
        }

        public async Task<List<object>> ObtenerDesviacionesPorProceso()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    p.nombre AS nombre,
                    COUNT(*) AS total
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                INNER JOIN procesos p
                    ON p.id = rc.proceso_id
                WHERE rc.fecha_registro >= CURDATE() - INTERVAL 30 DAY
                GROUP BY p.id, p.nombre
                ORDER BY total DESC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                lista.Add(new { nombre = Text(reader, "nombre"), total = Int(reader, "total") });
            }

            return lista;
        }

        public async Task<List<object>> ObtenerTopDefectos()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    pcv.nombre AS nombre,
                    pcv.criticidad AS criticidad,
                    COUNT(*) AS total
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                INNER JOIN parametros_control_visual pcv
                    ON pcv.id = rfv.parametro_id
                WHERE rc.fecha_registro >= CURDATE() - INTERVAL 30 DAY
                GROUP BY pcv.id, pcv.nombre, pcv.criticidad
                ORDER BY total DESC
                LIMIT 5;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                lista.Add(
                    new
                    {
                        nombre = Text(reader, "nombre"),
                        criticidad = Text(reader, "criticidad"),
                        total = Int(reader, "total"),
                    }
                );
            }

            return lista;
        }

        public async Task<List<object>> ObtenerAlertasActivas()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using (
                var cmd = new MySqlCommand(
                    @"
                SELECT
                    p.id AS proceso_id,
                    p.nombre AS proceso,
                    pcv.id AS parametro_id,
                    pcv.nombre AS defecto,
                    pcv.criticidad AS criticidad,
                    COUNT(*) AS total,
                    MAX(rc.hora_registro) AS hora,
                    MAX(rc.id) AS registro_id
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                INNER JOIN parametros_control_visual pcv
                    ON pcv.id = rfv.parametro_id
                INNER JOIN procesos p
                    ON p.id = rc.proceso_id
                WHERE rc.fecha_registro >= CURDATE() - INTERVAL 30 DAY
                GROUP BY p.id, p.nombre, pcv.id, pcv.nombre, pcv.criticidad
                ORDER BY
                    CASE pcv.criticidad
                        WHEN 'critico' THEN 1
                        WHEN 'mayor' THEN 2
                        ELSE 3
                    END,
                    total DESC
                LIMIT 4;
                ",
                    conn
                )
            )
            {
                using var reader = await cmd.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    lista.Add(
                        new
                        {
                            tipo = "desviacion",
                            titulo = Text(reader, "proceso"),
                            descripcion = $"{Int(reader, "total")} casos de {Text(reader, "defecto")}",
                            criticidad = Text(reader, "criticidad"),
                            hora = Hora(reader, "hora"),
                            modulo = "registros-control",
                            registroId = Int(reader, "registro_id"),
                            procesoId = Int(reader, "proceso_id"),
                            parametroId = Int(reader, "parametro_id"),
                            defecto = Text(reader, "defecto"),
                        }
                    );
                }
            }

            // El módulo viejo "Laboratorio" (visor de registro_ensayos de la app móvil) fue
            // eliminado y reemplazado por "Laboratorio - Muestras" (muestra_laboratorio); esta
            // alerta apuntaba al módulo/tabla viejos, ya inexistentes. "Pendiente"/"En analisis"
            // replica la misma definición de "muestras pendientes" que usa el propio módulo
            // nuevo en su KPI (ver MuestraLaboratorioRepository.ObtenerIndicadores).
            var pendientesLab = 0;
            var pendienteLabId = 0;

            using (
                var cmdLab = new MySqlCommand(
                    @"
                SELECT COUNT(*) AS total, MIN(id) AS primer_id
                FROM muestra_laboratorio
                WHERE eliminado = 0 AND estado IN ('Pendiente', 'En analisis');
                ",
                    conn
                )
            )
            {
                using var readerLab = await cmdLab.ExecuteReaderAsync();
                if (await readerLab.ReadAsync())
                {
                    pendientesLab = Int(readerLab, "total");
                    pendienteLabId = Int(readerLab, "primer_id");
                }
            }

            if (pendientesLab > 0)
            {
                lista.Add(
                    new
                    {
                        tipo = "laboratorio",
                        titulo = "Laboratorio",
                        descripcion = $"{pendientesLab} muestras pendientes",
                        criticidad = "info",
                        hora = DateTime.Now.ToString("HH:mm"),
                        modulo = "muestra-laboratorio",
                        registroId = pendienteLabId,
                        estadoFiltro = "Pendiente,En analisis",
                    }
                );
            }

            return lista;
        }

        public async Task<List<object>> ObtenerMermaPorProceso()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    p.nombre AS nombre,
                    IFNULL(SUM(rc.cantidad_merma), 0) AS total
                FROM registros_control rc
                INNER JOIN procesos p
                    ON p.id = rc.proceso_id
                WHERE rc.fecha_registro = CURDATE()
                  AND rc.requiere_merma = 1
                GROUP BY p.id, p.nombre
                HAVING total > 0
                ORDER BY total DESC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                lista.Add(
                    new { nombre = Text(reader, "nombre"), total = Decimal(reader, "total") }
                );
            }

            return lista;
        }

        public async Task<List<object>> ObtenerMaquinasConMasDesviaciones()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    IFNULL(m.nombre, 'Sin máquina') AS nombre,
                    COUNT(*) AS total
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                LEFT JOIN maquinas m
                    ON m.id = rc.maquina_id
                WHERE rc.fecha_registro >= CURDATE() - INTERVAL 30 DAY
                GROUP BY m.id, m.nombre
                ORDER BY total DESC
                LIMIT 5;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                lista.Add(new { nombre = Text(reader, "nombre"), total = Int(reader, "total") });
            }

            return lista;
        }

        public async Task<List<object>> ObtenerCumplimientoControles()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    p.nombre AS proceso,
                    COUNT(DISTINCT rc.id) AS controles,
                    COUNT(DISTINCT CASE WHEN rfv.id IS NOT NULL THEN rc.id END) AS con_fallas
                FROM procesos p
                LEFT JOIN registros_control rc
                    ON rc.proceso_id = p.id
                   AND rc.fecha_registro = CURDATE()
                LEFT JOIN registro_fallas_visuales rfv
                    ON rfv.registro_id = rc.id
                GROUP BY p.id, p.nombre
                ORDER BY p.id ASC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var controles = Int(reader, "controles");
                var conFallas = Int(reader, "con_fallas");

                var cumplimiento =
                    controles == 0
                        ? 100
                        : Convert.ToInt32(
                            Math.Round(((decimal)(controles - conFallas) / controles) * 100)
                        );

                lista.Add(
                    new
                    {
                        proceso = Text(reader, "proceso"),
                        controles,
                        conFallas,
                        cumplimiento,
                        estado = cumplimiento >= 80 ? "ok" : "alerta",
                    }
                );
            }

            return lista;
        }

        public async Task<List<object>> ObtenerTendenciaNoConformes()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    d.fecha AS fecha,
                    COUNT(rfv.id) AS total
                FROM (
                    SELECT CURDATE() - INTERVAL 6 DAY AS fecha
                    UNION ALL SELECT CURDATE() - INTERVAL 5 DAY
                    UNION ALL SELECT CURDATE() - INTERVAL 4 DAY
                    UNION ALL SELECT CURDATE() - INTERVAL 3 DAY
                    UNION ALL SELECT CURDATE() - INTERVAL 2 DAY
                    UNION ALL SELECT CURDATE() - INTERVAL 1 DAY
                    UNION ALL SELECT CURDATE()
                ) d
                LEFT JOIN registros_control rc
                    ON rc.fecha_registro = d.fecha
                LEFT JOIN registro_fallas_visuales rfv
                    ON rfv.registro_id = rc.id
                GROUP BY d.fecha
                ORDER BY d.fecha ASC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var fecha = Convert.ToDateTime(reader["fecha"]);

                lista.Add(new { fecha = fecha.ToString("dd MMM"), total = Int(reader, "total") });
            }

            return lista;
        }

        public async Task<List<object>> ObtenerOrigenProblema()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    CASE
                        WHEN LOWER(pcv.nombre) LIKE '%material%'
                          OR LOWER(pcv.nombre) LIKE '%cartulina%'
                          OR LOWER(pcv.nombre) LIKE '%papel%'
                          OR LOWER(pcv.nombre) LIKE '%monotapa%'
                          OR LOWER(pcv.nombre) LIKE '%placa%'
                            THEN 'Material prima'

                        WHEN LOWER(pcv.nombre) LIKE '%maquina%'
                          OR LOWER(pcv.nombre) LIKE '%máquina%'
                          OR LOWER(pcv.nombre) LIKE '%ajuste%'
                          OR LOWER(pcv.nombre) LIKE '%presion%'
                          OR LOWER(pcv.nombre) LIKE '%presión%'
                            THEN 'Ajuste máquina'

                        WHEN LOWER(pcv.nombre) LIKE '%impres%'
                          OR LOWER(pcv.nombre) LIKE '%tinta%'
                          OR LOWER(pcv.nombre) LIKE '%color%'
                            THEN 'Impresión'

                        WHEN LOWER(pcv.nombre) LIKE '%pegado%'
                          OR LOWER(pcv.nombre) LIKE '%despeg%'
                          OR LOWER(pcv.nombre) LIKE '%deslaminado%'
                          OR LOWER(pcv.nombre) LIKE '%curvatura%'
                            THEN 'Operación'

                        ELSE 'Sin determinar'
                    END AS origen,
                    COUNT(*) AS total
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                INNER JOIN parametros_control_visual pcv
                    ON pcv.id = rfv.parametro_id
                WHERE rc.fecha_registro >= CURDATE() - INTERVAL 30 DAY
                GROUP BY origen
                ORDER BY total DESC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                lista.Add(new { nombre = Text(reader, "origen"), total = Int(reader, "total") });
            }

            return lista;
        }

        public async Task<object> ObtenerResumenGeneral()
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ordenesEnProduccion = await Count(
                conn,
                @"
                SELECT COUNT(DISTINCT np)
                FROM registros_control
                WHERE fecha_registro = CURDATE()
                  AND np IS NOT NULL
                  AND TRIM(np) <> '';
                "
            );

            var controlesRealizados = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registros_control
                WHERE fecha_registro = CURDATE();
                "
            );

            var noConformesAbiertas = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                WHERE rc.fecha_registro = CURDATE();
                "
            );

            // Mismo reemplazo que en ObtenerKpis/ObtenerAlertasActivas: el módulo viejo
            // "Laboratorio" (registro_ensayos) fue eliminado, la fuente real es muestra_laboratorio.
            var ensayosPendientes = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM muestra_laboratorio
                WHERE eliminado = 0 AND estado IN ('Pendiente', 'En analisis');
                "
            );

            var controlesSinFalla = controlesRealizados - noConformesAbiertas;

            if (controlesSinFalla < 0)
                controlesSinFalla = 0;

            var cumplimientoGeneral =
                controlesRealizados == 0
                    ? 100
                    : Convert.ToInt32(
                        Math.Round(((decimal)controlesSinFalla / controlesRealizados) * 100)
                    );

            return new
            {
                ordenesEnProduccion,
                controlesProgramados = controlesRealizados,
                controlesRealizados,
                cumplimientoGeneral,
                noConformesAbiertas,
                ensayosPendientes,
            };
        }

        // Frecuencias mínimas de inspección por área/proceso (cat_frecuencias_inspeccion): calcula
        // cuántos minutos pasaron desde el último registro_control real de esa área/proceso y lo
        // compara contra el mínimo configurado. Sin registros todavía => se considera atrasada.
        public async Task<List<object>> ObtenerFrecuenciasInspeccion()
        {
            var lista = new List<object>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    cfi.id,
                    cfi.nombre,
                    cfi.frecuencia_minutos,
                    TIMESTAMPDIFF(MINUTE,
                        (SELECT MAX(TIMESTAMP(rc.fecha_registro, rc.hora_registro))
                         FROM registros_control rc
                         WHERE rc.eliminado = 0
                           AND (
                               (cfi.tipo_referencia = 'PROCESO' AND rc.proceso_id = cfi.proceso_id)
                               OR (cfi.tipo_referencia = 'AREA' AND UPPER(IFNULL(rc.area, '')) LIKE CONCAT(cfi.area_valor, '%'))
                           )
                        ),
                        NOW()
                    ) AS minutos_sin_control
                FROM cat_frecuencias_inspeccion cfi
                WHERE cfi.activo = 1
                ORDER BY cfi.id;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var frecuencia = Int(reader, "frecuencia_minutos");
                var minutosSinControl =
                    reader["minutos_sin_control"] == DBNull.Value
                        ? (int?)null
                        : Convert.ToInt32(reader["minutos_sin_control"]);

                lista.Add(
                    new
                    {
                        id = Int(reader, "id"),
                        nombre = Text(reader, "nombre"),
                        frecuenciaMinutos = frecuencia,
                        minutosSinControl,
                        atrasada = minutosSinControl == null || minutosSinControl > frecuencia,
                    }
                );
            }

            return lista;
        }

        public async Task ActualizarFrecuenciaInspeccion(int id, int frecuenciaMinutos)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                UPDATE cat_frecuencias_inspeccion
                SET frecuencia_minutos = @minutos, actualizado_en = NOW()
                WHERE id = @id;
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@minutos", frecuenciaMinutos);
            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }

        private async Task<int> Count(MySqlConnection conn, string sql)
        {
            using var cmd = new MySqlCommand(sql, conn);

            return Convert.ToInt32(await cmd.ExecuteScalarAsync() ?? 0);
        }

        private async Task<decimal> DecimalValue(MySqlConnection conn, string sql)
        {
            using var cmd = new MySqlCommand(sql, conn);

            return Convert.ToDecimal(await cmd.ExecuteScalarAsync() ?? 0);
        }

        private static int Int(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? 0 : Convert.ToInt32(reader[column]);
        }

        private static decimal Decimal(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? 0 : Convert.ToDecimal(reader[column]);
        }

        private static string Text(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? "" : reader[column]?.ToString() ?? "";
        }

        private static string Hora(MySqlDataReader reader, string column)
        {
            if (reader[column] == DBNull.Value)
                return "";

            if (reader[column] is TimeSpan time)
                return time.ToString(@"hh\:mm");

            return reader[column]?.ToString() ?? "";
        }

        private static int VariacionPorcentaje(decimal actual, decimal anterior)
        {
            if (anterior <= 0)
                return actual > 0 ? 100 : 0;

            return Convert.ToInt32(Math.Round(((actual - anterior) / anterior) * 100));
        }
    }
}
