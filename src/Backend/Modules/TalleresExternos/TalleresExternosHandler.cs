using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.TalleresExternos
{
    public class TalleresExternosHandler
    {
        private readonly TalleresExternosService _service;
        private readonly CurrentUserSessionService _session;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public TalleresExternosHandler(
            DbService db,
            CurrentUserSessionService session,
            FpsLiberacionesApiService? fpsLiberaciones = null
        )
        {
            _service = new TalleresExternosService(db, fpsLiberaciones);
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
                        var result = await _service.GetListAsync(page, pageSize);
                        return Ok(result);
                    }

                    case "talleresExternos.catalogos":
                    {
                        var result = await _service.GetCatalogosAsync();
                        return Ok(result);
                    }

                    case "talleresExternos.create":
                    {
                        var request = BuildCrearRequest(data);
                        var trabajo = await _service.CrearAsync(request, UsuarioIdActual());
                        return Ok(trabajo);
                    }

                    case "talleresExternos.update":
                    {
                        var id = GetLong(data, "id", 0);
                        if (id <= 0)
                            return Error("Falta 'id' para actualizar.");

                        var request = new ActualizarTrabajoRequest();
                        CopiarCamposComunes(data, request);
                        request.Version = GetInt(data, "version", 0);

                        var resultado = await _service.ActualizarAsync(
                            id,
                            request,
                            UsuarioIdActual()
                        );

                        if (resultado.NoEncontrado)
                            return Error(resultado.Error ?? $"No existe un trabajo con id {id}.");
                        if (resultado.Conflicto)
                            return ErrorConflicto(
                                resultado.Error ?? "El registro fue modificado por otro usuario."
                            );

                        return Ok(resultado.Trabajo);
                    }

                    case "talleresExternos.eliminar":
                    {
                        var id = GetLong(data, "id", 0);
                        var version = GetInt(data, "version", 0);
                        if (id <= 0)
                            return Error("Falta 'id' para eliminar.");

                        var resultado = await _service.EliminarAsync(
                            id,
                            version,
                            UsuarioIdActual()
                        );

                        if (resultado.NoEncontrado)
                            return Error($"No existe un trabajo con id {id}.");
                        if (resultado.Conflicto)
                            return ErrorConflicto(
                                resultado.Error ?? "El registro fue modificado por otro usuario."
                            );

                        return Ok((object?)null);
                    }

                    case "talleresExternos.catalogos.eliminarTaller":
                    {
                        var id = GetInt(data, "id", 0);
                        await _service.EliminarTallerAsync(id);
                        return Ok((object?)null);
                    }

                    case "talleresExternos.catalogos.eliminarProceso":
                    {
                        var id = GetInt(data, "id", 0);
                        await _service.EliminarProcesoAsync(id);
                        return Ok((object?)null);
                    }

                    case "talleresExternos.historialLiberaciones":
                    {
                        var id = GetLong(data, "id", 0);
                        if (id <= 0)
                            return Error("Falta 'id' para consultar el historial.");

                        var historial = await _service.ObtenerHistorialLiberacionesAsync(id);
                        return Ok(historial);
                    }

                    case "talleresExternos.sincronizarFps":
                    {
                        var resultado = await _service.SincronizarFpsAsync(UsuarioIdActual());
                        return Ok(resultado);
                    }

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

        private static CrearTrabajoRequest BuildCrearRequest(JsonElement data)
        {
            var request = new CrearTrabajoRequest();
            CopiarCamposComunes(data, request);
            return request;
        }

        private static void CopiarCamposComunes(JsonElement data, CrearTrabajoRequest request)
        {
            request.Nv = GetString(data, "nv") ?? "";
            request.Producto = GetString(data, "producto") ?? "";
            request.CodigoProducto = GetString(data, "codigoProducto");
            request.Item = GetString(data, "item") ?? "";
            request.Cliente = GetString(data, "cliente");
            request.FechaAsignacion = GetDate(data, "fechaAsignacion");
            request.TallerExternoNombre = GetString(data, "tallerExternoNombre");
            request.ProcesoNombre = GetString(data, "procesoNombre");
            request.ResponsableInternoNombre = GetString(data, "responsableInternoNombre");
            request.Prioridad = GetString(data, "prioridad") ?? "MEDIA";
            request.FechaCompromiso = GetDate(data, "fechaCompromiso");
            request.Estado = GetString(data, "estado") ?? "PENDIENTE_ASIGNACION";
            request.CantidadARevisar = GetDecimal(data, "cantidadARevisar") ?? 0;
            request.CantidadRevisadaEntregada = GetDecimal(data, "cantidadRevisadaEntregada") ?? 0;
            request.CantidadFaltanteAjusteManual = GetBool(data, "cantidadFaltanteAjusteManual");
            request.CantidadFaltanteManual = GetDecimal(data, "cantidadFaltanteManual");
            request.CantidadFaltanteJustificacion = GetString(
                data,
                "cantidadFaltanteJustificacion"
            );
            request.Observaciones = GetString(data, "observaciones");
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
