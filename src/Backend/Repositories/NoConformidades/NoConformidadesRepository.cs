using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.NoConformidades
{
    // Módulo standalone en MySQL `calidad` (192.168.1.70), sin relación con Faret ni con
    // registros_control. Cada fila de no_conformidades trae de una sola vez la cabecera de la NC
    // (tipo/origen/severidad/proceso/...) y los campos tipo "PNC" (npNv/cliente/cantidades/...) —
    // no existe la separación Data/NC de dos APIs que tiene el módulo equivalente en Faret.
    public class NoConformidadesRepository
    {
        private readonly DbService _db;

        // (clave camelCase para el frontend, columna real en MySQL)
        private static readonly (string Json, string Column)[] Columns = new[]
        {
            ("id", "id"),
            ("codigo", "codigo"),
            ("tipo", "tipo"),
            ("origen", "origen"),
            ("titulo", "titulo"),
            ("descripcion", "descripcion"),
            ("severidad", "severidad"),
            ("proceso", "proceso"),
            ("norma", "norma"),
            ("reportadoPor", "reportado_por"),
            ("fechaDeteccion", "fecha_deteccion"),
            ("estado", "estado"),
            ("responsable", "responsable"),
            ("estadoGestion", "estado_gestion"),
            ("fechaCompromiso", "fecha_compromiso"),
            ("cerradoPor", "cerrado_por"),
            ("comentarioCierre", "comentario_cierre"),
            ("fechaCierre", "fecha_cierre"),
            ("tipoPnc", "tipo_pnc"),
            ("fechaIngreso", "fecha_ingreso"),
            ("fechaSalida", "fecha_salida"),
            ("npNv", "np_nv"),
            ("cliente", "cliente"),
            ("codigoProducto", "codigo_producto"),
            ("producto", "producto"),
            ("cantRequerida", "cant_requerida"),
            ("cantRechazada", "cant_rechazada"),
            ("cantRecuperada", "cant_recuperada"),
            ("pncReal", "pnc_real"),
            ("pctRecuperacion", "pct_recuperacion"),
            ("fechaFabricacion", "fecha_fabricacion"),
            ("descripcionDefecto", "descripcion_defecto"),
            ("categoriaDefecto", "categoria_defecto"),
            ("nivel", "nivel"),
            ("tipoFalla", "tipo_falla"),
            ("area", "area"),
            ("maquina", "maquina"),
            ("operador", "operador"),
            ("supervisor", "supervisor"),
            ("revisadoPor", "revisado_por"),
            ("impacto", "impacto"),
            ("observacion", "observacion"),
            ("causaRaiz", "causa_raiz"),
            ("accionesCorrectivas", "acciones_correctivas"),
            ("verificacionSeguimiento", "verificacion_seguimiento"),
            ("creadoPor", "creado_por"),
            ("fechaCreacion", "fecha_creacion"),
            ("actualizadoPor", "actualizado_por"),
            ("fechaActualizacion", "fecha_actualizacion"),
        };

        // Columnas editables desde "Nueva NC" / "Editar" (todo salvo id/codigo/estado/gestión/cierre/auditoría).
        private static readonly (string Json, string Column, string Tipo)[] CamposEditables = new[]
        {
            ("tipo", "tipo", "texto"),
            ("origen", "origen", "texto"),
            ("titulo", "titulo", "texto"),
            ("descripcion", "descripcion", "texto"),
            ("severidad", "severidad", "texto"),
            ("proceso", "proceso", "texto"),
            ("norma", "norma", "texto"),
            ("reportadoPor", "reportado_por", "texto"),
            ("fechaDeteccion", "fecha_deteccion", "fecha"),
            ("tipoPnc", "tipo_pnc", "texto"),
            ("fechaIngreso", "fecha_ingreso", "fecha"),
            ("fechaSalida", "fecha_salida", "fecha"),
            ("npNv", "np_nv", "texto"),
            ("cliente", "cliente", "texto"),
            ("codigoProducto", "codigo_producto", "texto"),
            ("producto", "producto", "texto"),
            ("cantRequerida", "cant_requerida", "decimal"),
            ("cantRechazada", "cant_rechazada", "decimal"),
            ("cantRecuperada", "cant_recuperada", "decimal"),
            ("pncReal", "pnc_real", "decimal"),
            ("fechaFabricacion", "fecha_fabricacion", "fecha"),
            ("descripcionDefecto", "descripcion_defecto", "texto"),
            ("categoriaDefecto", "categoria_defecto", "texto"),
            ("nivel", "nivel", "texto"),
            ("tipoFalla", "tipo_falla", "texto"),
            ("area", "area", "texto"),
            ("maquina", "maquina", "texto"),
            ("operador", "operador", "texto"),
            ("supervisor", "supervisor", "texto"),
            ("revisadoPor", "revisado_por", "texto"),
            ("impacto", "impacto", "texto"),
            ("observacion", "observacion", "texto"),
            ("causaRaiz", "causa_raiz", "texto"),
            ("accionesCorrectivas", "acciones_correctivas", "texto"),
            ("verificacionSeguimiento", "verificacion_seguimiento", "texto"),
        };

        public NoConformidadesRepository(DbService db)
        {
            _db = db;
        }

        private static readonly string SelectSql =
            "SELECT " + string.Join(", ", Columns.Select(c => c.Column)) + " FROM no_conformidades";

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

        private static Dictionary<string, object?> MapRow(MySqlDataReader r)
        {
            var row = new Dictionary<string, object?>();
            foreach (var (json, column) in Columns)
                row[json] = GetVal(r, column);
            return row;
        }

        private static void AplicarFiltros(
            List<string> where,
            List<MySqlParameter> parameters,
            string? cliente,
            string? tipoPnc,
            string? nivel,
            string? estadoGestion,
            string? responsable,
            string? fechaDesde,
            string? fechaHasta
        )
        {
            if (!string.IsNullOrWhiteSpace(cliente))
            {
                where.Add("cliente LIKE @cliente");
                parameters.Add(new MySqlParameter("@cliente", $"%{cliente}%"));
            }
            if (!string.IsNullOrWhiteSpace(tipoPnc))
            {
                where.Add("tipo_pnc LIKE @tipoPnc");
                parameters.Add(new MySqlParameter("@tipoPnc", $"%{tipoPnc}%"));
            }
            if (!string.IsNullOrWhiteSpace(nivel))
            {
                where.Add("nivel = @nivel");
                parameters.Add(new MySqlParameter("@nivel", nivel));
            }
            if (!string.IsNullOrWhiteSpace(estadoGestion))
            {
                where.Add("estado_gestion = @estadoGestion");
                parameters.Add(new MySqlParameter("@estadoGestion", estadoGestion));
            }
            if (!string.IsNullOrWhiteSpace(responsable))
            {
                where.Add("responsable LIKE @responsable");
                parameters.Add(new MySqlParameter("@responsable", $"%{responsable}%"));
            }
            if (!string.IsNullOrWhiteSpace(fechaDesde))
            {
                where.Add("fecha_ingreso >= @fechaDesde");
                parameters.Add(new MySqlParameter("@fechaDesde", fechaDesde));
            }
            if (!string.IsNullOrWhiteSpace(fechaHasta))
            {
                where.Add("fecha_ingreso <= @fechaHasta");
                parameters.Add(new MySqlParameter("@fechaHasta", fechaHasta));
            }
        }

        public async Task<(List<Dictionary<string, object?>> Items, int Total)> Listar(
            int page,
            int pageSize,
            string? cliente,
            string? tipoPnc,
            string? nivel,
            string? estadoGestion,
            string? responsable,
            string? fechaDesde,
            string? fechaHasta
        )
        {
            var where = new List<string>();
            var parameters = new List<MySqlParameter>();
            AplicarFiltros(
                where,
                parameters,
                cliente,
                tipoPnc,
                nivel,
                estadoGestion,
                responsable,
                fechaDesde,
                fechaHasta
            );
            var whereSql = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var total = 0;
            await using (
                var countCmd = new MySqlCommand($"SELECT COUNT(*) FROM no_conformidades {whereSql}", conn)
            )
            {
                countCmd.Parameters.AddRange(parameters.ToArray());
                total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
            }

            var items = new List<Dictionary<string, object?>>();
            var offset = (page - 1) * pageSize;

            await using (
                var cmd = new MySqlCommand(
                    $"{SelectSql} {whereSql} ORDER BY fecha_ingreso DESC, id DESC LIMIT @limit OFFSET @offset",
                    conn
                )
            )
            {
                foreach (var p in parameters)
                    cmd.Parameters.Add(new MySqlParameter(p.ParameterName, p.Value));
                cmd.Parameters.AddWithValue("@limit", pageSize);
                cmd.Parameters.AddWithValue("@offset", offset);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    items.Add(MapRow(reader));
            }

            return (items, total);
        }

        public async Task<Dictionary<string, object?>> ObtenerResumen(
            string? cliente,
            string? tipoPnc,
            string? nivel,
            string? estadoGestion,
            string? responsable,
            string? fechaDesde,
            string? fechaHasta
        )
        {
            var where = new List<string>();
            var parameters = new List<MySqlParameter>();
            AplicarFiltros(
                where,
                parameters,
                cliente,
                tipoPnc,
                nivel,
                estadoGestion,
                responsable,
                fechaDesde,
                fechaHasta
            );
            var whereSql = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                $@"
                SELECT
                    COUNT(*) AS total,
                    SUM(estado_gestion <> 'CERRADA') AS abiertas,
                    SUM(estado_gestion = 'CERRADA') AS cerradas,
                    SUM(severidad = 'ALTA') AS criticas
                FROM no_conformidades
                {whereSql};
                ",
                conn
            );
            cmd.Parameters.AddRange(parameters.ToArray());

            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();

            return new Dictionary<string, object?>
            {
                ["total"] = reader.IsDBNull(reader.GetOrdinal("total")) ? 0 : reader.GetInt32("total"),
                ["abiertas"] = reader.IsDBNull(reader.GetOrdinal("abiertas"))
                    ? 0
                    : Convert.ToInt32(reader.GetValue(reader.GetOrdinal("abiertas"))),
                ["cerradas"] = reader.IsDBNull(reader.GetOrdinal("cerradas"))
                    ? 0
                    : Convert.ToInt32(reader.GetValue(reader.GetOrdinal("cerradas"))),
                ["criticas"] = reader.IsDBNull(reader.GetOrdinal("criticas"))
                    ? 0
                    : Convert.ToInt32(reader.GetValue(reader.GetOrdinal("criticas"))),
            };
        }

        public async Task<Dictionary<string, object?>> ObtenerFiltrosOpciones()
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            async Task<List<string>> Distinct(string column)
            {
                var values = new List<string>();
                await using var cmd = new MySqlCommand(
                    $"SELECT DISTINCT {column} FROM no_conformidades WHERE {column} IS NOT NULL AND {column} <> '' ORDER BY {column}",
                    conn
                );
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    values.Add(reader.GetString(0));
                return values;
            }

            // "maquina" y "operador" no se incluyen acá: el frontend los puebla desde catálogos ya
            // existentes en INNPACK (módulo Máquinas y Procesos / Inspecciones), no desde esta tabla.
            return new Dictionary<string, object?>
            {
                ["clientes"] = await Distinct("cliente"),
                ["tiposPnc"] = await Distinct("tipo_pnc"),
                ["responsables"] = await Distinct("responsable"),
                ["categoriasDefecto"] = await Distinct("categoria_defecto"),
                ["areas"] = await Distinct("area"),
                ["supervisores"] = await Distinct("supervisor"),
                ["revisadoPor"] = await Distinct("revisado_por"),
            };
        }

        public async Task<Dictionary<string, object?>?> ObtenerPorId(int id)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand($"{SelectSql} WHERE id = @id", conn);
            cmd.Parameters.AddWithValue("@id", id);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return MapRow(reader);
        }

        public async Task<(int Id, string Codigo)> Crear(
            Dictionary<string, object?> campos,
            string? creadoPor
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var cols = new List<string> { "codigo", "estado", "estado_gestion", "creado_por" };
            var paramNames = new List<string> { "@codigoTmp", "'ABIERTA'", "'PENDIENTE'", "@creadoPor" };
            var parameters = new List<MySqlParameter>
            {
                new("@codigoTmp", $"TMP-{Guid.NewGuid():N}"[..20]),
                new("@creadoPor", (object?)creadoPor ?? DBNull.Value),
            };

            decimal? cantRechazada = null;
            decimal? cantRecuperada = null;

            foreach (var (json, column, tipo) in CamposEditables)
            {
                if (!campos.TryGetValue(json, out var value))
                    continue;

                cols.Add(column);
                var paramName = $"@{json}";
                paramNames.Add(paramName);
                parameters.Add(new MySqlParameter(paramName, value ?? DBNull.Value));

                if (json == "cantRechazada" && value is decimal dR)
                    cantRechazada = dR;
                if (json == "cantRecuperada" && value is decimal dRec)
                    cantRecuperada = dRec;
            }

            var pct =
                cantRechazada.HasValue && cantRechazada.Value > 0 && cantRecuperada.HasValue
                    ? Math.Round(cantRecuperada.Value / cantRechazada.Value * 100, 2)
                    : (decimal?)null;
            cols.Add("pct_recuperacion");
            paramNames.Add("@pct");
            parameters.Add(new MySqlParameter("@pct", (object?)pct ?? DBNull.Value));

            var insertSql =
                $"INSERT INTO no_conformidades ({string.Join(", ", cols)}) VALUES ({string.Join(", ", paramNames)}); SELECT LAST_INSERT_ID();";

            await using var cmd = new MySqlCommand(insertSql, conn);
            cmd.Parameters.AddRange(parameters.ToArray());
            var id = Convert.ToInt32(await cmd.ExecuteScalarAsync());

            var codigo = $"NC-{DateTime.Now:yyyy}-{id:D5}";
            await using var updCmd = new MySqlCommand(
                "UPDATE no_conformidades SET codigo = @codigo WHERE id = @id",
                conn
            );
            updCmd.Parameters.AddWithValue("@codigo", codigo);
            updCmd.Parameters.AddWithValue("@id", id);
            await updCmd.ExecuteNonQueryAsync();

            return (id, codigo);
        }

        // Actualización parcial: solo se tocan las claves presentes en `campos` (lee-fusiona-guarda
        // para recalcular pct_recuperacion, igual que el patrón ya usado en Faret/importacion_pnc).
        public async Task Actualizar(int id, Dictionary<string, object?> campos, string? actualizadoPor)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            decimal? cantRechazadaActual = null;
            decimal? cantRecuperadaActual = null;

            if (!campos.ContainsKey("cantRechazada") || !campos.ContainsKey("cantRecuperada"))
            {
                await using var readCmd = new MySqlCommand(
                    "SELECT cant_rechazada, cant_recuperada FROM no_conformidades WHERE id = @id",
                    conn
                );
                readCmd.Parameters.AddWithValue("@id", id);
                await using var reader = await readCmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    cantRechazadaActual = reader.IsDBNull(0) ? null : reader.GetDecimal(0);
                    cantRecuperadaActual = reader.IsDBNull(1) ? null : reader.GetDecimal(1);
                }
            }

            var sets = new List<string>();
            var parameters = new List<MySqlParameter> { new("@id", id) };

            foreach (var (json, column, _) in CamposEditables)
            {
                if (!campos.TryGetValue(json, out var value))
                    continue;

                var paramName = $"@{json}";
                sets.Add($"{column} = {paramName}");
                parameters.Add(new MySqlParameter(paramName, value ?? DBNull.Value));
            }

            var cantRechazada = campos.TryGetValue("cantRechazada", out var vr) && vr is decimal dR
                ? dR
                : cantRechazadaActual;
            var cantRecuperada = campos.TryGetValue("cantRecuperada", out var vc) && vc is decimal dC
                ? dC
                : cantRecuperadaActual;

            var pct =
                cantRechazada.HasValue && cantRechazada.Value > 0 && cantRecuperada.HasValue
                    ? Math.Round(cantRecuperada.Value / cantRechazada.Value * 100, 2)
                    : (decimal?)null;
            sets.Add("pct_recuperacion = @pct");
            parameters.Add(new MySqlParameter("@pct", (object?)pct ?? DBNull.Value));

            if (!string.IsNullOrWhiteSpace(actualizadoPor))
            {
                sets.Add("actualizado_por = @actualizadoPor");
                parameters.Add(new MySqlParameter("@actualizadoPor", actualizadoPor));
            }

            if (sets.Count == 0)
                return;

            await using var cmd = new MySqlCommand(
                $"UPDATE no_conformidades SET {string.Join(", ", sets)} WHERE id = @id",
                conn
            );
            cmd.Parameters.AddRange(parameters.ToArray());
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task ActualizarGestion(
            int id,
            string? responsable,
            string? estadoGestion,
            string? fechaCompromiso,
            string? actualizadoPor
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"
                UPDATE no_conformidades
                SET responsable = @responsable,
                    estado_gestion = @estadoGestion,
                    fecha_compromiso = @fechaCompromiso,
                    actualizado_por = @actualizadoPor
                WHERE id = @id;
                ",
                conn
            );
            cmd.Parameters.AddWithValue("@responsable", (object?)responsable ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@estadoGestion", (object?)estadoGestion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@fechaCompromiso", (object?)fechaCompromiso ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@actualizadoPor", (object?)actualizadoPor ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task Cerrar(int id, string cerradoPor, string? comentarioCierre)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"
                UPDATE no_conformidades
                SET estado_gestion = 'CERRADA',
                    cerrado_por = @cerradoPor,
                    comentario_cierre = @comentarioCierre,
                    fecha_cierre = NOW()
                WHERE id = @id;
                ",
                conn
            );
            cmd.Parameters.AddWithValue("@cerradoPor", cerradoPor);
            cmd.Parameters.AddWithValue("@comentarioCierre", (object?)comentarioCierre ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task<List<Dictionary<string, object?>>> ListarSeguimiento(int ncId)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                "SELECT id, no_conformidad_id, comentario, autor, creado_en FROM nc_seguimiento WHERE no_conformidad_id = @id ORDER BY creado_en DESC, id DESC",
                conn
            );
            cmd.Parameters.AddWithValue("@id", ncId);

            var items = new List<Dictionary<string, object?>>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                items.Add(
                    new Dictionary<string, object?>
                    {
                        ["id"] = reader.GetInt32("id"),
                        ["noConformidadId"] = reader.GetInt32("no_conformidad_id"),
                        ["comentario"] = GetVal(reader, "comentario"),
                        ["autor"] = GetVal(reader, "autor"),
                        ["creadoEn"] = GetVal(reader, "creado_en"),
                    }
                );
            }
            return items;
        }

        public async Task CrearSeguimiento(int ncId, string comentario, string? autor)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                "INSERT INTO nc_seguimiento (no_conformidad_id, comentario, autor) VALUES (@ncId, @comentario, @autor)",
                conn
            );
            cmd.Parameters.AddWithValue("@ncId", ncId);
            cmd.Parameters.AddWithValue("@comentario", comentario);
            cmd.Parameters.AddWithValue("@autor", (object?)autor ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task<Dictionary<string, object?>?> ObtenerAnalisis(int ncId)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"SELECT id, no_conformidad_id, metodologia, problema_detectado, porque1, porque2, porque3,
                         porque4, porque5, causa_raiz, conclusion, creado_por, creado_en, actualizado_por, actualizado_en
                  FROM nc_analisis WHERE no_conformidad_id = @id ORDER BY id DESC LIMIT 1",
                conn
            );
            cmd.Parameters.AddWithValue("@id", ncId);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return new Dictionary<string, object?>
            {
                ["id"] = reader.GetInt32("id"),
                ["noConformidadId"] = reader.GetInt32("no_conformidad_id"),
                ["metodologia"] = GetVal(reader, "metodologia"),
                ["problemaDetectado"] = GetVal(reader, "problema_detectado"),
                ["porque1"] = GetVal(reader, "porque1"),
                ["porque2"] = GetVal(reader, "porque2"),
                ["porque3"] = GetVal(reader, "porque3"),
                ["porque4"] = GetVal(reader, "porque4"),
                ["porque5"] = GetVal(reader, "porque5"),
                ["causaRaiz"] = GetVal(reader, "causa_raiz"),
                ["conclusion"] = GetVal(reader, "conclusion"),
                ["creadoPor"] = GetVal(reader, "creado_por"),
                ["creadoEn"] = GetVal(reader, "creado_en"),
                ["actualizadoPor"] = GetVal(reader, "actualizado_por"),
                ["actualizadoEn"] = GetVal(reader, "actualizado_en"),
            };
        }

        public async Task<int> GuardarAnalisis(
            int ncId,
            string metodologia,
            string problemaDetectado,
            string? porque1,
            string? porque2,
            string? porque3,
            string? porque4,
            string? porque5,
            string? causaRaiz,
            string? conclusion,
            string? usuario
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            int? existingId = null;
            await using (
                var readCmd = new MySqlCommand(
                    "SELECT id FROM nc_analisis WHERE no_conformidad_id = @id ORDER BY id DESC LIMIT 1",
                    conn
                )
            )
            {
                readCmd.Parameters.AddWithValue("@id", ncId);
                var result = await readCmd.ExecuteScalarAsync();
                if (result != null)
                    existingId = Convert.ToInt32(result);
            }

            if (existingId.HasValue)
            {
                await using var updCmd = new MySqlCommand(
                    @"UPDATE nc_analisis SET
                        metodologia = @metodologia, problema_detectado = @problema,
                        porque1 = @p1, porque2 = @p2, porque3 = @p3, porque4 = @p4, porque5 = @p5,
                        causa_raiz = @causaRaiz, conclusion = @conclusion, actualizado_por = @usuario
                      WHERE id = @analisisId",
                    conn
                );
                updCmd.Parameters.AddWithValue("@metodologia", metodologia);
                updCmd.Parameters.AddWithValue("@problema", problemaDetectado);
                updCmd.Parameters.AddWithValue("@p1", (object?)porque1 ?? DBNull.Value);
                updCmd.Parameters.AddWithValue("@p2", (object?)porque2 ?? DBNull.Value);
                updCmd.Parameters.AddWithValue("@p3", (object?)porque3 ?? DBNull.Value);
                updCmd.Parameters.AddWithValue("@p4", (object?)porque4 ?? DBNull.Value);
                updCmd.Parameters.AddWithValue("@p5", (object?)porque5 ?? DBNull.Value);
                updCmd.Parameters.AddWithValue("@causaRaiz", (object?)causaRaiz ?? DBNull.Value);
                updCmd.Parameters.AddWithValue("@conclusion", (object?)conclusion ?? DBNull.Value);
                updCmd.Parameters.AddWithValue("@usuario", (object?)usuario ?? DBNull.Value);
                updCmd.Parameters.AddWithValue("@analisisId", existingId.Value);
                await updCmd.ExecuteNonQueryAsync();
                return existingId.Value;
            }

            await using var insCmd = new MySqlCommand(
                @"INSERT INTO nc_analisis
                    (no_conformidad_id, metodologia, problema_detectado, porque1, porque2, porque3, porque4, porque5,
                     causa_raiz, conclusion, creado_por)
                  VALUES (@ncId, @metodologia, @problema, @p1, @p2, @p3, @p4, @p5, @causaRaiz, @conclusion, @usuario);
                  SELECT LAST_INSERT_ID();",
                conn
            );
            insCmd.Parameters.AddWithValue("@ncId", ncId);
            insCmd.Parameters.AddWithValue("@metodologia", metodologia);
            insCmd.Parameters.AddWithValue("@problema", problemaDetectado);
            insCmd.Parameters.AddWithValue("@p1", (object?)porque1 ?? DBNull.Value);
            insCmd.Parameters.AddWithValue("@p2", (object?)porque2 ?? DBNull.Value);
            insCmd.Parameters.AddWithValue("@p3", (object?)porque3 ?? DBNull.Value);
            insCmd.Parameters.AddWithValue("@p4", (object?)porque4 ?? DBNull.Value);
            insCmd.Parameters.AddWithValue("@p5", (object?)porque5 ?? DBNull.Value);
            insCmd.Parameters.AddWithValue("@causaRaiz", (object?)causaRaiz ?? DBNull.Value);
            insCmd.Parameters.AddWithValue("@conclusion", (object?)conclusion ?? DBNull.Value);
            insCmd.Parameters.AddWithValue("@usuario", (object?)usuario ?? DBNull.Value);
            return Convert.ToInt32(await insCmd.ExecuteScalarAsync());
        }

        public async Task<List<Dictionary<string, object?>>> ListarAcciones(int ncId)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"SELECT id, no_conformidad_id, analisis_id, descripcion, responsable, fecha_limite,
                         prioridad, estado, creado_por, creado_en, actualizado_por, actualizado_en
                  FROM nc_acciones_correctivas WHERE no_conformidad_id = @id ORDER BY id DESC",
                conn
            );
            cmd.Parameters.AddWithValue("@id", ncId);

            var items = new List<Dictionary<string, object?>>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                items.Add(
                    new Dictionary<string, object?>
                    {
                        ["id"] = reader.GetInt32("id"),
                        ["noConformidadId"] = reader.GetInt32("no_conformidad_id"),
                        ["analisisId"] = reader.IsDBNull(reader.GetOrdinal("analisis_id"))
                            ? null
                            : reader.GetInt32("analisis_id"),
                        ["descripcion"] = GetVal(reader, "descripcion"),
                        ["responsable"] = GetVal(reader, "responsable"),
                        ["fechaLimite"] = GetVal(reader, "fecha_limite"),
                        ["prioridad"] = GetVal(reader, "prioridad"),
                        ["estado"] = GetVal(reader, "estado"),
                        ["creadoPor"] = GetVal(reader, "creado_por"),
                        ["creadoEn"] = GetVal(reader, "creado_en"),
                        ["actualizadoPor"] = GetVal(reader, "actualizado_por"),
                        ["actualizadoEn"] = GetVal(reader, "actualizado_en"),
                    }
                );
            }
            return items;
        }

        public async Task CrearAccion(
            int ncId,
            int? analisisId,
            string descripcion,
            string responsable,
            string fechaLimite,
            string? prioridad,
            string? creadoPor
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"INSERT INTO nc_acciones_correctivas
                    (no_conformidad_id, analisis_id, descripcion, responsable, fecha_limite, prioridad, creado_por)
                  VALUES (@ncId, @analisisId, @descripcion, @responsable, @fechaLimite, @prioridad, @creadoPor)",
                conn
            );
            cmd.Parameters.AddWithValue("@ncId", ncId);
            cmd.Parameters.AddWithValue("@analisisId", (object?)analisisId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@descripcion", descripcion);
            cmd.Parameters.AddWithValue("@responsable", responsable);
            cmd.Parameters.AddWithValue("@fechaLimite", fechaLimite);
            cmd.Parameters.AddWithValue("@prioridad", (object?)prioridad ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@creadoPor", (object?)creadoPor ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task ActualizarAccion(
            int accionId,
            string descripcion,
            string responsable,
            string fechaLimite,
            string? prioridad,
            string estado,
            string? actualizadoPor
        )
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(
                @"UPDATE nc_acciones_correctivas
                  SET descripcion = @descripcion, responsable = @responsable, fecha_limite = @fechaLimite,
                      prioridad = @prioridad, estado = @estado, actualizado_por = @actualizadoPor
                  WHERE id = @accionId",
                conn
            );
            cmd.Parameters.AddWithValue("@descripcion", descripcion);
            cmd.Parameters.AddWithValue("@responsable", responsable);
            cmd.Parameters.AddWithValue("@fechaLimite", fechaLimite);
            cmd.Parameters.AddWithValue("@prioridad", (object?)prioridad ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@estado", estado);
            cmd.Parameters.AddWithValue("@actualizadoPor", (object?)actualizadoPor ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@accionId", accionId);
            await cmd.ExecuteNonQueryAsync();
        }

        public static (string Json, string Column, string Tipo)[] GetCamposEditables() => CamposEditables;
    }
}
