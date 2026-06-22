using MySqlConnector;
using QualityControlCenter.Modules.RegistrosControl;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.RegistrosControl
{
    public class RegistrosControlRepository
    {
        private readonly DbService _db;

        public RegistrosControlRepository(DbService db)
        {
            _db = db;
        }

        public async Task<(List<RegistroControlItem> Items, int Total)> ObtenerRegistros(
            int page,
            int limit,
            string? fechaDesde,
            string? fechaHasta,
            string? np,
            string? turno,
            string? estado
        )
        {
            var items = new List<RegistroControlItem>();

            var offset = (page - 1) * limit;

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var where = new List<string>();
            var parameters = new List<MySqlParameter>();

            if (!string.IsNullOrWhiteSpace(fechaDesde))
            {
                where.Add("rc.fecha_registro >= @fechaDesde");
                parameters.Add(new MySqlParameter("@fechaDesde", fechaDesde));
            }

            if (!string.IsNullOrWhiteSpace(fechaHasta))
            {
                where.Add("rc.fecha_registro <= @fechaHasta");
                parameters.Add(new MySqlParameter("@fechaHasta", fechaHasta));
            }

            if (!string.IsNullOrWhiteSpace(np))
            {
                where.Add("rc.np LIKE @np");
                parameters.Add(new MySqlParameter("@np", $"%{np}%"));
            }

            if (!string.IsNullOrWhiteSpace(turno))
            {
                where.Add("rc.turno = @turno");
                parameters.Add(new MySqlParameter("@turno", turno));
            }

            if (!string.IsNullOrWhiteSpace(estado))
            {
                where.Add("ec.nombre = @estado");
                parameters.Add(new MySqlParameter("@estado", estado));
            }

            var whereSql = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";

            var countSql =
                $@"
                SELECT COUNT(*)
                FROM registros_control rc
                INNER JOIN usuarios u ON u.id = rc.usuario_id
                INNER JOIN procesos p ON p.id = rc.proceso_id
                INNER JOIN maquinas m ON m.id = rc.maquina_id
                LEFT JOIN formularios_control fc ON fc.id = rc.formulario_id
                INNER JOIN estados_catalogo ec ON ec.id = rc.estado_id
                {whereSql};
            ";

            await using (var countCmd = new MySqlCommand(countSql, conn))
            {
                countCmd.Parameters.AddRange(parameters.ToArray());
                var totalObj = await countCmd.ExecuteScalarAsync();
                var total = Convert.ToInt32(totalObj);

                var sql =
                    $@"
                    SELECT
                        rc.id,
                        rc.usuario_id,
                        u.nombre_completo AS usuario,
                        rc.proceso_id,
                        p.nombre AS proceso,
                        rc.maquina_id,
                        m.nombre AS maquina,
                        rc.formulario_id,
                        COALESCE(fc.nombre, '') AS formulario,
                        COALESCE(rc.np, '') AS np,
                        rc.turno,
                        rc.estado_id,
                        ec.nombre AS estado,
                        COALESCE(rc.observacion, '') AS observacion,
                        IFNULL(rc.estado_validacion, 'PENDIENTE') AS estado_validacion,
                        IFNULL(DATE_FORMAT(rc.fecha_validacion, '%d-%m-%Y %H:%i'), '') AS fecha_validacion,
                        IFNULL(rc.usuario_validacion, '') AS usuario_validacion,
                        IFNULL(ra.ruta_archivo, '') AS imagen_url,
                        DATE_FORMAT(rc.fecha_registro, '%Y-%m-%d') AS fecha_registro,
                        TIME_FORMAT(rc.hora_registro, '%H:%i:%s') AS hora_registro,
                        DATE_FORMAT(rc.creado_en, '%Y-%m-%d %H:%i:%s') AS creado_en
                    FROM registros_control rc
                    INNER JOIN usuarios u ON u.id = rc.usuario_id
                    INNER JOIN procesos p ON p.id = rc.proceso_id
                    INNER JOIN maquinas m ON m.id = rc.maquina_id
                    LEFT JOIN formularios_control fc ON fc.id = rc.formulario_id
                    INNER JOIN estados_catalogo ec ON ec.id = rc.estado_id
                    LEFT JOIN registro_adjuntos ra ON ra.registro_id = rc.id
                    {whereSql}
                    ORDER BY rc.fecha_registro DESC, rc.hora_registro DESC, rc.id DESC
                    LIMIT @limit OFFSET @offset;
                ";

                await using var cmd = new MySqlCommand(sql, conn);

                foreach (var param in parameters)
                    cmd.Parameters.Add(new MySqlParameter(param.ParameterName, param.Value));

                cmd.Parameters.AddWithValue("@limit", limit);
                cmd.Parameters.AddWithValue("@offset", offset);

                await using var reader = await cmd.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    items.Add(
                        new RegistroControlItem
                        {
                            Id = reader.GetInt32("id"),
                            UsuarioId = reader.GetInt32("usuario_id"),
                            Usuario = reader.GetString("usuario"),
                            ProcesoId = reader.GetInt32("proceso_id"),
                            Proceso = reader.GetString("proceso"),
                            MaquinaId = reader.GetInt32("maquina_id"),
                            Maquina = reader.GetString("maquina"),
                            FormularioId = reader.IsDBNull(reader.GetOrdinal("formulario_id"))
                                ? null
                                : reader.GetInt32("formulario_id"),
                            Formulario = reader.GetString("formulario"),
                            Np = reader.GetString("np"),
                            Turno = reader.GetString("turno"),
                            EstadoId = reader.GetInt32("estado_id"),
                            Estado = reader.GetString("estado"),
                            Observacion = reader.GetString("observacion"),
                            EstadoValidacion = reader.GetString("estado_validacion"),
                            FechaValidacion = reader.GetString("fecha_validacion"),
                            UsuarioValidacion = reader.GetString("usuario_validacion"),
                            ImagenUrl = reader.GetString("imagen_url"),
                            FechaRegistro = reader.GetString("fecha_registro"),
                            HoraRegistro = reader.GetString("hora_registro"),
                            CreadoEn = reader.GetString("creado_en"),
                        }
                    );
                }

                return (items, total);
            }
        }

        public async Task ValidarRegistro(int id)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"
                UPDATE registros_control
                SET
                    estado_validacion = 'VALIDADO',
                    fecha_validacion = NOW(),
                    usuario_validacion = 'SUPERVISOR'
                WHERE id = @id;
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }

        public async Task RechazarRegistro(int id)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"
                UPDATE registros_control
                SET
                    estado_validacion = 'RECHAZADO',
                    fecha_validacion = NOW(),
                    usuario_validacion = 'SUPERVISOR'
                WHERE id = @id;
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }
    }
}
