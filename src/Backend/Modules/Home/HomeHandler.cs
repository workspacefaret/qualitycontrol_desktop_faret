using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.Home
{
    // Migrado a QualityControlInnpack.Api (Paso 15 de la migración, último que agrega de casi
    // todos los demás módulos) — ya no consulta MySQL directo desde el desktop (HomeService.cs de
    // este módulo queda sin uso). Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class HomeHandler
    {
        private readonly InnpackHomeApiService _api;

        public HomeHandler(InnpackApiClient client)
        {
            _api = new InnpackHomeApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object>? data)
        {
            try
            {
                Console.WriteLine($"📥 ACTION HOME: {action}");

                switch (action)
                {
                    case "inicio.getDashboard":
                        return await ObtenerDashboard();

                    case "inicio.frecuencias.actualizar":
                        return await ActualizarFrecuencia(data);

                    default:
                        return Error($"Acción no reconocida: {action}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ ERROR HOME: {ex}");

                return Error(ex.Message);
            }
        }

        private async Task<string> ObtenerDashboard() => await Forward(_api.DashboardAsync());

        private async Task<string> ActualizarFrecuencia(Dictionary<string, object>? payload)
        {
            var data = GetData(payload);
            var id = GetInt(data, "id", 0);
            var minutos = GetInt(data, "frecuenciaMinutos", 0);

            if (id <= 0 || minutos <= 0)
                return Error("Parámetros inválidos para actualizar la frecuencia.");

            return await Forward(_api.ActualizarFrecuenciaAsync(id, minutos));
        }

        private static JsonElement GetData(Dictionary<string, object>? payload)
        {
            if (payload == null || !payload.ContainsKey("data"))
                return default;

            return payload["data"] is JsonElement element ? element : default;
        }

        private static int GetInt(JsonElement data, string prop, int defaultValue)
        {
            if (data.ValueKind != JsonValueKind.Object)
                return defaultValue;

            if (!data.TryGetProperty(prop, out var value))
                return defaultValue;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
                return number;

            return int.TryParse(value.ToString(), out var parsed) ? parsed : defaultValue;
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

        private static string Ok(object? data)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data,
                    error = (string?)null,
                }
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
                }
            );
        }
    }
}
