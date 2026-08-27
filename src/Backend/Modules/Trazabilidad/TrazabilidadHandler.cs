using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.PlanificacionApi;
using QualityControlCenter.Repositories.Trazabilidad;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Trazabilidad
{
    // Módulo de solo consulta (INNPACK): NP en Planificación FARET (programa-produccion, vía API,
    // sin auth) + materiales por proceso (fps-api, Tipo='INSUMO' en FPS_PRODUCCION) + paletizado
    // en registro_paletizado (LogisticControlCenter, MySQL directo). No inserta ni recalcula nada
    // — ver contex.md para el detalle de arquitectura.
    public class TrazabilidadHandler
    {
        private readonly TrazabilidadService _service;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public TrazabilidadHandler(
            DbService db,
            PlanificacionApiClient planificacionClient,
            FpsMaterialesApiService fpsMaterialesClient
        )
        {
            _service = new TrazabilidadService(
                planificacionClient,
                fpsMaterialesClient,
                new TrazabilidadRepository(db)
            );
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "trazabilidad.consultarNp")
                {
                    var jsonData = GetDataElement(data);
                    var np = GetString(jsonData, "np").Trim();

                    if (string.IsNullOrEmpty(np))
                        return Error("Debes indicar el NP a consultar");

                    var (ok, procesos, paletizado, error) = await _service.ConsultarNpAsync(np);
                    if (!ok)
                        return Error(error ?? "No se pudo consultar Planificación FARET");

                    return Ok(
                        new
                        {
                            np,
                            procesos,
                            paletizado,
                            avisoPlanificacion = error, // aviso no bloqueante (ej. API no configurada)
                        }
                    );
                }

                return Error($"Acción no reconocida: {action}");
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
            if (obj.ValueKind != JsonValueKind.Object)
                return "";

            if (!obj.TryGetProperty(prop, out var value))
                return "";

            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? "",
                JsonValueKind.Number => value.ToString(),
                _ => "",
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
