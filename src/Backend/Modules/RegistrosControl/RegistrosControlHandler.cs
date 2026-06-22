using System.Text.Json;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.RegistrosControl
{
    public class RegistrosControlHandler
    {
        private readonly RegistrosControlService _service;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public RegistrosControlHandler(DbService db)
        {
            _service = new RegistrosControlService(db);
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

                    var result = await _service.ObtenerRegistros(
                        page,
                        limit,
                        fechaDesde,
                        fechaHasta,
                        np,
                        turno,
                        estado
                    );

                    return Ok(result);
                }

                if (action == "registrosControl.validarRegistro")
                {
                    var id = GetIntFromPayload(payload, "id", 0);

                    await _service.ValidarRegistro(id);

                    return Ok((object?)null);
                }

                if (action == "registrosControl.rechazarRegistro")
                {
                    var id = GetIntFromPayload(payload, "id", 0);

                    await _service.RechazarRegistro(id);

                    return Ok((object?)null);
                }

                return Error($"Acción no reconocida en RegistrosControl: {action}");
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
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

        private static int GetIntFromPayload(
            Dictionary<string, object> payload,
            string prop,
            int defaultValue
        )
        {
            if (!payload.TryGetValue(prop, out var rawValue))
                return defaultValue;

            if (rawValue is JsonElement jsonValue)
            {
                if (
                    jsonValue.ValueKind == JsonValueKind.Number
                    && jsonValue.TryGetInt32(out var number)
                )
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
