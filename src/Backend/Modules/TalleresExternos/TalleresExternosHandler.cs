using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.TalleresExternos
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (TalleresExternosService.cs/TalleresExternosRepository.cs/TalleresExternosModels.cs de este
    // mismo módulo quedan sin uso, junto con FpsLiberacionesApiService que ahora vive server-side
    // en la API). Conflicto de concurrencia optimista (409) y "no encontrado" (404) se distinguen
    // por status HTTP real, no por texto de mensaje — ver InnpackApiClient.PutJsonWithStatusAsync/
    // DeleteWithStatusAsync. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class TalleresExternosHandler
    {
        private readonly InnpackTalleresExternosApiService _api;
        private readonly CurrentUserSessionService _session;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public TalleresExternosHandler(InnpackApiClient client, CurrentUserSessionService session)
        {
            _api = new InnpackTalleresExternosApiService(client);
            _session = session;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> payload)
        {
            try
            {
                var data = GetData(payload);

                switch (action)
                {
                    case "talleresExternos.list":
                    {
                        var page = GetInt(data, "page", 1);
                        var pageSize = GetInt(data, "pageSize", 50);
                        return await Forward(_api.ListAsync(page, pageSize));
                    }

                    case "talleresExternos.catalogos":
                        return await Forward(_api.CatalogosAsync());

                    case "talleresExternos.create":
                    {
                        var request = BuildRequestPayload(data, UsuarioIdActual());
                        return await Forward(_api.CrearAsync(request));
                    }

                    case "talleresExternos.update":
                    {
                        var id = GetLong(data, "id", 0);
                        if (id <= 0)
                            return Error("Falta 'id' para actualizar.");

                        var version = GetInt(data, "version", 0);
                        var request = BuildRequestPayload(data, UsuarioIdActual(), version);

                        var (status, body) = await _api.ActualizarAsync(id, request);
                        return ForwardWithStatus(status, body);
                    }

                    case "talleresExternos.eliminar":
                    {
                        var id = GetLong(data, "id", 0);
                        var version = GetInt(data, "version", 0);
                        if (id <= 0)
                            return Error("Falta 'id' para eliminar.");

                        var (status, body) = await _api.EliminarAsync(id, version, UsuarioIdActual());
                        return ForwardWithStatus(status, body);
                    }

                    case "talleresExternos.catalogos.eliminarTaller":
                    {
                        var id = GetInt(data, "id", 0);
                        return await Forward(_api.EliminarTallerAsync(id));
                    }

                    case "talleresExternos.catalogos.eliminarProceso":
                    {
                        var id = GetInt(data, "id", 0);
                        return await Forward(_api.EliminarProcesoAsync(id));
                    }

                    case "talleresExternos.historialLiberaciones":
                    {
                        var id = GetLong(data, "id", 0);
                        if (id <= 0)
                            return Error("Falta 'id' para consultar el historial.");

                        return await Forward(_api.HistorialLiberacionesAsync(id));
                    }

                    case "talleresExternos.sincronizarFps":
                        return await Forward(_api.SincronizarFpsAsync(UsuarioIdActual()));

                    default:
                        return Error($"Acción no reconocida en TalleresExternos: {action}");
                }
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        // Puede ser null: el "Recordar usuario" de INNPACK restaura la sesión solo en el frontend
        // (sessionStorage) sin volver a autenticar contra el backend, así que CurrentUserSessionService
        // puede no tener un usuario cargado aunque la UI muestre la sesión activa. creado_por/
        // actualizado_por/anulado_por son columnas nullable justamente para este caso.
        private int? UsuarioIdActual() => _session.GetCurrentUser()?.Id;

        private static object BuildRequestPayload(JsonElement data, int? usuarioId, int? version = null)
        {
            return new
            {
                Nv = GetString(data, "nv") ?? "",
                Producto = GetString(data, "producto") ?? "",
                CodigoProducto = GetString(data, "codigoProducto"),
                Item = GetString(data, "item") ?? "",
                Cliente = GetString(data, "cliente"),
                FechaAsignacion = GetDate(data, "fechaAsignacion"),
                TallerExternoNombre = GetString(data, "tallerExternoNombre"),
                ProcesoNombre = GetString(data, "procesoNombre"),
                ResponsableInternoNombre = GetString(data, "responsableInternoNombre"),
                Prioridad = GetString(data, "prioridad") ?? "MEDIA",
                FechaCompromiso = GetDate(data, "fechaCompromiso"),
                Estado = GetString(data, "estado") ?? "PENDIENTE_ASIGNACION",
                CantidadARevisar = GetDecimal(data, "cantidadARevisar") ?? 0,
                CantidadRevisadaEntregada = GetDecimal(data, "cantidadRevisadaEntregada") ?? 0,
                CantidadFaltanteAjusteManual = GetBool(data, "cantidadFaltanteAjusteManual"),
                CantidadFaltanteManual = GetDecimal(data, "cantidadFaltanteManual"),
                CantidadFaltanteJustificacion = GetString(data, "cantidadFaltanteJustificacion"),
                Observaciones = GetString(data, "observaciones"),
                UsuarioId = usuarioId,
                Version = version ?? 0,
            };
        }

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var data = payload.ValueKind == JsonValueKind.Undefined ? null : JsonSerializer.Deserialize<object>(payload.GetRawText());
            return Ok(data);
        }

        private static string ForwardWithStatus(int status, string body)
        {
            if (status == 409)
            {
                TryUnwrapApiResponse(body, out _, out var conflictError);
                return ErrorConflicto(conflictError);
            }

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || status < 200 || status >= 300)
                return Error(error);

            var data = payload.ValueKind == JsonValueKind.Undefined ? null : JsonSerializer.Deserialize<object>(payload.GetRawText());
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

            if (!data.TryGetProperty(prop, out var value) || value.ValueKind == JsonValueKind.Null)
                return null;

            return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
        }

        private static DateTime? GetDate(JsonElement data, string prop)
        {
            var raw = GetString(data, prop);
            return DateTime.TryParse(raw, out var parsed) ? parsed : null;
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

        private static long GetLong(JsonElement data, string prop, long defaultValue)
        {
            if (data.ValueKind != JsonValueKind.Object)
                return defaultValue;

            if (!data.TryGetProperty(prop, out var value))
                return defaultValue;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number))
                return number;

            if (long.TryParse(value.ToString(), out var parsed))
                return parsed;

            return defaultValue;
        }

        private static decimal? GetDecimal(JsonElement data, string prop)
        {
            if (data.ValueKind != JsonValueKind.Object)
                return null;

            if (!data.TryGetProperty(prop, out var value) || value.ValueKind == JsonValueKind.Null)
                return null;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
                return number;

            if (value.ValueKind == JsonValueKind.String)
            {
                var text = value.GetString();
                if (!string.IsNullOrWhiteSpace(text) && decimal.TryParse(text, out var parsed))
                    return parsed;
            }

            return null;
        }

        private static bool GetBool(JsonElement data, string prop)
        {
            if (data.ValueKind != JsonValueKind.Object)
                return false;

            if (!data.TryGetProperty(prop, out var value))
                return false;

            return value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String => bool.TryParse(value.GetString(), out var parsed) && parsed,
                _ => false,
            };
        }

        private static string Ok(object? data)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data,
                    error = (string?)null,
                    conflict = false,
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
                    conflict = false,
                },
                _jsonOptions
            );
        }

        private static string ErrorConflicto(string message)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    data = (object?)null,
                    error = message,
                    conflict = true,
                },
                _jsonOptions
            );
        }
    }
}
