using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Modules.RecepcionCalidad;
using QualityControlCenter.Repositories.FaretLaboratorio;
using QualityControlCenter.Repositories.NoConformidades;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.RecepcionCalidad
{
    public class RecepcionCalidadRepository
    {
        private readonly DbService _db;

        public RecepcionCalidadRepository(DbService db)
        {
            _db = db;
        }

        public async Task<int> CrearLote(CrearLoteRequest r, string? usuarioNombre)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            int loteId;
            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO recepcion_lotes_control
                        (tipo_materia_prima, empresa, proveedor, guia, item_code, descripcion, lote_proveedor,
                         ancho_declarado, gramaje_declarado, cantidad_total_lote, creado_por)
                      VALUES
                        (@tipo, @empresa, @proveedor, @guia, @itemCode, @descripcion, @loteProveedor,
                         @ancho, @gramaje, @cantidad, @creadoPor);
                      SELECT LAST_INSERT_ID();",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@tipo", r.TipoMateriaPrima);
                cmd.Parameters.AddWithValue("@empresa", r.Empresa);
                cmd.Parameters.AddWithValue("@proveedor", (object?)r.Proveedor ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@guia", (object?)r.Guia ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@itemCode", (object?)r.ItemCode ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@descripcion", (object?)r.Descripcion ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@loteProveedor", (object?)r.LoteProveedor ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ancho", (object?)r.AnchoDeclarado ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@gramaje", (object?)r.GramajeDeclarado ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cantidad", r.Bobinas.Count);
                cmd.Parameters.AddWithValue("@creadoPor", (object?)usuarioNombre ?? DBNull.Value);

                loteId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            }

            foreach (var bobina in r.Bobinas)
            {
                using var cmd = new MySqlCommand(
                    "INSERT INTO recepcion_lote_bobinas (lote_id, numero_bobina) VALUES (@loteId, @numero)",
                    conn
                );
                cmd.Parameters.AddWithValue("@loteId", loteId);
                cmd.Parameters.AddWithValue("@numero", bobina);
                await cmd.ExecuteNonQueryAsync();
            }

            if (r.TipoMateriaPrima == "PVA")
            {
                byte[]? foto = null;
                string? fotoMime = null;
                if (!string.IsNullOrWhiteSpace(r.PvaFotoBase64))
                {
                    foto = Convert.FromBase64String(r.PvaFotoBase64);
                    fotoMime = "image/jpeg";
                }

                using var cmd = new MySqlCommand(
                    @"INSERT INTO recepcion_pva
                        (lote_id, nombre_adhesivo, cantidad_bins, fecha_fabricacion_vencimiento,
                         certificado_calidad, condicion_general, observacion, foto, foto_mime)
                      VALUES
                        (@loteId, @nombre, @cantidadBins, @fechaFabVenc,
                         @certificado, @condicion, @observacion, @foto, @fotoMime)",
                    conn
                );
                cmd.Parameters.AddWithValue("@loteId", loteId);
                cmd.Parameters.AddWithValue("@nombre", (object?)r.PvaNombreAdhesivo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cantidadBins", (object?)r.PvaCantidadBins ?? DBNull.Value);
                cmd.Parameters.AddWithValue(
                    "@fechaFabVenc",
                    (object?)ParseFecha(r.PvaFechaFabricacionVencimiento) ?? DBNull.Value
                );
                cmd.Parameters.AddWithValue("@certificado", (object?)r.PvaCertificadoCalidad ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@condicion", (object?)r.PvaCondicionGeneral ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@observacion", (object?)r.PvaObservacion ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@foto", (object?)foto ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@fotoMime", (object?)fotoMime ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }
            else if (r.TipoMateriaPrima == "PliegoFaret")
            {
                byte[]? foto = null;
                string? fotoMime = null;
                if (!string.IsNullOrWhiteSpace(r.PfFotoBase64))
                {
                    foto = Convert.FromBase64String(r.PfFotoBase64);
                    fotoMime = "image/jpeg";
                }

                using var cmd = new MySqlCommand(
                    @"INSERT INTO recepcion_pliego_faret
                        (lote_id, np, cliente, producto, cantidad_total, cantidad_verde,
                         cantidad_azul, cantidad_roja, estado_carpeta, condicion_visual,
                         tipo_hallazgo, cantidad_afectada, observacion, foto, foto_mime)
                      VALUES
                        (@loteId, @np, @cliente, @producto, @cantTotal, @cantVerde,
                         @cantAzul, @cantRoja, @estadoCarpeta, @condicionVisual,
                         @tipoHallazgo, @cantAfectada, @observacion, @foto, @fotoMime)",
                    conn
                );
                cmd.Parameters.AddWithValue("@loteId", loteId);
                cmd.Parameters.AddWithValue("@np", (object?)r.PfNp ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cliente", (object?)r.PfCliente ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@producto", (object?)r.PfProducto ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cantTotal", (object?)r.PfCantidadTotal ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cantVerde", (object?)r.PfCantidadVerde ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cantAzul", (object?)r.PfCantidadAzul ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cantRoja", (object?)r.PfCantidadRoja ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@estadoCarpeta", (object?)r.PfEstadoCarpeta ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@condicionVisual", (object?)r.PfCondicionVisual ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tipoHallazgo", (object?)r.PfTipoHallazgo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cantAfectada", (object?)r.PfCantidadAfectada ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@observacion", (object?)r.PfObservacion ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@foto", (object?)foto ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@fotoMime", (object?)fotoMime ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            return loteId;
        }

        private static DateTime? ParseFecha(string? fecha)
        {
            if (string.IsNullOrWhiteSpace(fecha))
                return null;
            return DateTime.TryParse(fecha, out var dt) ? dt : null;
        }

        public async Task<List<LoteControlListItemDto>> Listar(string? estado, string? tipoMateriaPrima, string empresa)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            // Scope por empresa: NULL = INNPACK (lotes creados antes de que existiera esta
            // columna) - mismo criterio ya usado en Producto Terminado.
            var where = new List<string> { "l.eliminado = 0" };
            var cmd = new MySqlCommand();

            where.Add(
                empresa == "FARET" ? "l.empresa = 'FARET'" : "(l.empresa = 'INNPACK' OR l.empresa IS NULL)"
            );

            if (!string.IsNullOrWhiteSpace(estado))
            {
                where.Add("l.estado = @estado");
                cmd.Parameters.AddWithValue("@estado", estado);
            }
            if (!string.IsNullOrWhiteSpace(tipoMateriaPrima))
            {
                where.Add("l.tipo_materia_prima = @tipo");
                cmd.Parameters.AddWithValue("@tipo", tipoMateriaPrima);
            }

            cmd.CommandText =
                $@"SELECT
                    l.id, l.fecha_creacion, l.tipo_materia_prima, l.proveedor, l.item_code,
                    l.descripcion, l.cantidad_total_lote, l.estado,
                    (SELECT COUNT(*) FROM recepcion_lote_bobinas b WHERE b.lote_id = l.id) AS total_bobinas,
                    (SELECT COUNT(*) FROM recepcion_bobinas_muestreadas m WHERE m.lote_id = l.id) AS total_muestreadas
                FROM recepcion_lotes_control l
                WHERE {string.Join(" AND ", where)}
                ORDER BY l.fecha_creacion DESC
                LIMIT 300";
            cmd.Connection = conn;

            var lista = new List<LoteControlListItemDto>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                lista.Add(
                    new LoteControlListItemDto
                    {
                        Id = reader.GetInt32("id"),
                        FechaCreacion = FormatFecha(reader["fecha_creacion"]),
                        TipoMateriaPrima = reader["tipo_materia_prima"]?.ToString() ?? "",
                        Proveedor = reader["proveedor"]?.ToString() ?? "",
                        ItemCode = reader["item_code"]?.ToString() ?? "",
                        Descripcion = reader["descripcion"]?.ToString() ?? "",
                        CantidadTotalLote = reader["cantidad_total_lote"] == DBNull.Value
                            ? null
                            : Convert.ToDecimal(reader["cantidad_total_lote"]),
                        Estado = reader["estado"]?.ToString() ?? "",
                        TotalBobinas = Convert.ToInt32(reader["total_bobinas"]),
                        TotalMuestreadas = Convert.ToInt32(reader["total_muestreadas"]),
                    }
                );
            }
            return lista;
        }

        public async Task<LoteControlDetalleDto?> ObtenerDetalle(int id, string empresa)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var empresaWhere =
                empresa == "FARET" ? "AND l.empresa = 'FARET'" : "AND (l.empresa = 'INNPACK' OR l.empresa IS NULL)";

            LoteControlDetalleDto? lote = null;
            using (
                var cmd = new MySqlCommand(
                    $@"SELECT l.id, l.fecha_creacion, l.tipo_materia_prima, l.proveedor, l.guia, l.item_code,
                             l.descripcion, l.lote_proveedor, l.ancho_declarado, l.gramaje_declarado,
                             l.cantidad_total_lote, l.estado, l.nc_id, nc.codigo AS nc_codigo
                      FROM recepcion_lotes_control l
                      LEFT JOIN no_conformidades nc ON nc.id = l.nc_id
                      WHERE l.id=@id AND l.eliminado=0 {empresaWhere}",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    lote = new LoteControlDetalleDto
                    {
                        Id = reader.GetInt32("id"),
                        FechaCreacion = FormatFecha(reader["fecha_creacion"]),
                        TipoMateriaPrima = reader["tipo_materia_prima"]?.ToString() ?? "",
                        Proveedor = reader["proveedor"]?.ToString() ?? "",
                        Guia = reader["guia"]?.ToString() ?? "",
                        ItemCode = reader["item_code"]?.ToString() ?? "",
                        Descripcion = reader["descripcion"]?.ToString() ?? "",
                        LoteProveedor = reader["lote_proveedor"]?.ToString() ?? "",
                        AnchoDeclarado = reader["ancho_declarado"] == DBNull.Value ? null : Convert.ToDecimal(reader["ancho_declarado"]),
                        GramajeDeclarado = reader["gramaje_declarado"] == DBNull.Value ? null : Convert.ToDecimal(reader["gramaje_declarado"]),
                        CantidadTotalLote = reader["cantidad_total_lote"] == DBNull.Value ? null : Convert.ToDecimal(reader["cantidad_total_lote"]),
                        Estado = reader["estado"]?.ToString() ?? "",
                        NcId = reader["nc_id"] == DBNull.Value ? null : Convert.ToInt32(reader["nc_id"]),
                        NcCodigo = reader["nc_codigo"]?.ToString(),
                    };
                }
            }

            if (lote == null)
                return null;

            using (var cmd = new MySqlCommand("SELECT numero_bobina FROM recepcion_lote_bobinas WHERE lote_id=@id", conn))
            {
                cmd.Parameters.AddWithValue("@id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    lote.Bobinas.Add(reader.GetString(0));
            }
            lote.TotalBobinas = lote.Bobinas.Count;

            using (
                var cmd = new MySqlCommand(
                    @"SELECT norma, tamano_lote, nivel_inspeccion, aql, letra_codigo, tamano_muestra,
                             numero_aceptacion, numero_rechazo
                      FROM recepcion_plan_muestreo WHERE lote_id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    lote.Plan = new PlanMuestreoDto
                    {
                        Norma = reader["norma"]?.ToString() ?? "",
                        TamanoLote = Convert.ToInt32(reader["tamano_lote"]),
                        NivelInspeccion = reader["nivel_inspeccion"]?.ToString() ?? "",
                        Aql = Convert.ToDecimal(reader["aql"]),
                        LetraCodigo = reader["letra_codigo"]?.ToString() ?? "",
                        TamanoMuestra = Convert.ToInt32(reader["tamano_muestra"]),
                        NumeroAceptacion = reader["numero_aceptacion"] == DBNull.Value ? null : Convert.ToInt32(reader["numero_aceptacion"]),
                        NumeroRechazo = reader["numero_rechazo"] == DBNull.Value ? null : Convert.ToInt32(reader["numero_rechazo"]),
                    };
                }
            }

            using (
                var cmd = new MySqlCommand(
                    @"SELECT numero_bobina, seleccion_tipo, criterio_manual, usuario, fecha_seleccion
                      FROM recepcion_bobinas_muestreadas WHERE lote_id=@id ORDER BY fecha_seleccion",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    lote.Muestreadas.Add(
                        new BobinaMuestreadaDto
                        {
                            NumeroBobina = reader["numero_bobina"]?.ToString() ?? "",
                            SeleccionTipo = reader["seleccion_tipo"]?.ToString() ?? "",
                            CriterioManual = reader["criterio_manual"]?.ToString(),
                            Usuario = reader["usuario"]?.ToString() ?? "",
                            FechaSeleccion = FormatFecha(reader["fecha_seleccion"]),
                        }
                    );
                }
            }

            // Faret tiene laboratorio separado (faret_muestra_laboratorio) — la muestra vinculada
            // de un lote FARET vive ahí, no en muestra_laboratorio (esa es solo INNPACK).
            var tablaMuestra = empresa == "FARET" ? "faret_muestra_laboratorio" : "muestra_laboratorio";
            using (var cmd = new MySqlCommand($"SELECT id FROM {tablaMuestra} WHERE recepcion_lote_id=@id LIMIT 1", conn))
            {
                cmd.Parameters.AddWithValue("@id", id);
                var result = await cmd.ExecuteScalarAsync();
                lote.MuestraLaboratorioId = result == null ? null : Convert.ToInt32(result);
            }

            if (lote.TipoMateriaPrima == "PVA")
            {
                using var cmd = new MySqlCommand(
                    @"SELECT nombre_adhesivo, cantidad_bins, fecha_fabricacion_vencimiento,
                             certificado_calidad, condicion_general, observacion,
                             (foto IS NOT NULL) AS tiene_foto
                      FROM recepcion_pva WHERE lote_id=@id",
                    conn
                );
                cmd.Parameters.AddWithValue("@id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    lote.Pva = new PvaDto
                    {
                        NombreAdhesivo = reader["nombre_adhesivo"]?.ToString(),
                        CantidadBins = reader["cantidad_bins"] == DBNull.Value ? null : Convert.ToDecimal(reader["cantidad_bins"]),
                        FechaFabricacionVencimiento = reader["fecha_fabricacion_vencimiento"] == DBNull.Value
                            ? null
                            : Convert.ToDateTime(reader["fecha_fabricacion_vencimiento"]).ToString("yyyy-MM-dd"),
                        CertificadoCalidad = reader["certificado_calidad"]?.ToString() ?? "",
                        CondicionGeneral = reader["condicion_general"]?.ToString() ?? "",
                        Observacion = reader["observacion"]?.ToString(),
                        TieneFoto = Convert.ToBoolean(reader["tiene_foto"]),
                    };
                }
            }
            else if (lote.TipoMateriaPrima == "PliegoFaret")
            {
                using var cmd = new MySqlCommand(
                    @"SELECT np, cliente, producto, cantidad_total, cantidad_verde, cantidad_azul,
                             cantidad_roja, estado_carpeta, condicion_visual, tipo_hallazgo,
                             cantidad_afectada, observacion, (foto IS NOT NULL) AS tiene_foto
                      FROM recepcion_pliego_faret WHERE lote_id=@id",
                    conn
                );
                cmd.Parameters.AddWithValue("@id", id);
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    lote.PliegoFaret = new PliegoFaretDto
                    {
                        Np = reader["np"]?.ToString(),
                        Cliente = reader["cliente"]?.ToString(),
                        Producto = reader["producto"]?.ToString(),
                        CantidadTotal = reader["cantidad_total"] == DBNull.Value ? null : Convert.ToDecimal(reader["cantidad_total"]),
                        CantidadVerde = reader["cantidad_verde"] == DBNull.Value ? null : Convert.ToDecimal(reader["cantidad_verde"]),
                        CantidadAzul = reader["cantidad_azul"] == DBNull.Value ? null : Convert.ToDecimal(reader["cantidad_azul"]),
                        CantidadRoja = reader["cantidad_roja"] == DBNull.Value ? null : Convert.ToDecimal(reader["cantidad_roja"]),
                        EstadoCarpeta = reader["estado_carpeta"]?.ToString() ?? "",
                        CondicionVisual = reader["condicion_visual"]?.ToString(),
                        TipoHallazgo = reader["tipo_hallazgo"]?.ToString(),
                        CantidadAfectada = reader["cantidad_afectada"] == DBNull.Value ? null : Convert.ToDecimal(reader["cantidad_afectada"]),
                        Observacion = reader["observacion"]?.ToString(),
                        TieneFoto = Convert.ToBoolean(reader["tiene_foto"]),
                    };
                }
            }

            return lote;
        }

        // Foto de PVA/Pliego Faret (base64 + mime) para previsualizar, mismo patron que
        // ControlDocumental.HandleAdjuntoAbrir. Devuelve null si el lote no es de ese tipo o no
        // tiene foto cargada.
        public async Task<(byte[] contenido, string mime)?> ObtenerFoto(int loteId, string tipoMateriaPrima)
        {
            var tabla = tipoMateriaPrima == "PVA" ? "recepcion_pva"
                : tipoMateriaPrima == "PliegoFaret" ? "recepcion_pliego_faret"
                : null;
            if (tabla == null)
                return null;

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand($"SELECT foto, foto_mime FROM {tabla} WHERE lote_id=@id", conn);
            cmd.Parameters.AddWithValue("@id", loteId);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync() || reader["foto"] == DBNull.Value)
                return null;

            return ((byte[])reader["foto"], reader["foto_mime"]?.ToString() ?? "image/jpeg");
        }

        // Vinculo automatico a No Conformidades (solo cuando el lote quedo "NoConforme" y todavia
        // no tiene una NC vinculada). Mismo mecanismo que MuestraLaboratorioRepository.
        // CrearNoConformidad - reutiliza NoConformidadesRepository.Crear tal cual.
        public async Task<(int Id, string Codigo)> CrearNoConformidad(int loteId, string? usuarioNombre)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            string? estado = null, tipoMateriaPrima = null, proveedor = null, itemCode = null,
                descripcion = null, guia = null;
            int? ncIdExistente = null;

            using (
                var cmd = new MySqlCommand(
                    @"SELECT estado, tipo_materia_prima, proveedor, item_code, descripcion, guia, nc_id
                      FROM recepcion_lotes_control WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", loteId);
                using var reader = await cmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                    throw new InvalidOperationException("Lote no encontrado");

                estado = reader["estado"]?.ToString();
                tipoMateriaPrima = reader["tipo_materia_prima"]?.ToString();
                proveedor = reader["proveedor"]?.ToString();
                itemCode = reader["item_code"]?.ToString();
                descripcion = reader["descripcion"]?.ToString();
                guia = reader["guia"]?.ToString();
                ncIdExistente = reader["nc_id"] == DBNull.Value ? null : Convert.ToInt32(reader["nc_id"]);
            }

            if (estado != "NoConforme")
                throw new InvalidOperationException("Solo se puede crear una No Conformidad cuando el lote quedó \"No conforme\"");
            if (ncIdExistente.HasValue)
                throw new InvalidOperationException("Este lote ya tiene una No Conformidad vinculada");

            var campos = new Dictionary<string, object?>
            {
                ["tipo"] = "INTERNA",
                ["origen"] = "AUDITORIA_INTERNA",
                ["titulo"] = $"Lote de Recepción #{loteId} - No conforme",
                ["descripcion"] =
                    $"Generada automáticamente desde Control de Recepción - Calidad (lote #{loteId}, "
                    + $"tipo {tipoMateriaPrima}, proveedor {proveedor}, guía {guia}). "
                    + (string.IsNullOrWhiteSpace(descripcion) ? "" : $"{descripcion}."),
                ["severidad"] = "MEDIA",
                ["proceso"] = "Recepción de Materia Prima",
                ["fechaDeteccion"] = DateTime.Now.Date,
                ["codigoProducto"] = string.IsNullOrWhiteSpace(itemCode) ? null : itemCode,
            };

            var (ncId, codigo) = await new NoConformidadesRepository(_db).Crear(campos, usuarioNombre);

            using (var cmd = new MySqlCommand("UPDATE recepcion_lotes_control SET nc_id=@ncId WHERE id=@id", conn))
            {
                cmd.Parameters.AddWithValue("@ncId", ncId);
                cmd.Parameters.AddWithValue("@id", loteId);
                await cmd.ExecuteNonQueryAsync();
            }

            return (ncId, codigo);
        }

        // Calcula el plan NCh44 (Nivel II sembrado completo; Ac/Re sembrado solo para AQL 2.5 -
        // ver aviso en el SQL de origen) y lo guarda. No avanza el estado del lote (eso ocurre
        // recien cuando se seleccionan las bobinas muestreadas).
        public async Task<PlanMuestreoDto> GenerarPlan(GenerarPlanRequest r)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            int tamanoLote;
            using (var cmd = new MySqlCommand("SELECT cantidad_total_lote FROM recepcion_lotes_control WHERE id=@id", conn))
            {
                cmd.Parameters.AddWithValue("@id", r.LoteId);
                var result = await cmd.ExecuteScalarAsync();
                if (result == null)
                    throw new InvalidOperationException("Lote no encontrado");
                tamanoLote = Convert.ToInt32(Convert.ToDecimal(result));
            }

            string? letra = null;
            using (
                var cmd = new MySqlCommand(
                    @"SELECT letra_codigo FROM recepcion_muestreo_letras
                      WHERE nivel_inspeccion=@nivel AND tamano_min <= @tamano
                        AND (tamano_max IS NULL OR tamano_max >= @tamano)
                      LIMIT 1",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@nivel", r.NivelInspeccion);
                cmd.Parameters.AddWithValue("@tamano", tamanoLote);
                var result = await cmd.ExecuteScalarAsync();
                letra = result?.ToString();
            }

            if (letra == null)
                throw new InvalidOperationException(
                    $"No hay tabla de muestreo NCh44 cargada para nivel {r.NivelInspeccion} y tamaño de lote {tamanoLote}"
                );

            int tamanoMuestra;
            using (var cmd = new MySqlCommand("SELECT tamano_muestra FROM recepcion_muestreo_tamanos WHERE letra_codigo=@letra", conn))
            {
                cmd.Parameters.AddWithValue("@letra", letra);
                var result = await cmd.ExecuteScalarAsync();
                tamanoMuestra = Convert.ToInt32(result);
            }

            int? ac = null, re = null;
            using (
                var cmd = new MySqlCommand(
                    "SELECT numero_aceptacion, numero_rechazo FROM recepcion_muestreo_planes WHERE letra_codigo=@letra AND aql=@aql",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@letra", letra);
                cmd.Parameters.AddWithValue("@aql", r.Aql);
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    ac = reader["numero_aceptacion"] == DBNull.Value ? null : Convert.ToInt32(reader["numero_aceptacion"]);
                    re = reader["numero_rechazo"] == DBNull.Value ? null : Convert.ToInt32(reader["numero_rechazo"]);
                }
            }

            using (
                var cmd = new MySqlCommand(
                    @"REPLACE INTO recepcion_plan_muestreo
                        (lote_id, norma, tamano_lote, nivel_inspeccion, aql, letra_codigo,
                         tamano_muestra, numero_aceptacion, numero_rechazo)
                      VALUES (@loteId, 'NCh44', @tamanoLote, @nivel, @aql, @letra, @tamanoMuestra, @ac, @re)",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@loteId", r.LoteId);
                cmd.Parameters.AddWithValue("@tamanoLote", tamanoLote);
                cmd.Parameters.AddWithValue("@nivel", r.NivelInspeccion);
                cmd.Parameters.AddWithValue("@aql", r.Aql);
                cmd.Parameters.AddWithValue("@letra", letra);
                cmd.Parameters.AddWithValue("@tamanoMuestra", tamanoMuestra);
                cmd.Parameters.AddWithValue("@ac", (object?)ac ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@re", (object?)re ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            return new PlanMuestreoDto
            {
                Norma = "NCh44",
                TamanoLote = tamanoLote,
                NivelInspeccion = r.NivelInspeccion,
                Aql = r.Aql,
                LetraCodigo = letra,
                TamanoMuestra = tamanoMuestra,
                NumeroAceptacion = ac,
                NumeroRechazo = re,
            };
        }

        public async Task MuestrearBobinas(int loteId, List<BobinaMuestreadaRequest> bobinas, string? usuario)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var validas = new HashSet<string>();
            using (var cmd = new MySqlCommand("SELECT numero_bobina FROM recepcion_lote_bobinas WHERE lote_id=@id", conn))
            {
                cmd.Parameters.AddWithValue("@id", loteId);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                    validas.Add(reader.GetString(0));
            }

            var invalidas = bobinas.Select(b => b.NumeroBobina).Where(n => !validas.Contains(n)).ToList();
            if (invalidas.Count > 0)
                throw new InvalidOperationException(
                    $"Las siguientes bobinas no pertenecen a este lote: {string.Join(", ", invalidas)}"
                );

            using (var cmd = new MySqlCommand("DELETE FROM recepcion_bobinas_muestreadas WHERE lote_id=@id", conn))
            {
                cmd.Parameters.AddWithValue("@id", loteId);
                await cmd.ExecuteNonQueryAsync();
            }

            foreach (var b in bobinas)
            {
                using var cmd = new MySqlCommand(
                    @"INSERT INTO recepcion_bobinas_muestreadas
                        (lote_id, numero_bobina, seleccion_tipo, criterio_manual, usuario)
                      VALUES (@loteId, @numero, @tipo, @criterio, @usuario)",
                    conn
                );
                cmd.Parameters.AddWithValue("@loteId", loteId);
                cmd.Parameters.AddWithValue("@numero", b.NumeroBobina);
                cmd.Parameters.AddWithValue("@tipo", b.SeleccionTipo);
                cmd.Parameters.AddWithValue("@criterio", (object?)b.CriterioManual ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@usuario", (object?)usuario ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }

            using (
                var cmd = new MySqlCommand(
                    "UPDATE recepcion_lotes_control SET estado='PendienteLaboratorio' WHERE id=@id AND estado='PendienteMuestreo'",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", loteId);
                await cmd.ExecuteNonQueryAsync();
            }
        }

        public async Task<int> CrearMuestraLaboratorio(int loteId, int? usuarioId, string? usuarioNombre, string empresa)
        {
            // Faret tiene laboratorio separado (tablas faret_muestra_laboratorio*, equipo/analistas
            // distintos a INNPACK, decisión explícita del usuario) — delega en FaretLaboratorioRepository
            // y solo se encarga acá de avanzar el estado del lote (tabla compartida entre empresas).
            if (empresa == "FARET")
            {
                var muestraFaretId = await new FaretLaboratorioRepository(_db)
                    .CrearMuestraDesdeLoteRecepcion(loteId, usuarioId, usuarioNombre);

                using var connEstado = _db.GetCalidadConnection();
                await connEstado.OpenAsync();
                using var cmdEstado = new MySqlCommand(
                    "UPDATE recepcion_lotes_control SET estado='EnAnalisis' WHERE id=@id",
                    connEstado
                );
                cmdEstado.Parameters.AddWithValue("@id", loteId);
                await cmdEstado.ExecuteNonQueryAsync();

                return muestraFaretId;
            }

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            string tipoMateriaPrima = "", proveedor = "", itemCode = "", descripcion = "", loteProveedor = "";
            using (
                var cmd = new MySqlCommand(
                    "SELECT tipo_materia_prima, proveedor, item_code, descripcion, lote_proveedor FROM recepcion_lotes_control WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", loteId);
                using var reader = await cmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                    throw new InvalidOperationException("Lote no encontrado");

                tipoMateriaPrima = reader["tipo_materia_prima"]?.ToString() ?? "";
                proveedor = reader["proveedor"]?.ToString() ?? "";
                itemCode = reader["item_code"]?.ToString() ?? "";
                descripcion = reader["descripcion"]?.ToString() ?? "";
                loteProveedor = reader["lote_proveedor"]?.ToString() ?? "";
            }

            var tipoMuestra = tipoMateriaPrima switch
            {
                "PVA" => "AdhesivoPVA",
                "PliegoFaret" => "PliegoImpreso",
                _ => "Papel",
            };

            int muestraId;
            using (
                var cmd = new MySqlCommand(
                    @"INSERT INTO muestra_laboratorio
                        (analista_usuario_id, analista_nombre, origen, tipo_muestra, codigo_producto,
                         descripcion, proveedor, lote, recepcion_lote_id, creado_por)
                      VALUES
                        (@analistaId, @analistaNombre, 'ControlRecepcion', @tipoMuestra, @codigo,
                         @descripcion, @proveedor, @lote, @loteId, @creadoPor);
                      SELECT LAST_INSERT_ID();",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@analistaId", (object?)usuarioId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@analistaNombre", (object?)usuarioNombre ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tipoMuestra", tipoMuestra);
                cmd.Parameters.AddWithValue("@codigo", itemCode);
                cmd.Parameters.AddWithValue("@descripcion", descripcion);
                cmd.Parameters.AddWithValue("@proveedor", proveedor);
                cmd.Parameters.AddWithValue("@lote", loteProveedor);
                cmd.Parameters.AddWithValue("@loteId", loteId);
                cmd.Parameters.AddWithValue("@creadoPor", (object?)usuarioNombre ?? DBNull.Value);

                muestraId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            }

            using (
                var cmd = new MySqlCommand(
                    "UPDATE recepcion_lotes_control SET estado='EnAnalisis' WHERE id=@id",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", loteId);
                await cmd.ExecuteNonQueryAsync();
            }

            return muestraId;
        }

        public async Task ActualizarEstado(int loteId, string estado)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand("UPDATE recepcion_lotes_control SET estado=@estado WHERE id=@id", conn);
            cmd.Parameters.AddWithValue("@estado", estado);
            cmd.Parameters.AddWithValue("@id", loteId);
            await cmd.ExecuteNonQueryAsync();
        }

        private static string FormatFecha(object value)
        {
            if (value == DBNull.Value)
                return "";
            return Convert.ToDateTime(value).ToString("yyyy-MM-dd HH:mm");
        }
    }
}
