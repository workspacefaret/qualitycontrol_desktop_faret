using System;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Dashboard
{
    public class DashboardRepository
    {
        private readonly DbService _db;

        public DashboardRepository(DbService db)
        {
            _db = db;
        }

        public async Task<DashboardResumenDto> ObtenerResumen(
            string fechaDesde = "",
            string fechaHasta = "",
            string inspector = "",
            string turno = "",
            string proceso = ""
        )
        {
            var result = new DashboardResumenDto();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var filtros = BuildFiltros(fechaDesde, fechaHasta, inspector, turno, proceso);

            result.ControlesHoy = await Count(
                conn,
                $@"
                SELECT COUNT(*)
                FROM registros_control rc
                WHERE rc.fecha_registro = CURDATE()
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD';
                "
            );

            result.ControlesPeriodo = await Count(
                conn,
                $@"
                SELECT COUNT(*)
                FROM registros_control rc
                WHERE 1 = 1
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD'
                  {filtros};
                "
            );

            result.NoConformidadesDetectadas = await Count(
                conn,
                $@"
                SELECT COUNT(*)
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                WHERE 1 = 1
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD'
                  {filtros};
                "
            );

            result.MermaInsumosHoy = await DecimalValue(
                conn,
                $@"
                SELECT IFNULL(SUM(rc.merma_insumos_desponche_bobinas), 0)
                FROM registros_control rc
                WHERE rc.fecha_registro = CURDATE()
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD';
                "
            );

            result.MermaProcesoHoy = await DecimalValue(
                conn,
                $@"
                SELECT IFNULL(SUM(rc.merma_proceso_monotapas), 0)
                FROM registros_control rc
                WHERE rc.fecha_registro = CURDATE()
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD';
                "
            );

            result.RegistrosConObservacionHoy = await Count(
                conn,
                $@"
                SELECT COUNT(*)
                FROM registros_control rc
                WHERE rc.fecha_registro = CURDATE()
                  AND rc.observacion IS NOT NULL
                  AND TRIM(rc.observacion) <> ''
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD';
                "
            );

            result.CumplimientoGeneral = CalcularPorcentaje(
                result.ControlesPeriodo - result.NoConformidadesDetectadas,
                result.ControlesPeriodo
            );

            await CargarCumplimientoPorInspector(conn, result, filtros);
            await CargarNoConformidadesPorInspector(conn, result, filtros);
            await CargarControlesPorProceso(conn, result, filtros);
            await CargarTendenciaCumplimiento(conn, result, filtros);
            await CargarDesempenoIndividual(conn, result, filtros);
            await CargarUltimosRegistros(conn, result, filtros);

            return result;
        }

        private async Task CargarCumplimientoPorInspector(
            MySqlConnection conn,
            DashboardResumenDto result,
            string filtros
        )
        {
            using var cmd = new MySqlCommand(
                $@"
                SELECT
                    u.nombre_completo AS inspector,
                    COUNT(DISTINCT rc.id) AS controles,
                    COUNT(DISTINCT CASE WHEN rfv.id IS NOT NULL THEN rc.id END) AS con_fallas
                FROM registros_control rc
                INNER JOIN usuarios u
                    ON u.id = rc.usuario_id
                LEFT JOIN registro_fallas_visuales rfv
                    ON rfv.registro_id = rc.id
                WHERE 1 = 1
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD'
                  {filtros}
                GROUP BY u.id, u.nombre_completo
                ORDER BY controles DESC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var controles = Int(reader, "controles");
                var conFallas = Int(reader, "con_fallas");

                result.CumplimientoPorInspector.Add(
                    new DashboardInspectorDto
                    {
                        Inspector = Text(reader, "inspector"),
                        Total = controles,
                        Porcentaje = CalcularPorcentaje(controles - conFallas, controles),
                    }
                );
            }
        }

        private async Task CargarNoConformidadesPorInspector(
            MySqlConnection conn,
            DashboardResumenDto result,
            string filtros
        )
        {
            using var cmd = new MySqlCommand(
                $@"
                SELECT
                    u.nombre_completo AS inspector,
                    COUNT(*) AS total
                FROM registro_fallas_visuales rfv
                INNER JOIN registros_control rc
                    ON rc.id = rfv.registro_id
                INNER JOIN usuarios u
                    ON u.id = rc.usuario_id
                WHERE 1 = 1
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD'
                  {filtros}
                GROUP BY u.id, u.nombre_completo
                ORDER BY total DESC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var total = Int(reader, "total");

                result.NoConformidadesPorInspector.Add(
                    new DashboardInspectorDto
                    {
                        Inspector = Text(reader, "inspector"),
                        Total = total,
                        Porcentaje = CalcularPorcentaje(total, result.NoConformidadesDetectadas),
                    }
                );
            }
        }

        private async Task CargarControlesPorProceso(
            MySqlConnection conn,
            DashboardResumenDto result,
            string filtros
        )
        {
            using var cmd = new MySqlCommand(
                $@"
                SELECT
                    p.nombre AS proceso,
                    u.nombre_completo AS inspector,
                    COUNT(*) AS total
                FROM registros_control rc
                INNER JOIN procesos p
                    ON p.id = rc.proceso_id
                INNER JOIN usuarios u
                    ON u.id = rc.usuario_id
                WHERE 1 = 1
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD'
                  {filtros}
                GROUP BY p.id, p.nombre, u.id, u.nombre_completo
                ORDER BY p.id, total DESC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                result.ControlesPorProceso.Add(
                    new DashboardProcesoInspectorDto
                    {
                        Proceso = Text(reader, "proceso"),
                        Inspector = Text(reader, "inspector"),
                        Total = Int(reader, "total"),
                    }
                );
            }
        }

        private async Task CargarTendenciaCumplimiento(
            MySqlConnection conn,
            DashboardResumenDto result,
            string filtros
        )
        {
            using var cmd = new MySqlCommand(
                $@"
                SELECT
                    DATE(rc.fecha_registro) AS fecha,
                    COUNT(DISTINCT rc.id) AS controles,
                    COUNT(DISTINCT CASE WHEN rfv.id IS NOT NULL THEN rc.id END) AS con_fallas
                FROM registros_control rc
                LEFT JOIN registro_fallas_visuales rfv
                    ON rfv.registro_id = rc.id
                WHERE 1 = 1
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD'
                  {filtros}
                GROUP BY DATE(rc.fecha_registro)
                ORDER BY DATE(rc.fecha_registro) ASC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var controles = Int(reader, "controles");
                var conFallas = Int(reader, "con_fallas");

                result.TendenciaCumplimiento.Add(
                    new DashboardTendenciaDto
                    {
                        Fecha = Convert.ToDateTime(reader["fecha"]).ToString("dd MMM"),
                        Cumplimiento =
                            controles == 0
                                ? 100
                                : CalcularPorcentaje(controles - conFallas, controles),
                    }
                );
            }
        }

        private async Task CargarDesempenoIndividual(
            MySqlConnection conn,
            DashboardResumenDto result,
            string filtros
        )
        {
            using var cmd = new MySqlCommand(
                $@"
                SELECT
                    u.nombre_completo AS inspector,
                    COUNT(DISTINCT rc.id) AS controles,
                    COUNT(DISTINCT CASE WHEN rfv.id IS NOT NULL THEN rc.id END) AS no_conformidades
                FROM registros_control rc
                INNER JOIN usuarios u
                    ON u.id = rc.usuario_id
                LEFT JOIN registro_fallas_visuales rfv
                    ON rfv.registro_id = rc.id
                WHERE 1 = 1
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD'
                  {filtros}
                GROUP BY u.id, u.nombre_completo
                ORDER BY controles DESC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var controles = Int(reader, "controles");
                var nc = Int(reader, "no_conformidades");
                var cumplimiento = CalcularPorcentaje(controles - nc, controles);

                result.DesempenoIndividual.Add(
                    new DashboardDesempenoInspectorDto
                    {
                        Inspector = Text(reader, "inspector"),
                        Cumplimiento = cumplimiento,
                        ControlesProgramados = controles,
                        ControlesRealizados = controles,
                        NoConformidades = nc,
                        Estado =
                            cumplimiento >= 95 ? "Excelente"
                            : cumplimiento >= 85 ? "A mejorar"
                            : "Crítico",
                    }
                );
            }
        }

        private async Task CargarUltimosRegistros(
            MySqlConnection conn,
            DashboardResumenDto result,
            string filtros
        )
        {
            using var cmd = new MySqlCommand(
                $@"
                SELECT
                    rc.id,
                    DATE_FORMAT(rc.fecha_registro, '%d-%m-%Y') AS fecha,
                    TIME_FORMAT(rc.hora_registro, '%H:%i') AS hora,
                    IFNULL(u.nombre_completo, '-') AS usuario,
                    IFNULL(p.nombre, '-') AS proceso,
                    IFNULL(m.nombre, '-') AS maquina,
                    IFNULL(f.nombre, '-') AS formulario,
                    IFNULL(rc.np, '-') AS np,
                    IFNULL(rc.descripcion_producto, '-') AS producto,
                    IFNULL(rc.turno, '-') AS turno,
                    IFNULL(ec.nombre, '-') AS estado,
                    IFNULL(rc.observacion, '-') AS observacion,
IFNULL(rc.estado_validacion, 'PENDIENTE') AS estado_validacion,
IFNULL(DATE_FORMAT(rc.fecha_validacion, '%d-%m-%Y %H:%i'), '') AS fecha_validacion,
IFNULL(rc.usuario_validacion, '') AS usuario_validacion,
IFNULL(ra.ruta_archivo, '') AS imagen_url
                FROM registros_control rc
                LEFT JOIN usuarios u ON rc.usuario_id = u.id
                LEFT JOIN procesos p ON rc.proceso_id = p.id
                LEFT JOIN maquinas m ON rc.maquina_id = m.id
                LEFT JOIN formularios_control f ON rc.formulario_id = f.id
                LEFT JOIN estados_catalogo ec ON rc.estado_id = ec.id
                LEFT JOIN registro_adjuntos ra ON ra.registro_id = rc.id
                WHERE 1 = 1
                  AND UPPER(IFNULL(rc.area, '')) = 'CALIDAD'
                  {filtros}
                ORDER BY rc.id DESC
                LIMIT 15;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                result.UltimosRegistros.Add(
                    new DashboardRegistroDto
                    {
                        Id = Int(reader, "id"),
                        FechaRegistro = Text(reader, "fecha"),
                        HoraRegistro = Text(reader, "hora"),
                        Usuario = Text(reader, "usuario"),
                        Proceso = Text(reader, "proceso"),
                        Maquina = Text(reader, "maquina"),
                        Formulario = Text(reader, "formulario"),
                        Np = Text(reader, "np"),
                        Producto = Text(reader, "producto"),
                        Turno = Text(reader, "turno"),
                        Estado = Text(reader, "estado"),
                        Observacion = Text(reader, "observacion"),
                        EstadoValidacion = Text(reader, "estado_validacion"),
                        FechaValidacion = Text(reader, "fecha_validacion"),
                        UsuarioValidacion = Text(reader, "usuario_validacion"),
                        ImagenUrl = Text(reader, "imagen_url"),
                    }
                );
            }
        }

        private static string BuildFiltros(
            string fechaDesde,
            string fechaHasta,
            string inspector,
            string turno,
            string proceso
        )
        {
            var filtros = "";

            if (!string.IsNullOrWhiteSpace(fechaDesde))
                filtros += $" AND rc.fecha_registro >= '{fechaDesde}'";

            if (!string.IsNullOrWhiteSpace(fechaHasta))
                filtros += $" AND rc.fecha_registro <= '{fechaHasta}'";

            if (string.IsNullOrWhiteSpace(fechaDesde) && string.IsNullOrWhiteSpace(fechaHasta))
                filtros += " AND rc.fecha_registro >= CURDATE() - INTERVAL 6 DAY";

            if (!string.IsNullOrWhiteSpace(inspector))
                filtros += $" AND rc.usuario_id = {inspector}";

            if (!string.IsNullOrWhiteSpace(turno))
                filtros += $" AND rc.turno = '{turno}'";

            if (!string.IsNullOrWhiteSpace(proceso))
                filtros += $" AND rc.proceso_id = {proceso}";

            return filtros;
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

        private static decimal CalcularPorcentaje(decimal valor, decimal total)
        {
            if (total <= 0)
                return 100;

            return Math.Round((valor / total) * 100, 0);
        }

        private static int Int(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? 0 : Convert.ToInt32(reader[column]);
        }

        private static string Text(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? "" : reader[column]?.ToString() ?? "";
        }

        public async Task<DashboardFiltrosDto> ObtenerFiltros()
        {
            var result = new DashboardFiltrosDto();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using (
                var cmd = new MySqlCommand(
                    @"
        SELECT id, nombre_completo
        FROM usuarios
        WHERE activo = 1
        ORDER BY nombre_completo
    ",
                    conn
                )
            )
            {
                using var reader = await cmd.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    result.Usuarios.Add(
                        new DashboardCatalogoDto
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            Nombre = reader["nombre_completo"]?.ToString() ?? "",
                        }
                    );
                }
            }

            using (
                var cmd = new MySqlCommand(
                    @"
        SELECT id, nombre
        FROM procesos
        WHERE activo = 1
        ORDER BY nombre
    ",
                    conn
                )
            )
            {
                using var reader = await cmd.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    result.Procesos.Add(
                        new DashboardCatalogoDto
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            Nombre = reader["nombre"]?.ToString() ?? "",
                        }
                    );
                }
            }

            return result;
        }

        public async Task ValidarRegistro(int id)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
        UPDATE registros_control
        SET
            estado_validacion = 'VALIDADO',
            fecha_validacion = NOW(),
            usuario_validacion = 'SUPERVISOR'
        WHERE id = @id
    ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }

        public async Task RechazarRegistro(int id)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
        UPDATE registros_control
        SET
            estado_validacion = 'RECHAZADO',
            fecha_validacion = NOW(),
            usuario_validacion = 'SUPERVISOR'
        WHERE id = @id
    ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }

        public async Task ValidarTodo()
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
        UPDATE registros_control
        SET
            estado_validacion = 'VALIDADO',
            fecha_validacion = NOW(),
            usuario_validacion = 'SUPERVISOR'
        ",
                conn
            );

            await cmd.ExecuteNonQueryAsync();
        }

        public async Task RechazarTodo()
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
        UPDATE registros_control
        SET
            estado_validacion = 'RECHAZADO',
            fecha_validacion = NOW(),
            usuario_validacion = 'SUPERVISOR'
        ",
                conn
            );

            await cmd.ExecuteNonQueryAsync();
        }
    }
}
