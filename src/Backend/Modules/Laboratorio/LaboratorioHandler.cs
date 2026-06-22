using System.Text.Json;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Laboratorio
{
    public class LaboratorioHandler
    {
        private readonly LaboratorioService _service;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public LaboratorioHandler(DbService db)
        {
            _service = new LaboratorioService(db);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> payload)
        {
            try
            {
                if (action == "laboratorio.obtenerResumen")
                {
                    var data = GetData(payload);

                    var fechaDesde = GetString(data, "fechaDesde") ?? "";
                    var fechaHasta = GetString(data, "fechaHasta") ?? "";
                    var ensayo = GetString(data, "ensayo") ?? "";
                    var material = GetString(data, "material") ?? "";

                    var result = await _service.ObtenerResumen(
                        fechaDesde,
                        fechaHasta,
                        ensayo,
                        material
                    );

                    return Ok(result);
                }

                return Error($"Acción laboratorio no reconocida: {action}");
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

        private static string Ok(object data)
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
