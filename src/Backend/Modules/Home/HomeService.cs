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

            var laboratorioPendiente = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registro_ensayos
                WHERE valor IS NULL;
                "
            );

            var laboratorioCriticos = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registro_ensayos re
                INNER JOIN registros_control rc
                    ON rc.id = re.registro_id
                INNER JOIN registro_fallas_visuales rfv
                    ON rfv.registro_id = rc.id
                INNER JOIN parametros_control_visual pcv
                    ON pcv.id = rfv.parametro_id
                WHERE re.valor IS NULL
                  AND pcv.criticidad = 'critico';
                "
            );

            decimal mermaHoy = await DecimalValue(
                conn,
                @"
                SELECT IFNULL(SUM(rm.cantidad), 0)
                FROM registro_mermas rm
                INNER JOIN registros_control rc
                    ON rc.id = rm.registro_id
                WHERE rc.fecha_registro = CURDATE();
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
                SELECT IFNULL(SUM(rm.cantidad), 0)
                FROM registro_mermas rm
                INNER JOIN registros_control rc
                    ON rc.id = rm.registro_id
                WHERE rc.fecha_registro = CURDATE() - INTERVAL 1 DAY;
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
                    p.nombre AS proceso,
                    pcv.nombre AS defecto,
                    pcv.criticidad AS criticidad,
                    COUNT(*) AS total,
                    MAX(rc.hora_registro) AS hora
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                INNER JOIN parametros_control_visual pcv
                    ON pcv.id = rfv.parametro_id
                INNER JOIN procesos p
                    ON p.id = rc.proceso_id
                WHERE rc.fecha_registro >= CURDATE() - INTERVAL 30 DAY
                GROUP BY p.nombre, pcv.nombre, pcv.criticidad
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
                        }
                    );
                }
            }

            var pendientesLab = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registro_ensayos
                WHERE valor IS NULL;
                "
            );

            if (pendientesLab > 0)
            {
                lista.Add(
                    new
                    {
                        tipo = "laboratorio",
                        titulo = "Laboratorio",
                        descripcion = $"{pendientesLab} análisis pendientes",
                        criticidad = "info",
                        hora = DateTime.Now.ToString("HH:mm"),
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
                    rm.unidad AS unidad,
                    IFNULL(SUM(rm.cantidad), 0) AS total
                FROM registro_mermas rm
                INNER JOIN registros_control rc
                    ON rc.id = rm.registro_id
                INNER JOIN procesos p
                    ON p.id = rc.proceso_id
                WHERE rc.fecha_registro = CURDATE()
                GROUP BY p.id, p.nombre, rm.unidad
                ORDER BY total DESC;
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
                        unidad = Text(reader, "unidad"),
                        total = Decimal(reader, "total"),
                    }
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

            var ensayosPendientes = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registro_ensayos
                WHERE valor IS NULL;
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
