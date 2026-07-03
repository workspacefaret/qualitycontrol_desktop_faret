using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Mermas
{
    public class MermasHandler
    {
        private readonly MermasRepository _repository;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public MermasHandler(DbService db)
        {
            _repository = new MermasRepository(db);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "mermas.obtenerFiltros")
                {
                    var filtros = await _repository.ObtenerFiltros();
                    return JsonSerializer.Serialize(new { ok = true, data = filtros }, _jsonOptions);
                }

                if (action == "mermas.obtenerResumen")
                {
                    JsonElement jsonData = default;
                    var hayData =
                        data.TryGetValue("data", out var rawData) && rawData is JsonElement element;

                    if (hayData)
                    {
                        jsonData = (JsonElement)rawData!;
                    }

                    var resumen = await _repository.ObtenerResumen(
                        GetString(jsonData, hayData, "fechaDesde"),
                        GetString(jsonData, hayData, "fechaHasta"),
                        GetInt(jsonData, hayData, "materialId"),
                        GetInt(jsonData, hayData, "procesoId"),
                        GetInt(jsonData, hayData, "maquinaId"),
                        GetString(jsonData, hayData, "turno"),
                        GetString(jsonData, hayData, "busqueda"),
                        GetBool(jsonData, hayData, "sinLimite")
                    );

                    return JsonSerializer.Serialize(new { ok = true, data = resumen }, _jsonOptions);
                }

                return JsonSerializer.Serialize(
                    new { ok = false, error = $"Acción de mermas no reconocida: {action}" },
                    _jsonOptions
                );
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { ok = false, error = ex.Message }, _jsonOptions);
            }
        }

        private static string GetString(JsonElement data, bool hayData, string prop)
        {
            if (!hayData || !data.TryGetProperty(prop, out var value))
                return "";

            return value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
        }

        private static int? GetInt(JsonElement data, bool hayData, string prop)
        {
            if (!hayData || !data.TryGetProperty(prop, out var value))
                return null;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
                return number;

            if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed))
                return parsed;

            return null;
        }

        private static bool GetBool(JsonElement data, bool hayData, string prop)
        {
            if (!hayData || !data.TryGetProperty(prop, out var value))
                return false;

            return value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String => bool.TryParse(value.GetString(), out var parsed) && parsed,
                _ => false,
            };
        }
    }
}
