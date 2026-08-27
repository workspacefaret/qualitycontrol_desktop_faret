using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Modules.MuestraLaboratorio;
using QualityControlCenter.Repositories.NoConformidades;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.MuestraLaboratorio
{
    public class MuestraLaboratorioRepository
    {
        private readonly DbService _db;

        public MuestraLaboratorioRepository(DbService db)
        {
            _db = db;
        }

        public async Task<int> CrearMuestra(CrearMuestraRequest r, int? usuarioId, string? usuarioNombre)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            const string sql =
                @"INSERT INTO muestra_laboratorio
                    (fecha_ensayo, analista_usuario_id, analista_nombre, origen, tipo_muestra, np,
                     cliente, codigo_producto, descripcion, maquina, turno, lote, proveedor,
                     observacion, creado_por)
                  VALUES
                    (@fechaEnsayo, @analistaId, @analistaNombre, @origen, @tipoMuestra, @np,
                     @cliente, @codigoProducto, @descripcion, @maquina, @turno, @lote, @proveedor,
                     @observacion, @creadoPor);
                  SELECT LAST_INSERT_ID();";

            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@fechaEnsayo", (object?)ParseFecha(r.FechaEnsayo) ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@analistaId", (object?)usuarioId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@analistaNombre", (object?)usuarioNombre ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@origen", r.Origen);
            cmd.Parameters.AddWithValue("@tipoMuestra", r.TipoMuestra);
            cmd.Parameters.AddWithValue("@np", (object?)r.Np ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@cliente", (object?)r.Cliente ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@codigoProducto", (object?)r.CodigoProducto ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@descripcion", (object?)r.Descripcion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@maquina", (object?)r.Maquina ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@turno", (object?)r.Turno ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@lote", (object?)r.Lote ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@proveedor", (object?)r.Proveedor ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@observacion", (object?)r.Observacion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@creadoPor", (object?)usuarioNombre ?? DBNull.Value);

            var id = await cmd.ExecuteScalarAsync();
            return Convert.ToInt32(id);
        }

        public async Task<List<MuestraListItemDto>> Listar(string? estado, string? tipoMuestra, string? np)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var where = new List<string> { "m.eliminado = 0" };
            var cmd = new MySqlCommand();

            if (!string.IsNullOrWhiteSpace(estado))
            {
                where.Add("m.estado = @estado");
                cmd.Parameters.AddWithValue("@estado", estado);
            }
            if (!string.IsNullOrWhiteSpace(tipoMuestra))
            {
                where.Add("m.tipo_muestra = @tipoMuestra");
                cmd.Parameters.AddWithValue("@tipoMuestra", tipoMuestra);
            }
            if (!string.IsNullOrWhiteSpace(np))
            {
                where.Add("m.np = @np");
                cmd.Parameters.AddWithValue("@np", np);
            }

            cmd.CommandText =
                $@"SELECT
                    m.id, m.fecha_ingreso, m.origen, m.tipo_muestra, m.np, m.cliente,
                    m.codigo_producto, m.descripcion, m.estado, m.evaluacion,
                    (SELECT COUNT(*) FROM muestra_laboratorio_ensayos e WHERE e.muestra_id = m.id AND e.estado <> 'Anulado') AS total_ensayos
                FROM muestra_laboratorio m
                WHERE {string.Join(" AND ", where)}
                ORDER BY m.fecha_ingreso DESC
                LIMIT 300";
            cmd.Connection = conn;

            var lista = new List<MuestraListItemDto>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                lista.Add(
                    new MuestraListItemDto
                    {
                        Id = reader.GetInt32("id"),
                        FechaIngreso = FormatFecha(reader["fecha_ingreso"]),
                        Origen = reader["origen"]?.ToString() ?? "",
                        TipoMuestra = reader["tipo_muestra"]?.ToString() ?? "",
                        Np = reader["np"]?.ToString() ?? "",
                        Cliente = reader["cliente"]?.ToString() ?? "",
                        CodigoProducto = reader["codigo_producto"]?.ToString() ?? "",
                        Descripcion = reader["descripcion"]?.ToString() ?? "",
                        Estado = reader["estado"]?.ToString() ?? "",
                        Evaluacion = reader["evaluacion"]?.ToString() ?? "",
                        TotalEnsayos = Convert.ToInt32(reader["total_ensayos"]),
                    }
                );
            }
            return lista;
        }

        public async Task<MuestraDetalleDto?> ObtenerDetalle(int id)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            MuestraDetalleDto? muestra = null;

            using (
                var cmd = new MySqlCommand(
                    @"SELECT m.id, m.fecha_ingreso, m.fecha_ensayo, m.analista_nombre, m.origen, m.tipo_muestra,
                             m.np, m.cliente, m.codigo_producto, m.descripcion, m.maquina, m.turno, m.lote,
                             m.proveedor, m.observacion, m.estado, m.evaluacion, m.nc_id, nc.codigo AS nc_codigo
                      FROM muestra_laboratorio m
                      LEFT JOIN no_conformidades nc ON nc.id = m.nc_id
                      WHERE m.id = @id AND m.eliminado = 0",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    muestra = new MuestraDetalleDto
                    {
                        Id = reader.GetInt32("id"),
                        FechaIngreso = FormatFecha(reader["fecha_ingreso"]),
                        FechaEnsayo = reader["fecha_ensayo"] == DBNull.Value ? null : FormatFecha(reader["fecha_ensayo"]),
                        AnalistaNombre = reader["analista_nombre"]?.ToString() ?? "",
                        Origen = reader["origen"]?.ToString() ?? "",
                        TipoMuestra = reader["tipo_muestra"]?.ToString() ?? "",
                        Np = reader["np"]?.ToString() ?? "",
                        Cliente = reader["cliente"]?.ToString() ?? "",
                        CodigoProducto = reader["codigo_producto"]?.ToString() ?? "",
                        Descripcion = reader["descripcion"]?.ToString() ?? "",
                        Maquina = reader["maquina"]?.ToString() ?? "",
                        Turno = reader["turno"]?.ToString() ?? "",
                        Lote = reader["lote"]?.ToString() ?? "",
                        Proveedor = reader["proveedor"]?.ToString() ?? "",
                        Observacion = reader["observacion"]?.ToString() ?? "",
                        Estado = reader["estado"]?.ToString() ?? "",
                        Evaluacion = reader["evaluacion"]?.ToString() ?? "",
                        NcId = reader["nc_id"] == DBNull.Value ? null : Convert.ToInt32(reader["nc_id"]),
                        NcCodigo = reader["nc_codigo"]?.ToString(),
                    };
                }
            }

            if (muestra == null)
                return null;

            var ensayos = new List<EnsayoDto>();
            using (
                var cmd = new MySqlCommand(
                    @"SELECT id, tipo_ensayo, metodo, analista_nombre, fecha, estado,
                             resultado_valor, resultado_unidad, especificacion_min, especificacion_max,
                             especificacion_unidad, cumplimiento, observacion, motivo_anulacion,
                             ensayo_reemplaza_id, motivo_reemplazo
                      FROM muestra_laboratorio_ensayos WHERE muestra_id = @id ORDER BY fecha ASC",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    ensayos.Add(
                        new EnsayoDto
                        {
                            Id = reader.GetInt32("id"),
                            MuestraId = id,
                            TipoEnsayo = reader["tipo_ensayo"]?.ToString() ?? "",
                            Metodo = reader["metodo"]?.ToString() ?? "",
                            AnalistaNombre = reader["analista_nombre"]?.ToString() ?? "",
                            Fecha = FormatFecha(reader["fecha"]),
                            Estado = reader["estado"]?.ToString() ?? "",
                            ResultadoValor = reader["resultado_valor"] == DBNull.Value
                                ? null
                                : Convert.ToDecimal(reader["resultado_valor"]),
                            ResultadoUnidad = reader["resultado_unidad"]?.ToString(),
                            EspecificacionMin = reader["especificacion_min"] == DBNull.Value
                                ? null
                                : Convert.ToDecimal(reader["especificacion_min"]),
                            EspecificacionMax = reader["especificacion_max"] == DBNull.Value
                                ? null
                                : Convert.ToDecimal(reader["especificacion_max"]),
                            EspecificacionUnidad = reader["especificacion_unidad"]?.ToString(),
                            Cumplimiento = reader["cumplimiento"]?.ToString() ?? "",
                            Observacion = reader["observacion"]?.ToString() ?? "",
                            MotivoAnulacion = reader["motivo_anulacion"]?.ToString(),
                            EnsayoReemplazaId = reader["ensayo_reemplaza_id"] == DBNull.Value
                                ? null
                                : Convert.ToInt32(reader["ensayo_reemplaza_id"]),
                            MotivoReemplazo = reader["motivo_reemplazo"]?.ToString(),
                        }
                    );
                }
            }

            foreach (var ensayo in ensayos)
            {
                ensayo.Detalle = ensayo.TipoEnsayo switch
                {
                    "HUMEDAD" => await ObtenerDetalleHumedad(conn, ensayo.Id),
                    "GRAMAJE" => await ObtenerDetalleGramaje(conn, ensayo.Id),
                    "COBB" => await ObtenerDetalleCobb(conn, ensayo.Id),
                    "ESPESOR" => await ObtenerDetalleEspesor(conn, ensayo.Id),
                    "RCT" or "FCT" => await ObtenerDetalleResistencia(conn, ensayo.Id),
                    "ECT" => await ObtenerDetalleEct(conn, ensayo.Id),
                    "BCT_MEDIDO" => await ObtenerDetalleBctMedido(conn, ensayo.Id),
                    "BCT_TEORICO" => await ObtenerDetalleBctTeorico(conn, ensayo.Id),
                    "VISCOSIDAD" => await ObtenerDetalleViscosidad(conn, ensayo.Id),
                    "PH" => await ObtenerDetallePh(conn, ensayo.Id),
                    "SOLIDOS" => await ObtenerDetalleSolidos(conn, ensayo.Id),
                    "LUGOL" => await ObtenerDetalleLugol(conn, ensayo.Id),
                    _ => null,
                };
            }

            muestra.Ensayos = ensayos;
            return muestra;
        }

        // =====================================================================
        // HUMEDAD
        // =====================================================================
        public async Task<int> GuardarHumedad(HumedadGuardarRequest r)
        {
            decimal? higrometroPromedio = null;
            if (r.MetodoEquipo == "Higrometro")
            {
                var puntos = new[] { r.HigrometroIzquierdo, r.HigrometroCentro, r.HigrometroDerecho }
                    .Where(v => v.HasValue)
                    .Select(v => v!.Value)
                    .ToList();
                if (puntos.Count > 0)
                    higrometroPromedio = Math.Round(puntos.Average(), 2);
            }

            var hornoResultados = new List<decimal>();
            void AgregarHorno(decimal? inicial, decimal? final)
            {
                if (inicial.HasValue && final.HasValue && inicial.Value > 0)
                    hornoResultados.Add(Math.Round(((inicial.Value - final.Value) / inicial.Value) * 100, 2));
            }
            AgregarHorno(r.Horno1PesoInicial, r.Horno1PesoFinal);
            AgregarHorno(r.Horno2PesoInicial, r.Horno2PesoFinal);
            AgregarHorno(r.Horno3PesoInicial, r.Horno3PesoFinal);
            decimal? hornoPromedio = hornoResultados.Count > 0 ? Math.Round(hornoResultados.Average(), 2) : null;

            decimal? resultadoOtroMetodo = r.MetodoEquipo == "Termobalanza" ? r.TermobalanzaValor
                : r.MetodoEquipo == "Horno" ? hornoPromedio
                : null;

            decimal? diferencia = null;
            if (higrometroPromedio.HasValue && resultadoOtroMetodo.HasValue)
                diferencia = Math.Round(Math.Abs(higrometroPromedio.Value - resultadoOtroMetodo.Value), 2);

            decimal? resultadoFinal = higrometroPromedio ?? r.TermobalanzaValor ?? hornoPromedio;

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "HUMEDAD", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_humedad
                        (ensayo_id, metodo_equipo, higrometro_izquierdo, higrometro_centro,
                         higrometro_derecho, higrometro_promedio, termobalanza_valor,
                         horno_1_peso_inicial, horno_1_peso_final, horno_2_peso_inicial,
                         horno_2_peso_final, horno_3_peso_inicial, horno_3_peso_final,
                         horno_promedio, diferencia_metodos)
                      VALUES
                        (@ensayoId, @metodoEquipo, @higIzq, @higCentro, @higDer, @higProm, @termo,
                         @h1i, @h1f, @h2i, @h2f, @h3i, @h3f, @hornoProm, @diferencia)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@metodoEquipo", r.MetodoEquipo);
                cmd.Parameters.AddWithValue("@higIzq", (object?)r.HigrometroIzquierdo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@higCentro", (object?)r.HigrometroCentro ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@higDer", (object?)r.HigrometroDerecho ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@higProm", (object?)higrometroPromedio ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@termo", (object?)r.TermobalanzaValor ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@h1i", (object?)r.Horno1PesoInicial ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@h1f", (object?)r.Horno1PesoFinal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@h2i", (object?)r.Horno2PesoInicial ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@h2f", (object?)r.Horno2PesoFinal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@h3i", (object?)r.Horno3PesoInicial ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@h3f", (object?)r.Horno3PesoFinal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@hornoProm", (object?)hornoPromedio ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@diferencia", (object?)diferencia ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "HUMEDAD", resultadoFinal, "%");
            return ensayoId;
        }

        // =====================================================================
        // GRAMAJE
        // =====================================================================
        public async Task<int> GuardarGramaje(GramajeGuardarRequest r)
        {
            var valores = new List<decimal>();
            void AgregarValor(decimal? v)
            {
                if (!v.HasValue) return;
                valores.Add(r.Modalidad == "ProbetaPeso" ? v.Value * 100 : v.Value);
            }
            AgregarValor(r.Muestra1);
            AgregarValor(r.Muestra2);
            AgregarValor(r.Muestra3);

            decimal? promedio = valores.Count > 0 ? Math.Round(valores.Average(), 4) : null;

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "GRAMAJE", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_gramaje
                        (ensayo_id, tipo_material, modalidad, muestra_1, muestra_2, muestra_3, promedio)
                      VALUES (@ensayoId, @tipoMaterial, @modalidad, @m1, @m2, @m3, @promedio)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@tipoMaterial", r.TipoMaterial);
                cmd.Parameters.AddWithValue("@modalidad", r.Modalidad);
                cmd.Parameters.AddWithValue("@m1", (object?)r.Muestra1 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@m2", (object?)r.Muestra2 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@m3", (object?)r.Muestra3 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@promedio", (object?)promedio ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "GRAMAJE", promedio, "g/m2");
            return ensayoId;
        }

        // =====================================================================
        // COBB
        // =====================================================================
        public async Task<int> GuardarCobb(CobbGuardarRequest r)
        {
            decimal? Calcular(CobbProbetaRequest? p)
            {
                if (p?.PesoInicial == null || p.PesoFinal == null) return null;
                if (p.PesoFinal.Value < p.PesoInicial.Value) return null; // advertencia, no se calcula
                return Math.Round((p.PesoFinal.Value - p.PesoInicial.Value) * 100, 4);
            }

            var r1 = Calcular(r.P1);
            var r2 = Calcular(r.P2);
            var r3 = Calcular(r.P3);

            var validos = new[] { r1, r2, r3 }.Where(v => v.HasValue).Select(v => v!.Value).ToList();
            decimal? promedio = validos.Count > 0 ? Math.Round(validos.Average(), 4) : null;

            var advertencia = (r.P1?.PesoInicial != null && r.P1.PesoFinal != null && r.P1.PesoFinal < r.P1.PesoInicial)
                || (r.P2?.PesoInicial != null && r.P2.PesoFinal != null && r.P2.PesoFinal < r.P2.PesoInicial)
                || (r.P3?.PesoInicial != null && r.P3.PesoFinal != null && r.P3.PesoFinal < r.P3.PesoInicial);

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var observacionFinal = advertencia
                ? (string.IsNullOrWhiteSpace(r.Observacion) ? "" : r.Observacion + " ") + "ADVERTENCIA: al menos una probeta tiene peso final menor al inicial, no se calculo esa probeta."
                : r.Observacion;

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "COBB", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, observacionFinal);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_cobb
                        (ensayo_id,
                         p1_bobina, p1_cara, p1_peso_inicial, p1_peso_final, p1_tiempo, p1_resultado,
                         p2_bobina, p2_cara, p2_peso_inicial, p2_peso_final, p2_tiempo, p2_resultado,
                         p3_bobina, p3_cara, p3_peso_inicial, p3_peso_final, p3_tiempo, p3_resultado,
                         promedio)
                      VALUES
                        (@ensayoId,
                         @p1b, @p1c, @p1i, @p1f, @p1t, @p1r,
                         @p2b, @p2c, @p2i, @p2f, @p2t, @p2r,
                         @p3b, @p3c, @p3i, @p3f, @p3t, @p3r,
                         @promedio)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);

                cmd.Parameters.AddWithValue("@p1b", (object?)r.P1?.Bobina ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1c", (object?)r.P1?.Cara ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1i", (object?)r.P1?.PesoInicial ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1f", (object?)r.P1?.PesoFinal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1t", (object?)r.P1?.Tiempo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1r", (object?)r1 ?? DBNull.Value);

                cmd.Parameters.AddWithValue("@p2b", (object?)r.P2?.Bobina ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2c", (object?)r.P2?.Cara ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2i", (object?)r.P2?.PesoInicial ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2f", (object?)r.P2?.PesoFinal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2t", (object?)r.P2?.Tiempo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2r", (object?)r2 ?? DBNull.Value);

                cmd.Parameters.AddWithValue("@p3b", (object?)r.P3?.Bobina ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3c", (object?)r.P3?.Cara ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3i", (object?)r.P3?.PesoInicial ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3f", (object?)r.P3?.PesoFinal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3t", (object?)r.P3?.Tiempo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3r", (object?)r3 ?? DBNull.Value);

                cmd.Parameters.AddWithValue("@promedio", (object?)promedio ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "COBB", promedio, "g/m2");
            return ensayoId;
        }

        // =====================================================================
        // ESPESOR
        // =====================================================================
        public async Task<int> GuardarEspesor(EspesorGuardarRequest r)
        {
            var valores = new[] { r.Medicion1, r.Medicion2, r.Medicion3 }
                .Where(v => v.HasValue).Select(v => v!.Value).ToList();
            decimal? promedio = valores.Count > 0 ? Math.Round(valores.Average(), 4) : null;

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "ESPESOR", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_espesor
                        (ensayo_id, tipo_medicion, medicion_1, medicion_2, medicion_3, promedio)
                      VALUES (@ensayoId, @tipoMedicion, @m1, @m2, @m3, @promedio)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@tipoMedicion", r.TipoMedicion);
                cmd.Parameters.AddWithValue("@m1", (object?)r.Medicion1 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@m2", (object?)r.Medicion2 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@m3", (object?)r.Medicion3 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@promedio", (object?)promedio ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "ESPESOR", promedio, "mm");
            return ensayoId;
        }

        // =====================================================================
        // RCT / FCT (misma tabla de detalle, tipoEnsayo distingue cual es)
        // =====================================================================
        public async Task<int> GuardarResistencia(string tipoEnsayo, ResistenciaGuardarRequest r)
        {
            var forces = new[] { r.P1?.Force, r.P2?.Force, r.P3?.Force }
                .Where(v => v.HasValue).Select(v => v!.Value).ToList();
            decimal? promedioForce = forces.Count > 0 ? Math.Round(forces.Average(), 4) : null;

            var strengths = new[] { r.P1?.Strength, r.P2?.Strength, r.P3?.Strength }
                .Where(v => v.HasValue).Select(v => v!.Value).ToList();
            decimal? promedioStrength = strengths.Count > 0 ? Math.Round(strengths.Average(), 4) : null;

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, tipoEnsayo, r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_resistencia
                        (ensayo_id, componente,
                         p1_bobina, p1_force, p1_strength,
                         p2_bobina, p2_force, p2_strength,
                         p3_bobina, p3_force, p3_strength,
                         promedio_force, promedio_strength, strength_unidad)
                      VALUES
                        (@ensayoId, @componente,
                         @p1b, @p1f, @p1s,
                         @p2b, @p2f, @p2s,
                         @p3b, @p3f, @p3s,
                         @promForce, @promStrength, @strengthUnidad)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@componente", (object?)r.Componente ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1b", (object?)r.P1?.Bobina ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1f", (object?)r.P1?.Force ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1s", (object?)r.P1?.Strength ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2b", (object?)r.P2?.Bobina ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2f", (object?)r.P2?.Force ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2s", (object?)r.P2?.Strength ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3b", (object?)r.P3?.Bobina ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3f", (object?)r.P3?.Force ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3s", (object?)r.P3?.Strength ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@promForce", (object?)promedioForce ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@promStrength", (object?)promedioStrength ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@strengthUnidad", (object?)r.StrengthUnidad ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, tipoEnsayo, promedioForce, "lbf");
            return ensayoId;
        }

        // =====================================================================
        // ECT
        // =====================================================================
        public async Task<int> GuardarEct(EctGuardarRequest r)
        {
            decimal? Strength(decimal? force) => force.HasValue ? Math.Round(force.Value * 10, 4) : null; // lbf / 0.1m

            var s1 = Strength(r.P1Force);
            var s2 = Strength(r.P2Force);
            var s3 = Strength(r.P3Force);
            var s4 = Strength(r.P4Force);
            var s5 = Strength(r.P5Force);

            var forces = new[] { r.P1Force, r.P2Force, r.P3Force, r.P4Force, r.P5Force }
                .Where(v => v.HasValue).Select(v => v!.Value).ToList();
            var strengths = new[] { s1, s2, s3, s4, s5 }.Where(v => v.HasValue).Select(v => v!.Value).ToList();

            decimal? promedioForce = forces.Count > 0 ? Math.Round(forces.Average(), 4) : null;
            decimal? promedioStrengthLbfM = strengths.Count > 0 ? Math.Round(strengths.Average(), 4) : null;
            decimal? promedioStrengthLbIn = promedioStrengthLbfM.HasValue
                ? Math.Round(promedioStrengthLbfM.Value / 39.3701m, 4)
                : null;

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "ECT", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_ect
                        (ensayo_id, p1_force, p1_strength, p2_force, p2_strength, p3_force, p3_strength,
                         p4_force, p4_strength, p5_force, p5_strength, promedio_force,
                         promedio_strength_lbf_m, promedio_strength_lb_in)
                      VALUES
                        (@ensayoId, @p1f, @p1s, @p2f, @p2s, @p3f, @p3s, @p4f, @p4s, @p5f, @p5s,
                         @promForce, @promStrengthM, @promStrengthIn)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@p1f", (object?)r.P1Force ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p1s", (object?)s1 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2f", (object?)r.P2Force ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p2s", (object?)s2 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3f", (object?)r.P3Force ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p3s", (object?)s3 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p4f", (object?)r.P4Force ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p4s", (object?)s4 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p5f", (object?)r.P5Force ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@p5s", (object?)s5 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@promForce", (object?)promedioForce ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@promStrengthM", (object?)promedioStrengthLbfM ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@promStrengthIn", (object?)promedioStrengthLbIn ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            // Resultado principal del ECT = promedio de Strength en lbf/m (no el Force).
            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "ECT", promedioStrengthLbfM, "lbf/m");
            return ensayoId;
        }

        // =====================================================================
        // BCT MEDIDO
        // =====================================================================
        public async Task<int> GuardarBctMedido(BctMedidoGuardarRequest r)
        {
            var resultados = new[] { r.C1?.ResultadoLbf, r.C2?.ResultadoLbf, r.C3?.ResultadoLbf }
                .Where(v => v.HasValue).Select(v => v!.Value).ToList();
            decimal? promedio = resultados.Count > 0 ? Math.Round(resultados.Average(), 4) : null;

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "BCT_MEDIDO", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_bct_medido
                        (ensayo_id, cajas_ensayadas, motivo_menos_3,
                         c1_largo, c1_ancho, c1_alto, c1_tipo_onda, c1_gramaje_complejo, c1_espesor_complejo, c1_resultado_lbf,
                         c2_largo, c2_ancho, c2_alto, c2_tipo_onda, c2_gramaje_complejo, c2_espesor_complejo, c2_resultado_lbf,
                         c3_largo, c3_ancho, c3_alto, c3_tipo_onda, c3_gramaje_complejo, c3_espesor_complejo, c3_resultado_lbf,
                         promedio_lbf)
                      VALUES
                        (@ensayoId, @cajas, @motivo,
                         @c1l, @c1a, @c1h, @c1t, @c1g, @c1e, @c1r,
                         @c2l, @c2a, @c2h, @c2t, @c2g, @c2e, @c2r,
                         @c3l, @c3a, @c3h, @c3t, @c3g, @c3e, @c3r,
                         @promedio)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@cajas", r.CajasEnsayadas);
                cmd.Parameters.AddWithValue("@motivo", (object?)r.MotivoMenos3 ?? DBNull.Value);

                void AddCaja(string prefijo, BctCajaRequest? c)
                {
                    cmd.Parameters.AddWithValue($"@{prefijo}l", (object?)c?.Largo ?? DBNull.Value);
                    cmd.Parameters.AddWithValue($"@{prefijo}a", (object?)c?.Ancho ?? DBNull.Value);
                    cmd.Parameters.AddWithValue($"@{prefijo}h", (object?)c?.Alto ?? DBNull.Value);
                    cmd.Parameters.AddWithValue($"@{prefijo}t", (object?)c?.TipoOnda ?? DBNull.Value);
                    cmd.Parameters.AddWithValue($"@{prefijo}g", (object?)c?.GramajeComplejo ?? DBNull.Value);
                    cmd.Parameters.AddWithValue($"@{prefijo}e", (object?)c?.EspesorComplejo ?? DBNull.Value);
                    cmd.Parameters.AddWithValue($"@{prefijo}r", (object?)c?.ResultadoLbf ?? DBNull.Value);
                }
                AddCaja("c1", r.C1);
                AddCaja("c2", r.C2);
                AddCaja("c3", r.C3);

                cmd.Parameters.AddWithValue("@promedio", (object?)promedio ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "BCT_MEDIDO", promedio, "lbf");
            return ensayoId;
        }

        // =====================================================================
        // BCT TEORICO (McKee) - no es un ensayo fisico, toma ECT + Espesor ya finalizados
        // =====================================================================
        public async Task<int> GuardarBctTeorico(BctTeoricoGuardarRequest r)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            decimal? ectLbfM = null;
            using (
                var cmd = new MySqlCommand(
                    @"SELECT e.promedio_strength_lbf_m FROM muestra_laboratorio_ect e
                      INNER JOIN muestra_laboratorio_ensayos en ON en.id = e.ensayo_id
                      WHERE e.ensayo_id=@id AND en.muestra_id=@muestraId AND en.estado='Finalizado'",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", r.EctEnsayoId);
                cmd.Parameters.AddWithValue("@muestraId", r.MuestraId);
                var result = await cmd.ExecuteScalarAsync();
                if (result == null)
                    throw new InvalidOperationException("El ECT indicado no existe, no está finalizado, o no pertenece a esta muestra");
                ectLbfM = Convert.ToDecimal(result);
            }

            decimal? espesorMm = null;
            using (
                var cmd = new MySqlCommand(
                    @"SELECT e.promedio FROM muestra_laboratorio_espesor e
                      INNER JOIN muestra_laboratorio_ensayos en ON en.id = e.ensayo_id
                      WHERE e.ensayo_id=@id AND en.muestra_id=@muestraId AND en.estado='Finalizado'",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", r.EspesorEnsayoId);
                cmd.Parameters.AddWithValue("@muestraId", r.MuestraId);
                var result = await cmd.ExecuteScalarAsync();
                if (result == null)
                    throw new InvalidOperationException("El Espesor indicado no existe, no está finalizado, o no pertenece a esta muestra");
                espesorMm = Convert.ToDecimal(result);
            }

            if (r.LargoMm <= 0 || r.AnchoMm <= 0)
                throw new InvalidOperationException("Largo y ancho interno son obligatorios y deben ser mayores a 0");

            var ectLbIn = Math.Round(ectLbfM!.Value / 39.3701m, 4);
            var espesorIn = Math.Round(espesorMm!.Value / 25.4m, 6);
            var largoIn = Math.Round(r.LargoMm / 25.4m, 6);
            var anchoIn = Math.Round(r.AnchoMm / 25.4m, 6);
            var perimetroIn = Math.Round(2 * (largoIn + anchoIn), 6);

            var bctLbf = Math.Round(5.87m * ectLbIn * (decimal)Math.Sqrt((double)(espesorIn * perimetroIn)), 4);
            var bctKgf = Math.Round(bctLbf / 2.20462m, 4);

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "BCT_TEORICO", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_bct_teorico
                        (ensayo_id, ect_ensayo_id, espesor_ensayo_id, ect_lbf_m, ect_lb_in,
                         espesor_mm, espesor_in, largo_mm, largo_in, ancho_mm, ancho_in,
                         perimetro_in, bct_teorico_lbf, bct_teorico_kgf)
                      VALUES
                        (@ensayoId, @ectId, @espesorId, @ectLbfM, @ectLbIn, @espesorMm, @espesorIn,
                         @largoMm, @largoIn, @anchoMm, @anchoIn, @perimetroIn, @bctLbf, @bctKgf)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@ectId", r.EctEnsayoId);
                cmd.Parameters.AddWithValue("@espesorId", r.EspesorEnsayoId);
                cmd.Parameters.AddWithValue("@ectLbfM", ectLbfM);
                cmd.Parameters.AddWithValue("@ectLbIn", ectLbIn);
                cmd.Parameters.AddWithValue("@espesorMm", espesorMm);
                cmd.Parameters.AddWithValue("@espesorIn", espesorIn);
                cmd.Parameters.AddWithValue("@largoMm", r.LargoMm);
                cmd.Parameters.AddWithValue("@largoIn", largoIn);
                cmd.Parameters.AddWithValue("@anchoMm", r.AnchoMm);
                cmd.Parameters.AddWithValue("@anchoIn", anchoIn);
                cmd.Parameters.AddWithValue("@perimetroIn", perimetroIn);
                cmd.Parameters.AddWithValue("@bctLbf", bctLbf);
                cmd.Parameters.AddWithValue("@bctKgf", bctKgf);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "BCT_TEORICO", bctLbf, "lbf");
            return ensayoId;
        }

        // =====================================================================
        // VISCOSIDAD (solo PVA)
        // =====================================================================
        public async Task<int> GuardarViscosidad(ViscosidadGuardarRequest r)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "VISCOSIDAD", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_viscosidad
                        (ensayo_id, tipo_adhesivo, temperatura, equipo, husillo, velocidad_rpm, resultado_cp)
                      VALUES (@ensayoId, @tipoAdhesivo, @temp, @equipo, @husillo, @rpm, @resultado)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@tipoAdhesivo", (object?)r.TipoAdhesivo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@temp", (object?)r.Temperatura ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@equipo", (object?)r.Equipo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@husillo", (object?)r.Husillo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@rpm", (object?)r.VelocidadRpm ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@resultado", (object?)r.ResultadoCp ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "VISCOSIDAD", r.ResultadoCp, "cP");
            return ensayoId;
        }

        // =====================================================================
        // pH (tiras indicadoras, solo PVA)
        // =====================================================================
        public async Task<int> GuardarPh(PhGuardarRequest r)
        {
            decimal? valorNumerico = ParsearValorPh(r.ValorTexto);

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "PH", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_ph (ensayo_id, valor_texto, valor_numerico, color_observado)
                      VALUES (@ensayoId, @valorTexto, @valorNumerico, @color)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@valorTexto", r.ValorTexto);
                cmd.Parameters.AddWithValue("@valorNumerico", (object?)valorNumerico ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@color", (object?)r.ColorObservado ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "PH", valorNumerico, "pH");
            return ensayoId;
        }

        private static decimal? ParsearValorPh(string valorTexto)
        {
            if (string.IsNullOrWhiteSpace(valorTexto))
                return null;

            if (decimal.TryParse(valorTexto.Trim(), out var directo))
                return directo;

            var partes = valorTexto.Split('-');
            if (partes.Length == 2 && decimal.TryParse(partes[0].Trim(), out var a) && decimal.TryParse(partes[1].Trim(), out var b))
                return Math.Round((a + b) / 2, 2);

            return null; // no se pudo interpretar - queda "Sin especificacion", no se inventa un valor
        }

        // =====================================================================
        // SOLIDOS TOTALES (solo PVA)
        // =====================================================================
        public async Task<int> GuardarSolidos(SolidosGuardarRequest r)
        {
            (decimal? masaMuestra, decimal? masaResiduo, decimal? porcentaje, string? advertencia) Calcular(
                SolidosDeterminacionRequest? d
            )
            {
                if (d?.M1 == null || d.M2 == null || d.M3 == null)
                    return (null, null, null, null);

                if (d.M2.Value <= d.M1.Value)
                    return (null, null, null, "M2 debe ser mayor que M1");
                if (d.M3.Value < d.M1.Value)
                    return (null, null, null, "M3 debe ser mayor o igual que M1");

                var masaMuestra = d.M2.Value - d.M1.Value;
                var masaResiduo = d.M3.Value - d.M1.Value;
                var porcentaje = Math.Round((masaResiduo / masaMuestra) * 100, 2);
                var advertencia = d.M3.Value > d.M2.Value ? "M3 es mayor que M2, revisar la determinación" : null;

                return (masaMuestra, masaResiduo, porcentaje, advertencia);
            }

            var d1 = Calcular(r.D1);
            var d2 = Calcular(r.D2);
            var d3 = Calcular(r.D3);

            var advertencias = new[] { d1.advertencia, d2.advertencia, d3.advertencia }.Where(a => a != null).ToList();
            var observacionFinal = advertencias.Count > 0
                ? (string.IsNullOrWhiteSpace(r.Observacion) ? "" : r.Observacion + " ") + "ADVERTENCIA: " + string.Join("; ", advertencias)
                : r.Observacion;

            var porcentajes = new[] { d1.porcentaje, d2.porcentaje, d3.porcentaje }.Where(p => p.HasValue).Select(p => p!.Value).ToList();
            decimal? promedio = porcentajes.Count > 0 ? Math.Round(porcentajes.Average(), 2) : null;

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "SOLIDOS", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, observacionFinal);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_solidos
                        (ensayo_id,
                         d1_m1, d1_m2, d1_m3, d1_masa_muestra, d1_masa_residuo, d1_porcentaje,
                         d2_m1, d2_m2, d2_m3, d2_masa_muestra, d2_masa_residuo, d2_porcentaje,
                         d3_m1, d3_m2, d3_m3, d3_masa_muestra, d3_masa_residuo, d3_porcentaje,
                         promedio)
                      VALUES
                        (@ensayoId,
                         @d1m1, @d1m2, @d1m3, @d1mm, @d1mr, @d1p,
                         @d2m1, @d2m2, @d2m3, @d2mm, @d2mr, @d2p,
                         @d3m1, @d3m2, @d3m3, @d3mm, @d3mr, @d3p,
                         @promedio)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);

                cmd.Parameters.AddWithValue("@d1m1", (object?)r.D1?.M1 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d1m2", (object?)r.D1?.M2 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d1m3", (object?)r.D1?.M3 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d1mm", (object?)d1.masaMuestra ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d1mr", (object?)d1.masaResiduo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d1p", (object?)d1.porcentaje ?? DBNull.Value);

                cmd.Parameters.AddWithValue("@d2m1", (object?)r.D2?.M1 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d2m2", (object?)r.D2?.M2 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d2m3", (object?)r.D2?.M3 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d2mm", (object?)d2.masaMuestra ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d2mr", (object?)d2.masaResiduo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d2p", (object?)d2.porcentaje ?? DBNull.Value);

                cmd.Parameters.AddWithValue("@d3m1", (object?)r.D3?.M1 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d3m2", (object?)r.D3?.M2 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d3m3", (object?)r.D3?.M3 ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d3mm", (object?)d3.masaMuestra ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d3mr", (object?)d3.masaResiduo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@d3p", (object?)d3.porcentaje ?? DBNull.Value);

                cmd.Parameters.AddWithValue("@promedio", (object?)promedio ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            await FinalizarEnsayo(conn, ensayoId, r.MuestraId, "SOLIDOS", promedio, "%");
            return ensayoId;
        }

        // =====================================================================
        // LUGOL (solo adhesivo de corrugado) - categorico, Cumplimiento lo decide el analista
        // =====================================================================
        public async Task<int> GuardarLugol(LugolGuardarRequest r)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var ensayoId = await CrearEnsayo(conn, r.MuestraId, "LUGOL", r.Metodo, r.AnalistaUsuarioId, r.AnalistaNombre, r.Observacion);

            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_lugol (ensayo_id, punto_muestra, coloracion, resultado, interpretacion)
                      VALUES (@ensayoId, @punto, @coloracion, @resultado, @interpretacion)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@ensayoId", ensayoId);
                cmd.Parameters.AddWithValue("@punto", (object?)r.PuntoMuestra ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@coloracion", (object?)r.Coloracion ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@resultado", r.Resultado);
                cmd.Parameters.AddWithValue("@interpretacion", (object?)r.Interpretacion ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            using (
                var cmd = new MySqlCommand(
                    "UPDATE muestra_laboratorio_ensayos SET estado='Finalizado', cumplimiento=@cumplimiento WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@cumplimiento", r.Cumplimiento);
                cmd.Parameters.AddWithValue("@id", ensayoId);
                await cmd.ExecuteNonQueryAsync();
            }

            await RecalcularEvaluacionMuestra(conn, r.MuestraId);
            return ensayoId;
        }

        // =====================================================================
        // ESPECIFICACIONES (administración)
        // =====================================================================
        public async Task<List<EspecificacionDto>> ListarEspecificaciones()
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"SELECT id, tipo_muestra, tipo_ensayo, codigo_producto, limite_min, limite_max, unidad, activo
                  FROM muestra_laboratorio_especificaciones
                  ORDER BY tipo_muestra, tipo_ensayo, codigo_producto",
                conn
            );

            var lista = new List<EspecificacionDto>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                lista.Add(
                    new EspecificacionDto
                    {
                        Id = reader.GetInt32("id"),
                        TipoMuestra = reader["tipo_muestra"]?.ToString() ?? "",
                        TipoEnsayo = reader["tipo_ensayo"]?.ToString() ?? "",
                        CodigoProducto = reader["codigo_producto"]?.ToString(),
                        LimiteMin = reader["limite_min"] == DBNull.Value ? null : Convert.ToDecimal(reader["limite_min"]),
                        LimiteMax = reader["limite_max"] == DBNull.Value ? null : Convert.ToDecimal(reader["limite_max"]),
                        Unidad = reader["unidad"]?.ToString(),
                        Activo = Convert.ToBoolean(reader["activo"]),
                    }
                );
            }
            return lista;
        }

        public async Task<int> GuardarEspecificacion(GuardarEspecificacionRequest r)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            if (r.Id.HasValue)
            {
                using var cmd = new MySqlCommand(
                    @"UPDATE muestra_laboratorio_especificaciones
                      SET tipo_muestra=@tipoMuestra, tipo_ensayo=@tipoEnsayo, codigo_producto=@codigo,
                          limite_min=@min, limite_max=@max, unidad=@unidad
                      WHERE id=@id",
                    conn
                );
                cmd.Parameters.AddWithValue("@tipoMuestra", r.TipoMuestra);
                cmd.Parameters.AddWithValue("@tipoEnsayo", r.TipoEnsayo);
                cmd.Parameters.AddWithValue("@codigo", (object?)r.CodigoProducto ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@min", (object?)r.LimiteMin ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@max", (object?)r.LimiteMax ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@unidad", (object?)r.Unidad ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@id", r.Id.Value);
                await cmd.ExecuteNonQueryAsync();
                return r.Id.Value;
            }
            else
            {
                using var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio_especificaciones
                        (tipo_muestra, tipo_ensayo, codigo_producto, limite_min, limite_max, unidad, activo)
                      VALUES (@tipoMuestra, @tipoEnsayo, @codigo, @min, @max, @unidad, 1);
                      SELECT LAST_INSERT_ID();",
                    conn
                );
                cmd.Parameters.AddWithValue("@tipoMuestra", r.TipoMuestra);
                cmd.Parameters.AddWithValue("@tipoEnsayo", r.TipoEnsayo);
                cmd.Parameters.AddWithValue("@codigo", (object?)r.CodigoProducto ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@min", (object?)r.LimiteMin ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@max", (object?)r.LimiteMax ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@unidad", (object?)r.Unidad ?? DBNull.Value);
                var id = await cmd.ExecuteScalarAsync();
                return Convert.ToInt32(id);
            }
        }

        public async Task CambiarActivoEspecificacion(int id, bool activo)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                "UPDATE muestra_laboratorio_especificaciones SET activo=@activo WHERE id=@id",
                conn
            );
            cmd.Parameters.AddWithValue("@activo", activo);
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync();
        }

        public async Task AnularEnsayo(int ensayoId, string motivo)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            int muestraId;
            using (var cmd = new MySqlCommand("SELECT muestra_id FROM muestra_laboratorio_ensayos WHERE id = @id", conn))
            {
                cmd.Parameters.AddWithValue("@id", ensayoId);
                var result = await cmd.ExecuteScalarAsync();
                if (result == null)
                    throw new InvalidOperationException("Ensayo no encontrado");
                muestraId = Convert.ToInt32(result);
            }

            using (
                var cmd = new MySqlCommand(
                    "UPDATE muestra_laboratorio_ensayos SET estado='Anulado', motivo_anulacion=@motivo WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@motivo", motivo);
                cmd.Parameters.AddWithValue("@id", ensayoId);
                await cmd.ExecuteNonQueryAsync();
            }

            await RecalcularEvaluacionMuestra(conn, muestraId);
        }

        // Vincula un ensayo recien creado como "correccion" de uno Finalizado: el original se
        // anula (fila intacta, con motivo) y el nuevo queda marcado con ensayo_reemplaza_id/
        // motivo_reemplazo. Reutiliza el mismo mecanismo de AnularEnsayo en vez de un UPDATE
        // in-place por cada uno de los 13 tipos (que ya calculan/validan todo al crear un ensayo
        // nuevo via su Guardar* correspondiente) - cero duplicacion de esa logica.
        public async Task<bool> ReemplazarEnsayo(int ensayoOriginalId, int ensayoNuevoId, string motivo)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            int muestraId;
            string estadoOriginal;
            using (
                var cmd = new MySqlCommand(
                    "SELECT muestra_id, estado FROM muestra_laboratorio_ensayos WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", ensayoOriginalId);
                using var reader = await cmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                    return false;
                muestraId = Convert.ToInt32(reader["muestra_id"]);
                estadoOriginal = reader["estado"]?.ToString() ?? "";
            }

            if (estadoOriginal != "Finalizado")
                return false;

            using (
                var cmd = new MySqlCommand(
                    @"UPDATE muestra_laboratorio_ensayos
                      SET estado='Anulado', motivo_anulacion=@motivoAnulacion
                      WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue(
                    "@motivoAnulacion",
                    $"Reemplazado por ensayo #{ensayoNuevoId}: {motivo}"
                );
                cmd.Parameters.AddWithValue("@id", ensayoOriginalId);
                await cmd.ExecuteNonQueryAsync();
            }

            using (
                var cmd = new MySqlCommand(
                    @"UPDATE muestra_laboratorio_ensayos
                      SET ensayo_reemplaza_id=@originalId, motivo_reemplazo=@motivo
                      WHERE id=@nuevoId",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@originalId", ensayoOriginalId);
                cmd.Parameters.AddWithValue("@motivo", motivo);
                cmd.Parameters.AddWithValue("@nuevoId", ensayoNuevoId);
                await cmd.ExecuteNonQueryAsync();
            }

            await RecalcularEvaluacionMuestra(conn, muestraId);
            return true;
        }

        // Vinculo automatico a No Conformidades (solo cuando la muestra evaluo "No cumple" y
        // todavia no tiene una NC vinculada). Reutiliza NoConformidadesRepository.Crear tal cual
        // (mismo mecanismo generico por diccionario que ya usa el modulo No Conformidades) - no
        // se duplica el insert ni la generacion del codigo NC-AAAA-NNNNN.
        public async Task<(int Id, string Codigo)> CrearNoConformidad(int muestraId, string? usuarioNombre)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            string? evaluacion = null, tipoMuestra = null, np = null, cliente = null,
                codigoProducto = null, descripcion = null, observacion = null;
            int? ncIdExistente = null;

            using (
                var cmd = new MySqlCommand(
                    @"SELECT evaluacion, tipo_muestra, np, cliente, codigo_producto, descripcion,
                             observacion, nc_id
                      FROM muestra_laboratorio WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", muestraId);
                using var reader = await cmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                    throw new InvalidOperationException("Muestra no encontrada");

                evaluacion = reader["evaluacion"]?.ToString();
                tipoMuestra = reader["tipo_muestra"]?.ToString();
                np = reader["np"]?.ToString();
                cliente = reader["cliente"]?.ToString();
                codigoProducto = reader["codigo_producto"]?.ToString();
                descripcion = reader["descripcion"]?.ToString();
                observacion = reader["observacion"]?.ToString();
                ncIdExistente = reader["nc_id"] == DBNull.Value ? null : Convert.ToInt32(reader["nc_id"]);
            }

            if (evaluacion != "No cumple")
                throw new InvalidOperationException("Solo se puede crear una No Conformidad cuando la muestra evaluó \"No cumple\"");
            if (ncIdExistente.HasValue)
                throw new InvalidOperationException("Esta muestra ya tiene una No Conformidad vinculada");

            var campos = new Dictionary<string, object?>
            {
                ["tipo"] = "INTERNA",
                ["origen"] = "AUDITORIA_INTERNA",
                ["titulo"] = $"Muestra de Laboratorio #{muestraId} - No cumple especificación",
                ["descripcion"] =
                    $"Generada automáticamente desde Laboratorio - Muestras (muestra #{muestraId}, tipo {tipoMuestra}). "
                    + (string.IsNullOrWhiteSpace(descripcion) ? "" : $"{descripcion}. ")
                    + (string.IsNullOrWhiteSpace(observacion) ? "" : $"Observación: {observacion}."),
                ["severidad"] = "MEDIA",
                ["proceso"] = "Laboratorio",
                ["fechaDeteccion"] = DateTime.Now.Date,
                ["npNv"] = string.IsNullOrWhiteSpace(np) ? null : np,
                ["cliente"] = string.IsNullOrWhiteSpace(cliente) ? null : cliente,
                ["codigoProducto"] = string.IsNullOrWhiteSpace(codigoProducto) ? null : codigoProducto,
            };

            var (ncId, codigo) = await new NoConformidadesRepository(_db).Crear(campos, usuarioNombre);

            using (var cmd = new MySqlCommand("UPDATE muestra_laboratorio SET nc_id=@ncId WHERE id=@id", conn))
            {
                cmd.Parameters.AddWithValue("@ncId", ncId);
                cmd.Parameters.AddWithValue("@id", muestraId);
                await cmd.ExecuteNonQueryAsync();
            }

            return (ncId, codigo);
        }

        // =====================================================================
        // Helpers privados
        // =====================================================================
        private static async Task<int> CrearEnsayo(
            MySqlConnection conn,
            int muestraId,
            string tipoEnsayo,
            string? metodo,
            int? analistaId,
            string? analistaNombre,
            string? observacion
        )
        {
            using var cmd = new MySqlCommand(
                @"INSERT INTO muestra_laboratorio_ensayos
                    (muestra_id, tipo_ensayo, metodo, analista_usuario_id, analista_nombre, observacion, estado)
                  VALUES (@muestraId, @tipoEnsayo, @metodo, @analistaId, @analistaNombre, @observacion, 'Pendiente');
                  SELECT LAST_INSERT_ID();",
                conn
            );
            cmd.Parameters.AddWithValue("@muestraId", muestraId);
            cmd.Parameters.AddWithValue("@tipoEnsayo", tipoEnsayo);
            cmd.Parameters.AddWithValue("@metodo", (object?)metodo ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@analistaId", (object?)analistaId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@analistaNombre", (object?)analistaNombre ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@observacion", (object?)observacion ?? DBNull.Value);
            var id = await cmd.ExecuteScalarAsync();
            return Convert.ToInt32(id);
        }

        // Marca el ensayo Finalizado (o Pendiente con advertencia si no se pudo calcular resultado),
        // busca la especificacion vigente para el tipo_muestra+tipo_ensayo de la muestra, congela
        // los limites usados y calcula Cumplimiento. Luego recalcula la evaluacion de la muestra.
        private async Task FinalizarEnsayo(
            MySqlConnection conn,
            int ensayoId,
            int muestraId,
            string tipoEnsayo,
            decimal? resultado,
            string unidad
        )
        {
            string estado = resultado.HasValue ? "Finalizado" : "Pendiente";
            string cumplimiento = "Sin especificacion";
            decimal? specMin = null, specMax = null;
            string? specUnidad = null;

            if (resultado.HasValue)
            {
                string? tipoMuestra = null, codigoProducto = null;
                using (
                    var cmd = new MySqlCommand(
                        "SELECT tipo_muestra, codigo_producto FROM muestra_laboratorio WHERE id=@id",
                        conn
                    )
                )
                {
                    cmd.Parameters.AddWithValue("@id", muestraId);
                    using var reader = await cmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        tipoMuestra = reader["tipo_muestra"]?.ToString();
                        codigoProducto = reader["codigo_producto"]?.ToString();
                    }
                }

                if (!string.IsNullOrEmpty(tipoMuestra))
                {
                    var spec = await BuscarEspecificacion(conn, tipoMuestra, tipoEnsayo, codigoProducto);
                    if (spec != null)
                    {
                        specMin = spec.Value.min;
                        specMax = spec.Value.max;
                        specUnidad = spec.Value.unidad;

                        var cumple = (!specMin.HasValue || resultado.Value >= specMin.Value)
                            && (!specMax.HasValue || resultado.Value <= specMax.Value);
                        cumplimiento = cumple ? "Cumple" : "No cumple";
                    }
                }
            }

            using (
                var cmd = new MySqlCommand(
                    @"UPDATE muestra_laboratorio_ensayos
                      SET estado=@estado, resultado_valor=@resultado, resultado_unidad=@unidad,
                          especificacion_min=@specMin, especificacion_max=@specMax,
                          especificacion_unidad=@specUnidad, cumplimiento=@cumplimiento
                      WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@estado", estado);
                cmd.Parameters.AddWithValue("@resultado", (object?)resultado ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@unidad", resultado.HasValue ? unidad : (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@specMin", (object?)specMin ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@specMax", (object?)specMax ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@specUnidad", (object?)specUnidad ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cumplimiento", cumplimiento);
                cmd.Parameters.AddWithValue("@id", ensayoId);
                await cmd.ExecuteNonQueryAsync();
            }

            await RecalcularEvaluacionMuestra(conn, muestraId);
        }

        private static async Task<(decimal? min, decimal? max, string? unidad)?> BuscarEspecificacion(
            MySqlConnection conn,
            string tipoMuestra,
            string tipoEnsayo,
            string? codigoProducto
        )
        {
            using var cmd = new MySqlCommand(
                @"SELECT limite_min, limite_max, unidad FROM muestra_laboratorio_especificaciones
                  WHERE activo = 1 AND tipo_muestra = @tipoMuestra AND tipo_ensayo = @tipoEnsayo
                    AND (codigo_producto = @codigo OR codigo_producto IS NULL)
                  ORDER BY (codigo_producto IS NULL) ASC
                  LIMIT 1",
                conn
            );
            cmd.Parameters.AddWithValue("@tipoMuestra", tipoMuestra);
            cmd.Parameters.AddWithValue("@tipoEnsayo", tipoEnsayo);
            cmd.Parameters.AddWithValue("@codigo", (object?)codigoProducto ?? DBNull.Value);

            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return (
                reader["limite_min"] == DBNull.Value ? null : Convert.ToDecimal(reader["limite_min"]),
                reader["limite_max"] == DBNull.Value ? null : Convert.ToDecimal(reader["limite_max"]),
                reader["unidad"]?.ToString()
            );
        }

        // Estado/Evaluacion de la muestra (seccion 24 del pedido original): se recalcula cada vez
        // que un ensayo se finaliza o se anula. Simplificado para este primer set de 3 ensayos: no
        // existe todavia un catalogo de "ensayos obligatorios por tipo_muestra", asi que se
        // considera obligatorio cualquier ensayo no anulado que ya se haya creado.
        private static async Task RecalcularEvaluacionMuestra(MySqlConnection conn, int muestraId)
        {
            var estados = new List<string>();
            var cumplimientos = new List<string>();

            using (
                var cmd = new MySqlCommand(
                    "SELECT estado, cumplimiento FROM muestra_laboratorio_ensayos WHERE muestra_id=@id AND estado <> 'Anulado'",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", muestraId);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    estados.Add(reader["estado"]?.ToString() ?? "");
                    cumplimientos.Add(reader["cumplimiento"]?.ToString() ?? "");
                }
            }

            string estadoMuestra;
            string evaluacion;

            if (estados.Count == 0)
            {
                estadoMuestra = "Pendiente";
                evaluacion = "Sin especificacion";
            }
            else if (estados.Any(e => e != "Finalizado"))
            {
                estadoMuestra = "En analisis";
                evaluacion = "Parcialmente evaluada";
            }
            else
            {
                estadoMuestra = "Finalizada";
                if (cumplimientos.Any(c => c == "No cumple"))
                    evaluacion = "No cumple";
                else if (cumplimientos.All(c => c == "Sin especificacion"))
                    evaluacion = "Sin especificacion";
                else
                    evaluacion = "Cumple";
            }

            using var updCmd = new MySqlCommand(
                "UPDATE muestra_laboratorio SET estado=@estado, evaluacion=@evaluacion WHERE id=@id",
                conn
            );
            updCmd.Parameters.AddWithValue("@estado", estadoMuestra);
            updCmd.Parameters.AddWithValue("@evaluacion", evaluacion);
            updCmd.Parameters.AddWithValue("@id", muestraId);
            await updCmd.ExecuteNonQueryAsync();
        }

        private static async Task<object?> ObtenerDetalleHumedad(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_humedad WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return new
            {
                metodoEquipo = reader["metodo_equipo"]?.ToString(),
                higrometroIzquierdo = ReadDecimal(reader, "higrometro_izquierdo"),
                higrometroCentro = ReadDecimal(reader, "higrometro_centro"),
                higrometroDerecho = ReadDecimal(reader, "higrometro_derecho"),
                higrometroPromedio = ReadDecimal(reader, "higrometro_promedio"),
                termobalanzaValor = ReadDecimal(reader, "termobalanza_valor"),
                horno1PesoInicial = ReadDecimal(reader, "horno_1_peso_inicial"),
                horno1PesoFinal = ReadDecimal(reader, "horno_1_peso_final"),
                horno2PesoInicial = ReadDecimal(reader, "horno_2_peso_inicial"),
                horno2PesoFinal = ReadDecimal(reader, "horno_2_peso_final"),
                horno3PesoInicial = ReadDecimal(reader, "horno_3_peso_inicial"),
                horno3PesoFinal = ReadDecimal(reader, "horno_3_peso_final"),
                hornoPromedio = ReadDecimal(reader, "horno_promedio"),
                diferenciaMetodos = ReadDecimal(reader, "diferencia_metodos"),
            };
        }

        private static async Task<object?> ObtenerDetalleGramaje(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_gramaje WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return new
            {
                tipoMaterial = reader["tipo_material"]?.ToString(),
                modalidad = reader["modalidad"]?.ToString(),
                muestra1 = ReadDecimal(reader, "muestra_1"),
                muestra2 = ReadDecimal(reader, "muestra_2"),
                muestra3 = ReadDecimal(reader, "muestra_3"),
                promedio = ReadDecimal(reader, "promedio"),
            };
        }

        private static async Task<object?> ObtenerDetalleCobb(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_cobb WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            object Probeta(string prefijo) =>
                new
                {
                    bobina = reader[$"{prefijo}_bobina"]?.ToString(),
                    cara = reader[$"{prefijo}_cara"]?.ToString(),
                    pesoInicial = ReadDecimal(reader, $"{prefijo}_peso_inicial"),
                    pesoFinal = ReadDecimal(reader, $"{prefijo}_peso_final"),
                    tiempo = reader[$"{prefijo}_tiempo"]?.ToString(),
                    resultado = ReadDecimal(reader, $"{prefijo}_resultado"),
                };

            return new
            {
                p1 = Probeta("p1"),
                p2 = Probeta("p2"),
                p3 = Probeta("p3"),
                promedio = ReadDecimal(reader, "promedio"),
            };
        }

        private static async Task<object?> ObtenerDetalleEspesor(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_espesor WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return new
            {
                tipoMedicion = reader["tipo_medicion"]?.ToString(),
                medicion1 = ReadDecimal(reader, "medicion_1"),
                medicion2 = ReadDecimal(reader, "medicion_2"),
                medicion3 = ReadDecimal(reader, "medicion_3"),
                promedio = ReadDecimal(reader, "promedio"),
            };
        }

        private static async Task<object?> ObtenerDetalleResistencia(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_resistencia WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            object Probeta(string prefijo) =>
                new
                {
                    bobina = reader[$"{prefijo}_bobina"]?.ToString(),
                    force = ReadDecimal(reader, $"{prefijo}_force"),
                    strength = ReadDecimal(reader, $"{prefijo}_strength"),
                };

            return new
            {
                componente = reader["componente"]?.ToString(),
                p1 = Probeta("p1"),
                p2 = Probeta("p2"),
                p3 = Probeta("p3"),
                promedioForce = ReadDecimal(reader, "promedio_force"),
                promedioStrength = ReadDecimal(reader, "promedio_strength"),
                strengthUnidad = reader["strength_unidad"]?.ToString(),
            };
        }

        private static async Task<object?> ObtenerDetalleEct(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_ect WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            object Probeta(string n) => new
            {
                force = ReadDecimal(reader, $"p{n}_force"),
                strength = ReadDecimal(reader, $"p{n}_strength"),
            };

            return new
            {
                p1 = Probeta("1"),
                p2 = Probeta("2"),
                p3 = Probeta("3"),
                p4 = Probeta("4"),
                p5 = Probeta("5"),
                promedioForce = ReadDecimal(reader, "promedio_force"),
                promedioStrengthLbfM = ReadDecimal(reader, "promedio_strength_lbf_m"),
                promedioStrengthLbIn = ReadDecimal(reader, "promedio_strength_lb_in"),
            };
        }

        private static async Task<object?> ObtenerDetalleBctMedido(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_bct_medido WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            object Caja(string n) => new
            {
                largo = ReadDecimal(reader, $"c{n}_largo"),
                ancho = ReadDecimal(reader, $"c{n}_ancho"),
                alto = ReadDecimal(reader, $"c{n}_alto"),
                tipoOnda = reader[$"c{n}_tipo_onda"]?.ToString(),
                gramajeComplejo = ReadDecimal(reader, $"c{n}_gramaje_complejo"),
                espesorComplejo = ReadDecimal(reader, $"c{n}_espesor_complejo"),
                resultadoLbf = ReadDecimal(reader, $"c{n}_resultado_lbf"),
            };

            return new
            {
                cajasEnsayadas = Convert.ToInt32(reader["cajas_ensayadas"]),
                motivoMenos3 = reader["motivo_menos_3"]?.ToString(),
                c1 = Caja("1"),
                c2 = Caja("2"),
                c3 = Caja("3"),
                promedioLbf = ReadDecimal(reader, "promedio_lbf"),
            };
        }

        private static async Task<object?> ObtenerDetalleBctTeorico(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_bct_teorico WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return new
            {
                ectEnsayoId = Convert.ToInt32(reader["ect_ensayo_id"]),
                espesorEnsayoId = Convert.ToInt32(reader["espesor_ensayo_id"]),
                ectLbfM = ReadDecimal(reader, "ect_lbf_m"),
                ectLbIn = ReadDecimal(reader, "ect_lb_in"),
                espesorMm = ReadDecimal(reader, "espesor_mm"),
                espesorIn = ReadDecimal(reader, "espesor_in"),
                largoMm = ReadDecimal(reader, "largo_mm"),
                largoIn = ReadDecimal(reader, "largo_in"),
                anchoMm = ReadDecimal(reader, "ancho_mm"),
                anchoIn = ReadDecimal(reader, "ancho_in"),
                perimetroIn = ReadDecimal(reader, "perimetro_in"),
                bctTeoricoLbf = ReadDecimal(reader, "bct_teorico_lbf"),
                bctTeoricoKgf = ReadDecimal(reader, "bct_teorico_kgf"),
                aviso = "Resultado teórico estimado mediante fórmula de McKee. No reemplaza el ensayo físico BCT.",
            };
        }

        private static async Task<object?> ObtenerDetalleViscosidad(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_viscosidad WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return new
            {
                tipoAdhesivo = reader["tipo_adhesivo"]?.ToString(),
                temperatura = ReadDecimal(reader, "temperatura"),
                equipo = reader["equipo"]?.ToString(),
                husillo = reader["husillo"]?.ToString(),
                velocidadRpm = ReadDecimal(reader, "velocidad_rpm"),
                resultadoCp = ReadDecimal(reader, "resultado_cp"),
            };
        }

        private static async Task<object?> ObtenerDetallePh(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_ph WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return new
            {
                valorTexto = reader["valor_texto"]?.ToString(),
                valorNumerico = ReadDecimal(reader, "valor_numerico"),
                colorObservado = reader["color_observado"]?.ToString(),
            };
        }

        private static async Task<object?> ObtenerDetalleSolidos(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_solidos WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            object Determinacion(string n) => new
            {
                m1 = ReadDecimal(reader, $"d{n}_m1"),
                m2 = ReadDecimal(reader, $"d{n}_m2"),
                m3 = ReadDecimal(reader, $"d{n}_m3"),
                masaMuestra = ReadDecimal(reader, $"d{n}_masa_muestra"),
                masaResiduo = ReadDecimal(reader, $"d{n}_masa_residuo"),
                porcentaje = ReadDecimal(reader, $"d{n}_porcentaje"),
            };

            return new
            {
                d1 = Determinacion("1"),
                d2 = Determinacion("2"),
                d3 = Determinacion("3"),
                promedio = ReadDecimal(reader, "promedio"),
            };
        }

        private static async Task<object?> ObtenerDetalleLugol(MySqlConnection conn, int ensayoId)
        {
            using var cmd = new MySqlCommand("SELECT * FROM muestra_laboratorio_lugol WHERE ensayo_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", ensayoId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return null;

            return new
            {
                puntoMuestra = reader["punto_muestra"]?.ToString(),
                coloracion = reader["coloracion"]?.ToString(),
                resultado = reader["resultado"]?.ToString(),
                interpretacion = reader["interpretacion"]?.ToString(),
            };
        }

        // Indicadores del módulo "Laboratorio - Muestras" — reemplaza el resumen que antes tenía
        // el módulo viejo "Laboratorio" (visor de registro_ensayos de la app móvil, eliminado).
        // Fuente 100% propia (muestra_laboratorio/muestra_laboratorio_ensayos), sin filtros por
        // ahora (histórico completo) — el volumen real hoy es bajo, se puede acotar por fecha más
        // adelante si hace falta.
        public async Task<object> ObtenerIndicadores()
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            int totalMuestras;
            using (var cmd = new MySqlCommand("SELECT COUNT(*) FROM muestra_laboratorio", conn))
                totalMuestras = Convert.ToInt32(await cmd.ExecuteScalarAsync());

            int muestrasPendientes;
            using (var cmd = new MySqlCommand(
                "SELECT COUNT(*) FROM muestra_laboratorio WHERE estado IN ('Pendiente','En analisis')",
                conn
            ))
                muestrasPendientes = Convert.ToInt32(await cmd.ExecuteScalarAsync());

            int ensayosFinalizados;
            using (var cmd = new MySqlCommand(
                "SELECT COUNT(*) FROM muestra_laboratorio_ensayos WHERE estado = 'Finalizado'",
                conn
            ))
                ensayosFinalizados = Convert.ToInt32(await cmd.ExecuteScalarAsync());

            int cumple, noCumple;
            using (var cmd = new MySqlCommand(
                @"SELECT
                    SUM(cumplimiento = 'Cumple') AS cumple,
                    SUM(cumplimiento = 'No cumple') AS noCumple
                  FROM muestra_laboratorio_ensayos
                  WHERE estado = 'Finalizado'",
                conn
            ))
            {
                using var reader = await cmd.ExecuteReaderAsync();
                await reader.ReadAsync();
                cumple = reader.IsDBNull(0) ? 0 : Convert.ToInt32(reader.GetValue(0));
                noCumple = reader.IsDBNull(1) ? 0 : Convert.ToInt32(reader.GetValue(1));
            }
            var totalConEspec = cumple + noCumple;
            var pctCumplimiento = totalConEspec == 0 ? (decimal?)null : Math.Round(cumple * 100m / totalConEspec, 1);

            var porTipoEnsayo = new List<object>();
            using (var cmd = new MySqlCommand(
                @"SELECT tipo_ensayo, COUNT(*) AS total
                  FROM muestra_laboratorio_ensayos
                  WHERE estado <> 'Anulado'
                  GROUP BY tipo_ensayo
                  ORDER BY total DESC",
                conn
            ))
            {
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    porTipoEnsayo.Add(new { categoria = reader.GetString("tipo_ensayo"), total = reader.GetInt32("total") });
            }

            var porOrigen = new List<object>();
            using (var cmd = new MySqlCommand(
                @"SELECT origen, COUNT(*) AS total
                  FROM muestra_laboratorio
                  GROUP BY origen
                  ORDER BY total DESC",
                conn
            ))
            {
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    porOrigen.Add(new { categoria = reader.GetString("origen"), total = reader.GetInt32("total") });
            }

            var porCumplimiento = new List<object>();
            using (var cmd = new MySqlCommand(
                @"SELECT cumplimiento, COUNT(*) AS total
                  FROM muestra_laboratorio_ensayos
                  WHERE estado = 'Finalizado'
                  GROUP BY cumplimiento
                  ORDER BY total DESC",
                conn
            ))
            {
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    porCumplimiento.Add(new { categoria = reader.GetString("cumplimiento"), total = reader.GetInt32("total") });
            }

            return new
            {
                totalMuestras,
                muestrasPendientes,
                ensayosFinalizados,
                pctCumplimiento,
                porTipoEnsayo,
                porOrigen,
                porCumplimiento,
            };
        }

        private static decimal? ReadDecimal(MySqlDataReader reader, string column)
        {
            var value = reader[column];
            return value == DBNull.Value ? null : Convert.ToDecimal(value);
        }

        private static DateTime? ParseFecha(string? fecha)
        {
            if (string.IsNullOrWhiteSpace(fecha))
                return null;
            return DateTime.TryParse(fecha, out var dt) ? dt : null;
        }

        private static string FormatFecha(object value)
        {
            if (value == DBNull.Value)
                return "";
            return Convert.ToDateTime(value).ToString("yyyy-MM-dd HH:mm");
        }
    }
}
