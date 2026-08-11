using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.ControlDocumental
{
    // Módulo "Control Documental" — INNPACK, standalone (MySQL calidad).
    // documento = identidad estable (codigo_base); documento_versiones = historial append-only,
    // arranca desde la versión vigente actual (ver contex-control-documental.md).
    public class ControlDocumentalRepository
    {
        private readonly DbService _db;

        private static readonly (string Json, string Column)[] DocumentoColumns = new[]
        {
            ("id", "id"),
            ("codigoBase", "codigo_base"),
            ("tipoDocumento", "tipo_documento"),
            ("area", "area"),
            ("nombre", "nombre"),
            ("alcanceEmpresa", "alcance_empresa"),
            ("estado", "estado"),
            ("responsable", "responsable"),
            ("ubicacion", "ubicacion"),
            ("observaciones", "observaciones"),
            ("creadoPor", "creado_por"),
            ("fechaCreacion", "fecha_creacion"),
            ("actualizadoPor", "actualizado_por"),
            ("fechaActualizacion", "fecha_actualizacion"),
        };

        // Campos editables de la cabecera del documento (create/update parcial). No incluye la versión.
        private static readonly (string Json, string Column)[] CamposEditables = new[]
        {
            ("codigoBase", "codigo_base"),
            ("tipoDocumento", "tipo_documento"),
            ("area", "area"),
            ("nombre", "nombre"),
            ("alcanceEmpresa", "alcance_empresa"),
            ("estado", "estado"),
            ("responsable", "responsable"),
            ("ubicacion", "ubicacion"),
            ("observaciones", "observaciones"),
        };

        public ControlDocumentalRepository(DbService db)
        {
            _db = db;
        }

        private static readonly string DocumentoSelectSql =
            "SELECT " + string.Join(", ", DocumentoColumns.Select(c => "d." + c.Column)) + " FROM documentos d";

        private static object? GetVal(MySqlDataReader r, string column)
        {
            var ord = r.GetOrdinal(column);
            if (r.IsDBNull(ord))
                return null;

            var value = r.GetValue(ord);
            if (value is DateTime dt)
                return dt.TimeOfDay == TimeSpan.Zero
                    ? dt.ToString("yyyy-MM-dd")
                    : dt.ToString("yyyy-MM-dd HH:mm:ss");

            return value;
        }

        private static Dictionary<string, object?> MapDocumentoRow(MySqlDataReader r)
        {
            var row = new Dictionary<string, object?>();
            foreach (var (json, column) in DocumentoColumns)
                row[json] = GetVal(r, column);
            return row;
        }

        private static Dictionary<string, object?> MapVersionRow(MySqlDataReader r)
        {
            return new Dictionary<string, object?>
            {
                ["id"] = r.GetInt32("id"),
                ["documentoId"] = r.GetInt32("documento_id"),
                ["version"] = GetVal(r, "version"),
                ["fechaActualizacion"] = GetVal(r, "fecha_actualizacion"),
                ["proximaRevision"] = GetVal(r, "proxima_revision"),
                ["esVersionVigente"] = Convert.ToBoolean(r.GetValue(r.GetOrdinal("es_version_vigente"))),
                ["creadoPor"] = GetVal(r, "creado_por"),
                ["fechaCreacion"] = GetVal(r, "fecha_creacion"),
            };
        }

        private static void AplicarFiltros(
            List<string> where,
            List<MySqlParameter> parameters,
            string? texto,
            string? tipoDocumento,
            string? area,
            string? estado,
            string? alcanceEmpresa
        )
        {
            if (!string.IsNullOrWhiteSpace(texto))
            {
                where.Add("(d.nombre LIKE @texto OR d.codigo_base LIKE @texto)");
                parameters.Add(new MySqlParameter("@texto", $"%{texto}%"));
            }
            if (!string.IsNullOrWhiteSpace(tipoDocumento))
            {
                where.Add("d.tipo_documento = @tipoDocumento");
                parameters.Add(new MySqlParameter("@tipoDocumento", tipoDocumento));
            }
            if (!string.IsNullOrWhiteSpace(area))
            {
                where.Add("d.area = @area");
                parameters.Add(new MySqlParameter("@area", area));
            }
            if (!string.IsNullOrWhiteSpace(estado))
            {
                where.Add("d.estado = @estado");
                parameters.Add(new MySqlParameter("@estado", estado));
            }
            if (!string.IsNullOrWhiteSpace(alcanceEmpresa))
            {
                where.Add("d.alcance_empresa = @alcanceEmpresa");
                parameters.Add(new MySqlParameter("@alcanceEmpresa", alcanceEmpresa));
            }
        }

        public async Task<(List<Dictionary<string, object?>> Items, int Total)> Listar(
            int page,
            int pageSize,
            string? texto,
            string? tipoDocumento,
            string? area,
            string? estado,
            string? alcanceEmpresa
        )
        {
            var where = new List<string> { "d.eliminado = 0" };
            var parameters = new List<MySqlParameter>();
            AplicarFiltros(where, parameters, texto, tipoDocumento, area, estado, alcanceEmpresa);
            var whereSql = "WHERE " + string.Join(" AND ", where);

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var total = 0;
            await using (
                var countCmd = new MySqlCommand($"SELECT COUNT(*) FROM documentos d {whereSql}", conn)
            )
            {
                countCmd.Parameters.AddRange(parameters.ToArray());
                total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
            }

            var items = new List<Dictionary<string, object?>>();
            var offset = (page - 1) * pageSize;

            var selectSql =
                "SELECT " + string.Join(", ", DocumentoColumns.Select(c => "d." + c.Column))
                + ", v.id AS version_vigente_id, v.version AS version_vigente, "
                + "v.fecha_actualizacion AS version_fecha_actualizacion, v.proxima_revision AS version_proxima_revision, "
                + "da.nombre_archivo AS adjunto_vigente_nombre "
                + "FROM documentos d "
                + "LEFT JOIN documento_versiones v ON v.documento_id = d.id AND v.es_version_vigente = 1 "
                + "LEFT JOIN documento_adjuntos da ON da.documento_version_id = v.id "
                + $"{whereSql} ORDER BY d.nombre ASC, d.id DESC LIMIT @limit OFFSET @offset";

            await using (var cmd = new MySqlCommand(selectSql, conn))
            {
                foreach (var p in parameters)
                    cmd.Parameters.Add(new MySqlParameter(p.ParameterName, p.Value));
                cmd.Parameters.AddWithValue("@limit", pageSize);
                cmd.Parameters.AddWithValue("@offset", offset);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var row = MapDocumentoRow(reader);
                    row["versionVigente"] = GetVal(reader, "version_vigente");
                    row["versionVigenteId"] = GetVal(reader, "version_vigente_id");
                    row["versionFechaActualizacion"] = GetVal(reader, "version_fecha_actualizacion");
                    row["versionProximaRevision"] = GetVal(reader, "version_proxima_revision");
                    var adjuntoNombre = GetVal(reader, "adjunto_vigente_nombre");
                    row["adjuntoVigenteNombre"] = adjuntoNombre;
                    row["tieneAdjuntoVigente"] = adjuntoNombre != null;
                    items.Add(row);
                }
            }

            return (items, total);
        }

        public async Task<Dictionary<string, object?>?> ObtenerPorId(int id)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            Dictionary<string, object?>? documento = null;
            await using (var cmd = new MySqlCommand($"{DocumentoSelectSql} WHERE d.id = @id AND d.eliminado = 0", conn))
            {
                cmd.Parameters.AddWithValue("@id", id);
                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                    documento = MapDocumentoRow(reader);
            }

            if (documento == null)
                return null;

            var versiones = new List<Dictionary<string, object?>>();
            await using (
                var cmd = new MySqlCommand(
                    "SELECT id, documento_id, version, fecha_actualizacion, proxima_revision, es_version_vigente, creado_por, fecha_creacion "
                        + "FROM documento_versiones WHERE documento_id = @id ORDER BY fecha_creacion DESC, id DESC",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    versiones.Add(MapVersionRow(reader));
            }

            documento["versiones"] = versiones;
            return documento;
        }

        public async Task<int> Crear(
            Dictionary<string, object?> campos,
            string version,
            string fechaActualizacion,
            string? proximaRevision,
            string? creadoPor,
            string? adjuntoNombreArchivo = null,
            string? adjuntoTipoMime = null,
            byte[]? adjuntoContenido = null
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();

            try
            {
                var cols = new List<string> { "creado_por" };
                var paramNames = new List<string> { "@creadoPor" };
                var parameters = new List<MySqlParameter>
                {
                    new("@creadoPor", (object?)creadoPor ?? DBNull.Value),
                };

                foreach (var (json, column) in CamposEditables)
                {
                    if (!campos.TryGetValue(json, out var value))
                        continue;
                    cols.Add(column);
                    var paramName = $"@{json}";
                    paramNames.Add(paramName);
                    parameters.Add(new MySqlParameter(paramName, value ?? DBNull.Value));
                }

                var insertSql =
                    $"INSERT INTO documentos ({string.Join(", ", cols)}) VALUES ({string.Join(", ", paramNames)}); SELECT LAST_INSERT_ID();";

                int documentoId;
                await using (var cmd = new MySqlCommand(insertSql, conn, tx))
                {
                    cmd.Parameters.AddRange(parameters.ToArray());
                    documentoId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
                }

                int versionId;
                await using (
                    var cmd = new MySqlCommand(
                        "INSERT INTO documento_versiones (documento_id, version, fecha_actualizacion, proxima_revision, es_version_vigente, creado_por) "
                            + "VALUES (@documentoId, @version, @fechaActualizacion, @proximaRevision, 1, @creadoPor); SELECT LAST_INSERT_ID();",
                        conn,
                        tx
                    )
                )
                {
                    cmd.Parameters.AddWithValue("@documentoId", documentoId);
                    cmd.Parameters.AddWithValue("@version", version);
                    cmd.Parameters.AddWithValue("@fechaActualizacion", fechaActualizacion);
                    cmd.Parameters.AddWithValue("@proximaRevision", (object?)proximaRevision ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@creadoPor", (object?)creadoPor ?? DBNull.Value);
                    versionId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
                }

                if (adjuntoContenido != null)
                {
                    await using var cmdAdjunto = new MySqlCommand(
                        "INSERT INTO documento_adjuntos (documento_version_id, nombre_archivo, tipo_mime, tamano_bytes, contenido, subido_por) "
                            + "VALUES (@versionId, @nombreArchivo, @tipoMime, @tamanoBytes, @contenido, @subidoPor)",
                        conn,
                        tx
                    );
                    cmdAdjunto.Parameters.AddWithValue("@versionId", versionId);
                    cmdAdjunto.Parameters.AddWithValue("@nombreArchivo", adjuntoNombreArchivo!);
                    cmdAdjunto.Parameters.AddWithValue("@tipoMime", adjuntoTipoMime!);
                    cmdAdjunto.Parameters.AddWithValue("@tamanoBytes", adjuntoContenido.Length);
                    cmdAdjunto.Parameters.AddWithValue("@contenido", adjuntoContenido);
                    cmdAdjunto.Parameters.AddWithValue("@subidoPor", (object?)creadoPor ?? DBNull.Value);
                    await cmdAdjunto.ExecuteNonQueryAsync();
                }

                await tx.CommitAsync();
                return documentoId;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }

        public async Task Actualizar(int id, Dictionary<string, object?> campos, string? actualizadoPor)
        {
            var sets = new List<string>();
            var parameters = new List<MySqlParameter> { new("@id", id) };

            foreach (var (json, column) in CamposEditables)
            {
                if (!campos.TryGetValue(json, out var value))
                    continue;
                var paramName = $"@{json}";
                sets.Add($"{column} = {paramName}");
                parameters.Add(new MySqlParameter(paramName, value ?? DBNull.Value));
            }

            if (!string.IsNullOrWhiteSpace(actualizadoPor))
            {
                sets.Add("actualizado_por = @actualizadoPor");
                parameters.Add(new MySqlParameter("@actualizadoPor", actualizadoPor));
            }

            if (sets.Count == 0)
                return;

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                $"UPDATE documentos SET {string.Join(", ", sets)} WHERE id = @id",
                conn
            );
            cmd.Parameters.AddRange(parameters.ToArray());
            await cmd.ExecuteNonQueryAsync();
        }

        // Cambio de versión: la versión vigente anterior deja de serlo, se inserta la nueva como
        // vigente y se toca la auditoría del documento. Nunca se pisa ni se borra una versión previa.
        public async Task<int> CrearVersion(
            int documentoId,
            string version,
            string fechaActualizacion,
            string? proximaRevision,
            string? creadoPor,
            string? adjuntoNombreArchivo = null,
            string? adjuntoTipoMime = null,
            byte[]? adjuntoContenido = null
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();

            try
            {
                await using (
                    var cmd = new MySqlCommand(
                        "UPDATE documento_versiones SET es_version_vigente = 0 WHERE documento_id = @documentoId AND es_version_vigente = 1",
                        conn,
                        tx
                    )
                )
                {
                    cmd.Parameters.AddWithValue("@documentoId", documentoId);
                    await cmd.ExecuteNonQueryAsync();
                }

                int versionId;
                await using (
                    var cmd = new MySqlCommand(
                        "INSERT INTO documento_versiones (documento_id, version, fecha_actualizacion, proxima_revision, es_version_vigente, creado_por) "
                            + "VALUES (@documentoId, @version, @fechaActualizacion, @proximaRevision, 1, @creadoPor); SELECT LAST_INSERT_ID();",
                        conn,
                        tx
                    )
                )
                {
                    cmd.Parameters.AddWithValue("@documentoId", documentoId);
                    cmd.Parameters.AddWithValue("@version", version);
                    cmd.Parameters.AddWithValue("@fechaActualizacion", fechaActualizacion);
                    cmd.Parameters.AddWithValue("@proximaRevision", (object?)proximaRevision ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@creadoPor", (object?)creadoPor ?? DBNull.Value);
                    versionId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
                }

                await using (
                    var cmd = new MySqlCommand(
                        "UPDATE documentos SET actualizado_por = @actualizadoPor WHERE id = @id",
                        conn,
                        tx
                    )
                )
                {
                    cmd.Parameters.AddWithValue("@actualizadoPor", (object?)creadoPor ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@id", documentoId);
                    await cmd.ExecuteNonQueryAsync();
                }

                if (adjuntoContenido != null)
                {
                    await using var cmdAdjunto = new MySqlCommand(
                        "INSERT INTO documento_adjuntos (documento_version_id, nombre_archivo, tipo_mime, tamano_bytes, contenido, subido_por) "
                            + "VALUES (@versionId, @nombreArchivo, @tipoMime, @tamanoBytes, @contenido, @subidoPor)",
                        conn,
                        tx
                    );
                    cmdAdjunto.Parameters.AddWithValue("@versionId", versionId);
                    cmdAdjunto.Parameters.AddWithValue("@nombreArchivo", adjuntoNombreArchivo!);
                    cmdAdjunto.Parameters.AddWithValue("@tipoMime", adjuntoTipoMime!);
                    cmdAdjunto.Parameters.AddWithValue("@tamanoBytes", adjuntoContenido.Length);
                    cmdAdjunto.Parameters.AddWithValue("@contenido", adjuntoContenido);
                    cmdAdjunto.Parameters.AddWithValue("@subidoPor", (object?)creadoPor ?? DBNull.Value);
                    await cmdAdjunto.ExecuteNonQueryAsync();
                }

                await tx.CommitAsync();
                return versionId;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }

        // Borrado lógico: nunca se hace DELETE físico sobre documentos (mismo criterio que
        // registros_control/no_conformidades/importacion_pnc en el resto del sistema).
        public async Task Eliminar(int id, string? actualizadoPor)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                "UPDATE documentos SET eliminado = 1, actualizado_por = @actualizadoPor WHERE id = @id",
                conn
            );
            cmd.Parameters.AddWithValue("@actualizadoPor", (object?)actualizadoPor ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync();
        }

        // Un solo adjunto por versión (UNIQUE documento_version_id): volver a subir reemplaza el anterior.
        public async Task SubirAdjunto(
            int documentoVersionId,
            string nombreArchivo,
            string tipoMime,
            byte[] contenido,
            string? subidoPor
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"INSERT INTO documento_adjuntos
                    (documento_version_id, nombre_archivo, tipo_mime, tamano_bytes, contenido, subido_por)
                  VALUES (@versionId, @nombreArchivo, @tipoMime, @tamanoBytes, @contenido, @subidoPor)
                  ON DUPLICATE KEY UPDATE
                    nombre_archivo = VALUES(nombre_archivo),
                    tipo_mime = VALUES(tipo_mime),
                    tamano_bytes = VALUES(tamano_bytes),
                    contenido = VALUES(contenido),
                    subido_por = VALUES(subido_por),
                    fecha_subida = CURRENT_TIMESTAMP",
                conn
            );
            cmd.Parameters.AddWithValue("@versionId", documentoVersionId);
            cmd.Parameters.AddWithValue("@nombreArchivo", nombreArchivo);
            cmd.Parameters.AddWithValue("@tipoMime", tipoMime);
            cmd.Parameters.AddWithValue("@tamanoBytes", contenido.Length);
            cmd.Parameters.AddWithValue("@contenido", contenido);
            cmd.Parameters.AddWithValue("@subidoPor", (object?)subidoPor ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task<(string NombreArchivo, string TipoMime, byte[] Contenido)?> ObtenerAdjunto(
            int documentoVersionId
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                "SELECT nombre_archivo, tipo_mime, contenido FROM documento_adjuntos WHERE documento_version_id = @versionId",
                conn
            );
            cmd.Parameters.AddWithValue("@versionId", documentoVersionId);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return (
                reader.GetString("nombre_archivo"),
                reader.GetString("tipo_mime"),
                (byte[])reader["contenido"]
            );
        }
    }
}
