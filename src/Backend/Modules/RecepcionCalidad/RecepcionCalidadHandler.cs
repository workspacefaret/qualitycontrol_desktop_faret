using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.SapRecepcionApi;
using QualityControlCenter.Repositories.RecepcionCalidad;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.RecepcionCalidad
{
    // Modulo "Control de Recepcion - Calidad" (solo INNPACK). Consulta SAP (via apisapfaret) de
    // solo lectura, arma lotes de inspeccion propios de QCC + plan de muestreo NCh44, y crea la
    // muestra vinculada en el modulo Laboratorio (Modules/MuestraLaboratorio) ya existente.
    public class RecepcionCalidadHandler
    {
        private readonly RecepcionCalidadRepository _repository;
        private readonly SapRecepcionApiClient _sapClient;
        private readonly CurrentUserSessionService _session;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public RecepcionCalidadHandler(DbService db, SapRecepcionApiClient sapClient, CurrentUserSessionService session)
        {
            _repository = new RecepcionCalidadRepository(db);
            _sapClient = sapClient;
            _session = session;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                var jsonData = GetDataElement(data);

                if (action == "recepcion.sap.consultar")
                {
                    if (!_sapClient.IsConfigured)
                        return Error("La consulta a SAP no está configurada en este equipo.");

                    var empresaSap = GetEmpresaOrDefault(jsonData);
                    var desde = GetString(jsonData, "desde");
                    var hasta = GetString(jsonData, "hasta");
                    if (string.IsNullOrWhiteSpace(desde) || string.IsNullOrWhiteSpace(hasta))
                        return Error("Debes indicar desde y hasta (yyyyMMdd)");

                    var (ok, body) = await _sapClient.GetAsync(
                        $"api/recepcion/bobinas?desde={desde}&hasta={hasta}&empresa={empresaSap}"
                    );
                    if (!ok)
                        return Error(ExtraerMensaje(body));

                    var items = ParseSapItems(body);
                    return Ok(items);
                }

                if (action == "recepcion.sap.lotes")
                {
                    if (!_sapClient.IsConfigured)
                        return Error("La consulta a SAP no está configurada en este equipo.");

                    var empresaSap = GetEmpresaOrDefault(jsonData);
                    var itemCode = GetString(jsonData, "itemCode");
                    var fecha = GetString(jsonData, "fecha");
                    if (string.IsNullOrWhiteSpace(itemCode) || string.IsNullOrWhiteSpace(fecha))
                        return Error("Debes indicar itemCode y fecha (yyyyMMdd)");

                    var (ok, body) = await _sapClient.GetAsync(
                        $"api/recepcion/bobinas/lotes?itemCode={Uri.EscapeDataString(itemCode)}&fecha={fecha}&empresa={empresaSap}"
                    );
                    if (!ok)
                        return Error(ExtraerMensaje(body));

                    var items = ParseSapLotes(body);
                    return Ok(items);
                }

                if (action == "recepcion.crear")
                {
                    var usuario = _session.GetCurrentUser();
                    var bobinas = new List<string>();
                    if (jsonData.TryGetProperty("bobinas", out var bobinasEl) && bobinasEl.ValueKind == JsonValueKind.Array)
                        bobinas = bobinasEl.EnumerateArray().Select(b => b.GetString() ?? "").Where(s => s != "").ToList();

                    var empresaCrear = GetEmpresaOrDefault(jsonData);
                    var request = new CrearLoteRequest
                    {
                        TipoMateriaPrima = GetString(jsonData, "tipoMateriaPrima"),
                        Empresa = empresaCrear,
                        Proveedor = GetString(jsonData, "proveedor"),
                        Guia = GetString(jsonData, "guia"),
                        ItemCode = GetString(jsonData, "itemCode"),
                        Descripcion = GetString(jsonData, "descripcion"),
                        LoteProveedor = GetString(jsonData, "loteProveedor"),
                        AnchoDeclarado = GetDecimal(jsonData, "anchoDeclarado"),
                        GramajeDeclarado = GetDecimal(jsonData, "gramajeDeclarado"),
                        Bobinas = bobinas,
                        PvaNombreAdhesivo = GetString(jsonData, "pvaNombreAdhesivo"),
                        PvaCantidadBins = GetDecimal(jsonData, "pvaCantidadBins"),
                        PvaFechaFabricacionVencimiento = GetString(jsonData, "pvaFechaFabricacionVencimiento"),
                        PvaCertificadoCalidad = GetString(jsonData, "pvaCertificadoCalidad"),
                        PvaCondicionGeneral = GetString(jsonData, "pvaCondicionGeneral"),
                        PvaObservacion = GetString(jsonData, "pvaObservacion"),
                        PvaFotoBase64 = GetString(jsonData, "pvaFotoBase64"),
                        PfNp = GetString(jsonData, "pfNp"),
                        PfCliente = GetString(jsonData, "pfCliente"),
                        PfProducto = GetString(jsonData, "pfProducto"),
                        PfCantidadTotal = GetDecimal(jsonData, "pfCantidadTotal"),
                        PfCantidadVerde = GetDecimal(jsonData, "pfCantidadVerde"),
                        PfCantidadAzul = GetDecimal(jsonData, "pfCantidadAzul"),
                        PfCantidadRoja = GetDecimal(jsonData, "pfCantidadRoja"),
                        PfEstadoCarpeta = GetString(jsonData, "pfEstadoCarpeta"),
                        PfCondicionVisual = GetString(jsonData, "pfCondicionVisual"),
                        PfTipoHallazgo = GetString(jsonData, "pfTipoHallazgo"),
                        PfCantidadAfectada = GetDecimal(jsonData, "pfCantidadAfectada"),
                        PfObservacion = GetString(jsonData, "pfObservacion"),
                        PfFotoBase64 = GetString(jsonData, "pfFotoBase64"),
                    };

                    if (string.IsNullOrWhiteSpace(request.TipoMateriaPrima))
                        return Error("Falta el tipo de materia prima");
                    if (request.TipoMateriaPrima == "Bobina" && request.Bobinas.Count == 0)
                        return Error("Debes seleccionar al menos una bobina desde SAP");
                    if (empresaCrear == "FARET" && request.TipoMateriaPrima != "Bobina")
                        return Error("Para Faret, por ahora solo está habilitado el tipo Bobina de papel (SAP)");

                    if (request.TipoMateriaPrima == "PliegoFaret")
                    {
                        var suma = (request.PfCantidadVerde ?? 0) + (request.PfCantidadAzul ?? 0) + (request.PfCantidadRoja ?? 0);
                        if (request.PfCantidadTotal.HasValue && suma != request.PfCantidadTotal.Value)
                            return Error("Cantidad verde + azul + roja debe ser igual a la cantidad total");
                    }

                    var id = await _repository.CrearLote(request, usuario?.NombreCompleto);
                    return Ok(new { id });
                }

                if (action == "recepcion.foto.abrir")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    var tipo = GetString(jsonData, "tipoMateriaPrima");
                    if (loteId <= 0 || string.IsNullOrWhiteSpace(tipo))
                        return Error("Falta el lote o el tipo de materia prima");

                    var foto = await _repository.ObtenerFoto(loteId, tipo);
                    if (foto == null)
                        return Error("Este lote no tiene fotografía cargada");

                    return Ok(new { base64 = Convert.ToBase64String(foto.Value.contenido), mime = foto.Value.mime });
                }

                if (action == "recepcion.nc.crear")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    if (loteId <= 0)
                        return Error("Falta indicar el lote");

                    var usuario = _session.GetCurrentUser();
                    try
                    {
                        var (ncId, codigo) = await _repository.CrearNoConformidad(loteId, usuario?.NombreCompleto);
                        return Ok(new { ncId, codigo });
                    }
                    catch (InvalidOperationException ex)
                    {
                        return Error(ex.Message);
                    }
                }

                if (action == "recepcion.list")
                {
                    var empresaList = GetEmpresaOrDefault(jsonData);
                    var estado = GetString(jsonData, "estado");
                    var tipo = GetString(jsonData, "tipoMateriaPrima");
                    var items = await _repository.Listar(
                        string.IsNullOrWhiteSpace(estado) ? null : estado,
                        string.IsNullOrWhiteSpace(tipo) ? null : tipo,
                        empresaList
                    );
                    return Ok(items);
                }

                if (action == "recepcion.detalle")
                {
                    var empresaDetalle = GetEmpresaOrDefault(jsonData);
                    var id = GetInt(jsonData, "id") ?? 0;
                    var detalle = await _repository.ObtenerDetalle(id, empresaDetalle);
                    if (detalle == null)
                        return Error("Lote no encontrado");
                    return Ok(detalle);
                }

                if (action == "recepcion.plan.generar")
                {
                    var request = new GenerarPlanRequest
                    {
                        LoteId = GetInt(jsonData, "loteId") ?? 0,
                        NivelInspeccion = string.IsNullOrWhiteSpace(GetString(jsonData, "nivelInspeccion"))
                            ? "II"
                            : GetString(jsonData, "nivelInspeccion"),
                        Aql = GetDecimal(jsonData, "aql") ?? 2.5m,
                    };

                    if (request.LoteId <= 0)
                        return Error("Falta indicar el lote");

                    var plan = await _repository.GenerarPlan(request);
                    return Ok(plan);
                }

                if (action == "recepcion.bobinas.muestrear")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    var lista = new List<BobinaMuestreadaRequest>();
                    if (jsonData.TryGetProperty("bobinas", out var arr) && arr.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var b in arr.EnumerateArray())
                        {
                            lista.Add(
                                new BobinaMuestreadaRequest
                                {
                                    NumeroBobina = GetString(b, "numeroBobina"),
                                    SeleccionTipo = string.IsNullOrWhiteSpace(GetString(b, "seleccionTipo"))
                                        ? "Manual"
                                        : GetString(b, "seleccionTipo"),
                                    CriterioManual = GetString(b, "criterioManual"),
                                }
                            );
                        }
                    }

                    if (loteId <= 0 || lista.Count == 0)
                        return Error("Falta el lote o la lista de bobinas muestreadas");

                    var usuario = _session.GetCurrentUser();
                    await _repository.MuestrearBobinas(loteId, lista, usuario?.NombreCompleto);
                    return Ok(new { muestreadas = lista.Count });
                }

                if (action == "recepcion.muestra.crear")
                {
                    var empresaMuestra = GetEmpresaOrDefault(jsonData);
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    if (loteId <= 0)
                        return Error("Falta indicar el lote");

                    var usuario = _session.GetCurrentUser();
                    var muestraId = await _repository.CrearMuestraLaboratorio(loteId, usuario?.Id, usuario?.NombreCompleto, empresaMuestra);
                    return Ok(new { muestraLaboratorioId = muestraId });
                }

                if (action == "recepcion.estado.actualizar")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    var estado = GetString(jsonData, "estado");
                    if (loteId <= 0 || string.IsNullOrWhiteSpace(estado))
                        return Error("Falta el lote o el estado");

                    await _repository.ActualizarEstado(loteId, estado);
                    return Ok(new { actualizado = true });
                }

                return Error($"Acción no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
        }

        private static List<RecepcionSapItemDto> ParseSapItems(string body)
        {
            var lista = new List<RecepcionSapItemDto>();
            using var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return lista;

            foreach (var row in data.EnumerateArray())
            {
                lista.Add(
                    new RecepcionSapItemDto
                    {
                        DocEntry = GetInt(row, "docEntry") ?? 0,
                        LineNum = GetInt(row, "lineNum") ?? 0,
                        FechaRecepcion = GetString(row, "fechaRecepcion"),
                        Proveedor = GetString(row, "proveedor"),
                        Guia = GetString(row, "guia"),
                        ItemCode = GetString(row, "itemCode"),
                        Descripcion = GetString(row, "descripcion"),
                        CantidadRecibida = GetDecimal(row, "cantidadRecibida") ?? 0,
                        AnchoDeclarado = GetDecimal(row, "anchoDeclarado"),
                        GramajeDeclarado = GetDecimal(row, "gramajeDeclarado"),
                    }
                );
            }
            return lista;
        }

        private static List<RecepcionSapLoteDto> ParseSapLotes(string body)
        {
            var lista = new List<RecepcionSapLoteDto>();
            using var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return lista;

            foreach (var row in data.EnumerateArray())
            {
                lista.Add(
                    new RecepcionSapLoteDto
                    {
                        ItemCode = GetString(row, "itemCode"),
                        NumeroBobina = GetString(row, "numeroBobina"),
                        AbsEntry = GetInt(row, "absEntry") ?? 0,
                        FechaCreacion = GetString(row, "fechaCreacion"),
                    }
                );
            }
            return lista;
        }

        private static string ExtraerMensaje(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("error", out var m) && m.ValueKind == JsonValueKind.String)
                    return m.GetString() ?? body;
                if (doc.RootElement.TryGetProperty("message", out var m2) && m2.ValueKind == JsonValueKind.String)
                    return m2.GetString() ?? body;
            }
            catch
            {
                // body no era JSON.
            }
            return body;
        }

        private static JsonElement GetDataElement(Dictionary<string, object> data)
        {
            if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                return jsonData;
            return default;
        }

        // "empresa" es opcional en el payload (el frontend INNPACK, anterior a la réplica Faret,
        // nunca lo envía) - default INNPACK, mismo criterio que el default en apisapfaret.
        private static string GetEmpresaOrDefault(JsonElement jsonData)
        {
            var empresa = GetString(jsonData, "empresa");
            return string.IsNullOrWhiteSpace(empresa) ? "INNPACK" : empresa;
        }

        private static string GetString(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return "";
            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? "",
                JsonValueKind.Number => value.ToString(),
                _ => "",
            };
        }

        private static int? GetInt(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var i))
                return i;
            if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed))
                return parsed;
            return null;
        }

        private static decimal? GetDecimal(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var d))
                return d;
            if (value.ValueKind == JsonValueKind.String && decimal.TryParse(value.GetString(), out var parsed))
                return parsed;
            return null;
        }

        private static string Ok(object? data)
        {
            return JsonSerializer.Serialize(new { ok = true, data, error = (string?)null }, _jsonOptions);
        }

        private static string Error(string message)
        {
            return JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = message }, _jsonOptions);
        }
    }
}
