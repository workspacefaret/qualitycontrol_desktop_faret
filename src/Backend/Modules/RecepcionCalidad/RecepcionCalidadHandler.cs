using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.SapRecepcionApi;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.RecepcionCalidad
{
    // Modulo "Control de Recepcion - Calidad" (solo INNPACK). La parte MySQL migró a
    // QualityControlInnpack.Api ("api/recepcion-calidad/*", RecepcionCalidadRepository.cs de este
    // módulo queda sin uso) — la consulta a SAP (via apisapfaret) sigue siendo un passthrough HTTP
    // de solo lectura acá mismo, sin cambios (mismo criterio que Planificación/FPS Materiales en
    // Trazabilidad, Paso 4). Módulo híbrido real INNPACK+FARET: "empresa" viaja explícito en cada
    // acción que lo necesita. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class RecepcionCalidadHandler
    {
        private readonly InnpackRecepcionCalidadApiService _api;
        private readonly SapRecepcionApiClient _sapClient;
        private readonly CurrentUserSessionService _session;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public RecepcionCalidadHandler(InnpackApiClient client, SapRecepcionApiClient sapClient, CurrentUserSessionService session)
        {
            _api = new InnpackRecepcionCalidadApiService(client);
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
                        return Error(ExtraerMensajeSap(body));

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
                        return Error(ExtraerMensajeSap(body));

                    var items = ParseSapLotes(body);
                    return Ok(items);
                }

                if (action == "recepcion.crear")
                {
                    var usuario = _session.GetCurrentUser();
                    var bobinas = new List<string>();
                    if (jsonData.TryGetProperty("bobinas", out var bobinasEl) && bobinasEl.ValueKind == JsonValueKind.Array)
                        bobinas = bobinasEl.EnumerateArray().Select(b => b.GetString() ?? "").Where(s => s != "").ToList();

                    var request = new
                    {
                        TipoMateriaPrima = GetString(jsonData, "tipoMateriaPrima"),
                        Empresa = GetEmpresaOrDefault(jsonData),
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
                        UsuarioNombre = usuario?.NombreCompleto,
                    };

                    return await Forward(_api.CrearLoteAsync(request));
                }

                if (action == "recepcion.foto.abrir")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    var tipo = GetString(jsonData, "tipoMateriaPrima");
                    if (loteId <= 0 || string.IsNullOrWhiteSpace(tipo))
                        return Error("Falta el lote o el tipo de materia prima");

                    return await Forward(_api.FotoAsync(loteId, tipo));
                }

                if (action == "recepcion.nc.crear")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    if (loteId <= 0)
                        return Error("Falta indicar el lote");

                    var usuario = _session.GetCurrentUser();
                    return await Forward(_api.CrearNoConformidadAsync(loteId, usuario?.NombreCompleto));
                }

                if (action == "recepcion.list")
                {
                    var empresaList = GetEmpresaOrDefault(jsonData);
                    var estado = GetString(jsonData, "estado");
                    var tipo = GetString(jsonData, "tipoMateriaPrima");
                    return await Forward(
                        _api.ListAsync(string.IsNullOrWhiteSpace(estado) ? null : estado, string.IsNullOrWhiteSpace(tipo) ? null : tipo, empresaList)
                    );
                }

                if (action == "recepcion.detalle")
                {
                    var empresaDetalle = GetEmpresaOrDefault(jsonData);
                    var id = GetInt(jsonData, "id") ?? 0;
                    return await Forward(_api.DetalleAsync(id, empresaDetalle));
                }

                if (action == "recepcion.plan.generar")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    if (loteId <= 0)
                        return Error("Falta indicar el lote");

                    var nivelInspeccion = GetString(jsonData, "nivelInspeccion");
                    var aql = GetDecimal(jsonData, "aql") ?? 2.5m;

                    return await Forward(_api.GenerarPlanAsync(loteId, string.IsNullOrWhiteSpace(nivelInspeccion) ? "II" : nivelInspeccion, aql));
                }

                if (action == "recepcion.bobinas.muestrear")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    var lista = new List<object>();
                    if (jsonData.TryGetProperty("bobinas", out var arr) && arr.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var b in arr.EnumerateArray())
                        {
                            var seleccionTipo = GetString(b, "seleccionTipo");
                            lista.Add(
                                new
                                {
                                    NumeroBobina = GetString(b, "numeroBobina"),
                                    SeleccionTipo = string.IsNullOrWhiteSpace(seleccionTipo) ? "Manual" : seleccionTipo,
                                    CriterioManual = GetString(b, "criterioManual"),
                                }
                            );
                        }
                    }

                    if (loteId <= 0 || lista.Count == 0)
                        return Error("Falta el lote o la lista de bobinas muestreadas");

                    var usuario = _session.GetCurrentUser();
                    var request = new { Bobinas = lista, Usuario = usuario?.NombreCompleto };
                    return await Forward(_api.MuestrearBobinasAsync(loteId, request));
                }

                if (action == "recepcion.muestra.crear")
                {
                    var empresaMuestra = GetEmpresaOrDefault(jsonData);
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    if (loteId <= 0)
                        return Error("Falta indicar el lote");

                    var usuario = _session.GetCurrentUser();
                    var request = new
                    {
                        Empresa = empresaMuestra,
                        UsuarioId = usuario?.Id,
                        UsuarioNombre = usuario?.NombreCompleto,
                    };
                    return await Forward(_api.CrearMuestraLaboratorioAsync(loteId, request));
                }

                if (action == "recepcion.estado.actualizar")
                {
                    var loteId = GetInt(jsonData, "loteId") ?? 0;
                    var estado = GetString(jsonData, "estado");
                    if (loteId <= 0 || string.IsNullOrWhiteSpace(estado))
                        return Error("Falta el lote o el estado");

                    return await Forward(_api.ActualizarEstadoAsync(loteId, estado));
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

        private static string ExtraerMensajeSap(string body)
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

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var responseData = payload.ValueKind == JsonValueKind.Undefined ? null : JsonSerializer.Deserialize<object>(payload.GetRawText());
            return Ok(responseData);
        }

        // Desenvuelve el shape ApiResponse<T> {success,message,data,errors} de
        // QualityControlInnpack.Api — mismo criterio ya usado en UsuariosHandler.cs/TalleresExternosHandler.cs.
        private static bool TryUnwrapApiResponse(string body, out JsonElement data, out string error)
        {
            data = default;
            error = "Error al comunicarse con la API Innpack";

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (root.TryGetProperty("success", out var s))
                {
                    if (!s.GetBoolean())
                    {
                        error = root.TryGetProperty("message", out var m) ? (m.GetString() ?? error) : error;
                        return false;
                    }

                    if (root.TryGetProperty("data", out var d))
                    {
                        data = d.Clone();
                        return true;
                    }

                    return true;
                }

                return false;
            }
            catch
            {
                return false;
            }
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
