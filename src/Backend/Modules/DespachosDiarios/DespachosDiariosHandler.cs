using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.DespachosDiarios
{
    // Despachos Diarios — solo lectura, INNPACK y Faret (dato 100% compartido, mismo patrón que
    // Certificados de Liberación y Formularios): la cantidad liberada sale del Certificado de
    // Terminaciones y Calidad del Producto (Faret_Control_Calidad), alcanzado vía
    // QualityControlInnpack.Api → fps-api. Este desktop nunca conecta SQL Server directo.
    public class DespachosDiariosHandler
    {
        private readonly InnpackCertificadosLiberacionApiService _api;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public DespachosDiariosHandler(InnpackApiClient client)
        {
            _api = new InnpackCertificadosLiberacionApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "despachosDiarios.resumen")
                {
                    var jsonData = GetDataElement(data);
                    var fechaDesde = GetString(jsonData, "fechaDesde");
                    var fechaHasta = GetString(jsonData, "fechaHasta");

                    return await Forward(_api.ObtenerDespachosAsync(fechaDesde, fechaHasta));
                }

                return Error($"Accion no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
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

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var responseData =
                payload.ValueKind == JsonValueKind.Undefined
                    ? null
                    : JsonSerializer.Deserialize<object>(payload.GetRawText());
            return Ok(responseData);
        }

        // Desenvuelve el shape ApiResponse<T> {success,message,data,errors} de
        // QualityControlInnpack.Api — mismo criterio ya usado en CertificadosLiberacionHandler.cs.
        private static bool TryUnwrapApiResponse(
            string body,
            out JsonElement data,
            out string error
        )
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
                        error = root.TryGetProperty("message", out var m)
                            ? (m.GetString() ?? error)
                            : error;
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
