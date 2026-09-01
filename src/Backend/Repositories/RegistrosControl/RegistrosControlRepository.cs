using MySqlConnector;
using QualityControlCenter.Modules.RegistrosControl;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.RegistrosControl
{
    public class RegistrosControlRepository
    {
        // Turno A 07:00-19:00, turno B 19:00-07:00 (hora de la inspección), calculado en vivo.
        private const string TurnoCalculadoSql =
            "(CASE WHEN rc.hora_registro >= '07:00:00' AND rc.hora_registro < '19:00:00' THEN 'A' ELSE 'B' END)";

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
            string? estado,
            int? id = null,
            int? procesoId = null,
            int? parametroId = null
        )
        {
            var items = new List<RegistroControlItem>();

            var offset = (page - 1) * limit;

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var where = new List<string> { "rc.eliminado = 0" };
            var parameters = new List<MySqlParameter>();

            if (id.HasValue)
            {
                where.Add("rc.id = @id");
                parameters.Add(new MySqlParameter("@id", id.Value));
            }

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

            // El turno se calcula en vivo por hora de inspección (A: 07:00-19:00, B: 19:00-07:00),
            // no se confía en la columna rc.turno (la elige libremente quien registra en la app
            // móvil y puede no coincidir con la hora real).
            if (!string.IsNullOrWhiteSpace(turno))
            {
                where.Add(TurnoCalculadoSql + " = @turno");
                parameters.Add(new MySqlParameter("@turno", turno));
            }

            if (!string.IsNullOrWhiteSpace(estado))
            {
                where.Add("ec.nombre = @estado");
                parameters.Add(new MySqlParameter("@estado", estado));
            }

            // Usado por el deep-link "Gestionar" de una alerta de Inicio (desviación por
            // proceso+defecto): muestra todos los registros que componen esa alerta, no solo uno.
            if (procesoId.HasValue)
            {
                where.Add("rc.proceso_id = @procesoId");
                parameters.Add(new MySqlParameter("@procesoId", procesoId.Value));
            }

            if (parametroId.HasValue)
            {
                where.Add(
                    "EXISTS (SELECT 1 FROM registro_fallas_visuales rfv3 WHERE rfv3.registro_id = rc.id AND rfv3.parametro_id = @parametroId)"
                );
                parameters.Add(new MySqlParameter("@parametroId", parametroId.Value));
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

            // Cuando se filtra por NP, se traen todas las filas de esa NP sin paginar: una NP puede
            // tener varios ítems/registros y quedaban repartidos entre varias páginas, dificultando
            // verlos todos juntos.
            var sinLimite = !string.IsNullOrWhiteSpace(np) || procesoId.HasValue || parametroId.HasValue;

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
                        COALESCE(rc.codigo_producto, '') AS codigo_producto,
                        COALESCE(rc.descripcion_producto, '') AS producto,
                        {TurnoCalculadoSql} AS turno,
                        rc.estado_id,
                        ec.nombre AS estado,
                        COALESCE(rc.observacion, '') AS observacion,
                        COALESCE(rc.tipo_merma, '') AS tipo_merma,
                        COALESCE(rc.cantidad_merma, '') AS cantidad_merma,
                        IFNULL((
                            SELECT GROUP_CONCAT(DISTINCT pcv.nombre SEPARATOR '; ')
                            FROM registro_fallas_visuales rfv2
                            INNER JOIN parametros_control_visual pcv ON pcv.id = rfv2.parametro_id
                            WHERE rfv2.registro_id = rc.id
                        ), '') AS tipo_defecto,
                        IFNULL((
                            SELECT GROUP_CONCAT(
                                rb.lote
                                ORDER BY rb.escaneado_en ASC, rb.id ASC SEPARATOR '; '
                            )
                            FROM registro_control_bobinas rb
                            WHERE rb.registro_id = rc.id
                        ), '') AS bobina_lote,
                        IFNULL((
                            SELECT GROUP_CONCAT(
                                COALESCE(rb.item_code, '')
                                ORDER BY rb.escaneado_en ASC, rb.id ASC SEPARATOR '; '
                            )
                            FROM registro_control_bobinas rb
                            WHERE rb.registro_id = rc.id
                        ), '') AS bobina_codigo,
                        IFNULL((
                            SELECT GROUP_CONCAT(
                                COALESCE(rb.item_name, '')
                                ORDER BY rb.escaneado_en ASC, rb.id ASC SEPARATOR '; '
                            )
                            FROM registro_control_bobinas rb
                            WHERE rb.registro_id = rc.id
                        ), '') AS bobina_descripcion,
                        IFNULL((
                            SELECT GROUP_CONCAT(
                                COALESCE(rb.observacion, '')
                                ORDER BY rb.escaneado_en ASC, rb.id ASC SEPARATOR '; '
                            )
                            FROM registro_control_bobinas rb
                            WHERE rb.registro_id = rc.id
                        ), '') AS bobina_observacion,
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
                    LEFT JOIN registro_adjuntos ra
                        ON ra.id = (SELECT MIN(ra2.id) FROM registro_adjuntos ra2 WHERE ra2.registro_id = rc.id)
                    {whereSql}
                    ORDER BY rc.fecha_registro DESC, rc.hora_registro DESC, rc.id DESC
                    {(sinLimite ? "" : "LIMIT @limit OFFSET @offset")};
                ";

                await using var cmd = new MySqlCommand(sql, conn);

                foreach (var param in parameters)
                    cmd.Parameters.Add(new MySqlParameter(param.ParameterName, param.Value));

                if (!sinLimite)
                {
                    cmd.Parameters.AddWithValue("@limit", limit);
                    cmd.Parameters.AddWithValue("@offset", offset);
                }

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
                            CodigoProducto = reader.GetString("codigo_producto"),
                            Producto = reader.GetString("producto"),
                            Turno = reader.GetString("turno"),
                            EstadoId = reader.GetInt32("estado_id"),
                            Estado = reader.GetString("estado"),
                            Observacion = reader.GetString("observacion"),
                            TipoMerma = reader.GetString("tipo_merma"),
                            CantidadMerma = reader.GetString("cantidad_merma"),
                            TipoDefecto = reader.GetString("tipo_defecto"),
                            BobinaLote = reader.GetString("bobina_lote"),
                            BobinaCodigo = reader.GetString("bobina_codigo"),
                            BobinaDescripcion = reader.GetString("bobina_descripcion"),
                            BobinaObservacion = reader.GetString("bobina_observacion"),
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

        public async Task EliminarRegistro(int id)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"
                UPDATE registros_control
                SET eliminado = 1
                WHERE id = @id
                  AND eliminado = 0;
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);

            await cmd.ExecuteNonQueryAsync();
        }
    }
}
