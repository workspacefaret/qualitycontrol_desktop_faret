using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.Dashboard
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (DashboardRepository.cs y DashboardModels.cs de este mismo módulo quedan sin uso). Sin bug
    // de casing: el Handler viejo ya serializaba en camelCase (JsonNamingPolicy.CamelCase) y la
    // API nueva también es camelCase por defecto. Ver contex.md sobre la migración de INNPACK a
    // arquitectura API.
    public class DashboardHandler
    {
        private readonly InnpackDashboardApiService _api;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public DashboardHandler(InnpackApiClient client)
        {
            _api = new InnpackDashboardApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "dashboard.obtenerFiltros")
                {
                    return await Forward(_api.ObtenerFiltrosAsync());
                }

                if (action == "dashboard.validarRegistro")
                {
                    return await Forward(_api.ValidarRegistroAsync(GetId(data)));
                }

                if (action == "dashboard.rechazarRegistro")
                {
                    return await Forward(_api.RechazarRegistroAsync(GetId(data)));
                }

                if (action == "dashboard.eliminarRegistro")
                {
                    return await Forward(_api.EliminarRegistroAsync(GetId(data)));
                }

                if (action == "dashboard.validarTodo")
                {
                    return await Forward(_api.ValidarTodoAsync());
                }

                if (action == "dashboard.rechazarTodo")
                {
                    return await Forward(_api.RechazarTodoAsync());
                }

                if (action == "dashboard.obtenerResumen")
                {
                    var fechaDesde = "";
                    var fechaHasta = "";
                    var inspector = "";
                    var turno = "";
                    var proceso = "";

                    if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                    {
                        if (jsonData.TryGetProperty("fechaDesde", out var desdeProp))
                            fechaDesde = desdeProp.GetString() ?? "";

                        if (jsonData.TryGetProperty("fechaHasta", out var hastaProp))
                            fechaHasta = hastaProp.GetString() ?? "";

                        if (jsonData.TryGetProperty("inspector", out var inspectorProp))
                            inspector = inspectorProp.GetString() ?? "";

                        if (jsonData.TryGetProperty("turno", out var turnoProp))
                            turno = turnoProp.GetString() ?? "";

                        if (jsonData.TryGetProperty("proceso", out var procesoProp))
                            proceso = procesoProp.GetString() ?? "";
                    }

                    return await Forward(_api.ObtenerResumenAsync(fechaDesde, fechaHasta, inspector, turno, proceso));
                }

                return JsonSerializer.Serialize(
                    new { ok = false, data = (object?)null, error = $"Acción dashboard no reconocida: {action}" },
                    _jsonOptions
                );
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = ex.Message }, _jsonOptions);
            }
        }

        private static int GetId(Dictionary<string, object> data)
        {
            if (data.TryGetValue("id", out var rawId) && int.TryParse(rawId?.ToString(), out var parsedId))
                return parsedId;

            return 0;
        }

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
            {
                return JsonSerializer.Serialize(
                    new { ok = false, data = (object?)null, error },
                    _jsonOptions
                );
            }

            var data =
                payload.ValueKind == JsonValueKind.Undefined
                    ? null
                    : JsonSerializer.Deserialize<object>(payload.GetRawText());

            return JsonSerializer.Serialize(new { ok = true, data, error = (string?)null }, _jsonOptions);
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
    }
}
