using System.Text.Json;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.RegistrosControl
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (RegistrosControlService.cs/RegistrosControlRepository.cs/RegistroControlItem.cs de este
    // mismo módulo quedan sin uso). Sin bug de casing: el Handler viejo ya serializaba en
    // camelCase (JsonNamingPolicy.CamelCase) y la API nueva también es camelCase por defecto. Ver
    // contex.md sobre la migración de INNPACK a arquitectura API.
    public class RegistrosControlHandler
    {
        private readonly InnpackRegistrosControlApiService _api;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public RegistrosControlHandler(InnpackApiClient client)
        {
            _api = new InnpackRegistrosControlApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> payload)
        {
            try
            {
                if (action == "registrosControl.obtenerRegistros")
                {
                    var data = GetData(payload);

                    var page = GetInt(data, "page", 1);
                    var limit = GetInt(data, "limit", 20);
                    var fechaDesde = GetString(data, "fechaDesde");
                    var fechaHasta = GetString(data, "fechaHasta");
                    var np = GetString(data, "np");
                    var turno = GetString(data, "turno");
                    var estado = GetString(data, "estado");
                    var idStr = GetString(data, "id");
                    int? id = int.TryParse(idStr, out var parsedId) ? parsedId : null;
                    var procesoId = GetIntOrNull(data, "procesoId");
                    var parametroId = GetIntOrNull(data, "parametroId");

                    return await Forward(
                        _api.ObtenerRegistrosAsync(
                            page,
                            limit,
                            fechaDesde,
                            fechaHasta,
                            np,
                            turno,
                            estado,
                            id,
                            procesoId,
                            parametroId
                        )
                    );
                }

                if (action == "registrosControl.validarRegistro")
                {
                    var id = GetIntFromPayload(payload, "id", 0);
                    return await Forward(_api.ValidarRegistroAsync(id));
                }

                if (action == "registrosControl.rechazarRegistro")
                {
                    var id = GetIntFromPayload(payload, "id", 0);
                    return await Forward(_api.RechazarRegistroAsync(id));
                }

                if (action == "registrosControl.eliminarRegistro")
                {
                    var id = GetIntFromPayload(payload, "id", 0);
                    return await Forward(_api.EliminarRegistroAsync(id));
                }

                return Error($"Acción no reconocida en RegistrosControl: {action}");
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var data =
                payload.ValueKind == JsonValueKind.Undefined
                    ? null
                    : JsonSerializer.Deserialize<object>(payload.GetRawText());

            return Ok(data);
        }

        // Desenvuelve el shape ApiResponse<T> {success,message,data,errors} de
        // QualityControlInnpack.Api — mismo criterio ya usado en UsuariosHandler.cs.
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

        private static JsonElement GetData(Dictionary<string, object> payload)
        {
            if (!payload.ContainsKey("data"))
                return default;

            if (payload["data"] is JsonElement element)
                return element;

            return default;
        }

        private static string? GetString(JsonElement data, string prop)
        {
            if (data.ValueKind != JsonValueKind.Object)
                return null;

            if (!data.TryGetProperty(prop, out var value))
                return null;

            return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
        }

        private static int GetInt(JsonElement data, string prop, int defaultValue)
        {
            if (data.ValueKind != JsonValueKind.Object)
                return defaultValue;

            if (!data.TryGetProperty(prop, out var value))
                return defaultValue;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
                return number;

            if (int.TryParse(value.ToString(), out var parsed))
                return parsed;

            return defaultValue;
        }

        private static int? GetIntOrNull(JsonElement data, string prop)
        {
            if (data.ValueKind != JsonValueKind.Object)
                return null;

            if (!data.TryGetProperty(prop, out var value))
                return null;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
                return number;

            if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed))
                return parsed;

            return null;
        }

        private static int GetIntFromPayload(Dictionary<string, object> payload, string prop, int defaultValue)
        {
            if (!payload.TryGetValue(prop, out var rawValue))
                return defaultValue;

            if (rawValue is JsonElement jsonValue)
            {
                if (jsonValue.ValueKind == JsonValueKind.Number && jsonValue.TryGetInt32(out var number))
                    return number;

                if (int.TryParse(jsonValue.ToString(), out var parsed))
                    return parsed;

                return defaultValue;
            }

            if (int.TryParse(rawValue?.ToString(), out var value))
                return value;

            return defaultValue;
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
