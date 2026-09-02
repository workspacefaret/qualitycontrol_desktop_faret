using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.ProductoTerminado
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (ProductoTerminadoRepository.cs de este módulo queda sin uso). Módulo híbrido real
    // INNPACK+FARET: "empresa" sigue siendo obligatorio en cada acción, validado acá igual que
    // antes (mismo mensaje de error) antes de reenviar a la API. Ver contex.md sobre la migración
    // de INNPACK a arquitectura API.
    public class ProductoTerminadoHandler
    {
        private readonly InnpackProductoTerminadoApiService _api;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public ProductoTerminadoHandler(InnpackApiClient client)
        {
            _api = new InnpackProductoTerminadoApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                var jsonDataRaiz = GetDataElement(data);
                var empresa = GetString(jsonDataRaiz, "empresa");

                if (empresa != "INNPACK" && empresa != "FARET")
                    return Error("Falta indicar la empresa (INNPACK o FARET)");

                if (action == "productoTerminado.filtros")
                    return await Forward(_api.FiltrosAsync(empresa));

                if (action == "productoTerminado.resumen")
                    return await Forward(_api.ResumenAsync(empresa, BuildFiltroQuery(jsonDataRaiz)));

                if (action == "productoTerminado.list")
                {
                    var page = GetInt(jsonDataRaiz, "page") ?? 1;
                    var limit = GetInt(jsonDataRaiz, "limit") ?? 50;
                    return await Forward(_api.ListAsync(empresa, BuildFiltroQuery(jsonDataRaiz), page, limit));
                }

                if (action == "productoTerminado.detalle")
                {
                    var id = GetInt(jsonDataRaiz, "id") ?? 0;
                    if (id <= 0)
                        return Error("Falta el id de la inspección");

                    return await Forward(_api.DetalleAsync(id, empresa));
                }

                if (action == "productoTerminado.exportarDetalle")
                    return await Forward(_api.ExportarDetalleAsync(empresa, BuildFiltroQuery(jsonDataRaiz)));

                if (action == "productoTerminado.eliminar")
                {
                    var id = GetInt(jsonDataRaiz, "id") ?? 0;
                    if (id <= 0)
                        return Error("Falta el id de la inspección");

                    return await Forward(_api.EliminarAsync(id, empresa));
                }

                return Error($"Acción productoTerminado no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private static InnpackProductoTerminadoApiService.FiltroQueryParts BuildFiltroQuery(JsonElement jsonData)
        {
            return new InnpackProductoTerminadoApiService.FiltroQueryParts
            {
                FechaDesde = GetString(jsonData, "fechaDesde"),
                FechaHasta = GetString(jsonData, "fechaHasta"),
                Np = GetString(jsonData, "np"),
                CodigoProducto = GetString(jsonData, "codigoProducto"),
                Proceso = GetString(jsonData, "proceso"),
                Maquina = GetString(jsonData, "maquina"),
                Turno = GetString(jsonData, "turno"),
                InspectorId = GetInt(jsonData, "inspectorId"),
                Resultado = GetString(jsonData, "resultado"),
                OrigenId = GetInt(jsonData, "origenId"),
            };
        }

        private static JsonElement GetDataElement(Dictionary<string, object> data)
        {
            if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                return jsonData;

            return default;
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
            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data,
                    error = (string?)null,
                },
                _jsonOptions
            );
        }

        private static string Error(string message)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    data = (object?)null,
                    error = message,
                },
                _jsonOptions
            );
        }
    }
}
