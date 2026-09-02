using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.MaquinasSeguimiento
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (MaquinasSeguimientoRepository.cs de este mismo módulo queda sin uso). Sin bug de casing:
    // el Handler viejo ya serializaba en camelCase (JsonNamingPolicy.CamelCase) y la API nueva
    // también es camelCase por defecto, así que el passthrough es directo. Ver contex.md sobre la
    // migración de INNPACK a arquitectura API.
    public class MaquinasSeguimientoHandler
    {
        private readonly InnpackMaquinasSeguimientoApiService _api;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public MaquinasSeguimientoHandler(InnpackApiClient client)
        {
            _api = new InnpackMaquinasSeguimientoApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "maquinasSeguimiento.obtenerResumen")
                {
                    int? maquinaId = null;
                    var sinLimite = false;

                    if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                    {
                        if (jsonData.TryGetProperty("maquinaId", out var maquinaIdProp))
                        {
                            if (maquinaIdProp.ValueKind == JsonValueKind.Number)
                            {
                                maquinaId = maquinaIdProp.GetInt32();
                            }
                            else if (maquinaIdProp.ValueKind == JsonValueKind.String)
                            {
                                var value = maquinaIdProp.GetString();

                                if (int.TryParse(value, out var parsed))
                                {
                                    maquinaId = parsed;
                                }
                            }
                        }

                        if (jsonData.TryGetProperty("sinLimite", out var sinLimiteProp))
                        {
                            if (sinLimiteProp.ValueKind == JsonValueKind.True)
                            {
                                sinLimite = true;
                            }
                            else if (sinLimiteProp.ValueKind == JsonValueKind.String)
                            {
                                sinLimite =
                                    bool.TryParse(sinLimiteProp.GetString(), out var parsedBool)
                                    && parsedBool;
                            }
                        }
                    }

                    var (ok, body) = await _api.ObtenerResumenAsync(maquinaId, sinLimite);
                    if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                    {
                        return JsonSerializer.Serialize(new { ok = false, error }, _jsonOptions);
                    }

                    return JsonSerializer.Serialize(
                        new { ok = true, data = JsonSerializer.Deserialize<object>(payload.GetRawText()) },
                        _jsonOptions
                    );
                }

                return JsonSerializer.Serialize(
                    new { ok = false, error = $"Acción máquinas seguimiento no reconocida: {action}" },
                    _jsonOptions
                );
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { ok = false, error = ex.Message }, _jsonOptions);
            }
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
